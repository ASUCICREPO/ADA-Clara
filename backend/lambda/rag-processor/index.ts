/**
 * RAG Query Processing Lambda
 * 
 * This Lambda function implements RAG (Retrieval-Augmented Generation) query processing
 * for the ADA Clara chatbot system. It integrates with:
 * - S3 Vectors for semantic search
 * - Amazon Bedrock for response generation
 * - Source citation and metadata preservation
 * 
 * Requirements: 1.4, 2.5 (>95% accuracy, source citations)
 */

import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';
import { 
  S3VectorsClient,
  SearchCommand,
  GetVectorCommand
} from '@aws-sdk/client-s3vectors';

interface RAGRequest {
  query: string;
  language?: 'en' | 'es';
  sessionId?: string;
  maxResults?: number;
  confidenceThreshold?: number;
}

interface RAGResponse {
  answer: string;
  confidence: number;
  sources: Source[];
  language: string;
  sessionId?: string;
  processingTime: number;
  escalationSuggested: boolean;
}

interface Source {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, any>;
}

interface VectorSearchResult {
  vectorId: string;
  score: number;
  metadata: Record<string, any>;
}

class RAGProcessor {
  private bedrockClient: BedrockRuntimeClient;
  private s3VectorsClient: S3VectorsClient;
  private vectorsBucket: string;
  private vectorIndex: string;
  private embeddingModel: string;
  private generationModel: string;

  constructor() {
    this.bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
    this.s3VectorsClient = new S3VectorsClient({ region: 'us-east-1' });
    
    this.vectorsBucket = process.env.VECTORS_BUCKET!;
    this.vectorIndex = process.env.VECTOR_INDEX!;
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0';
    this.generationModel = process.env.GENERATION_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0';
  }

  /**
   * Generate embedding for the user query
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const command = new InvokeModelCommand({
        modelId: this.embeddingModel,
        body: JSON.stringify({
          inputText: query,
          dimensions: 1024,
          normalize: true
        })
      });

      const response = await this.bedrockClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      
      return result.embedding;
    } catch (error) {
      console.error('❌ Failed to generate query embedding:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Perform semantic search using S3 Vectors
   */
  async performSemanticSearch(queryEmbedding: number[], maxResults: number = 5): Promise<VectorSearchResult[]> {
    try {
      const command = new SearchCommand({
        VectorBucketName: this.vectorsBucket,
        IndexName: this.vectorIndex,
        QueryVector: queryEmbedding,
        K: maxResults,
        Filter: {
          // Optional: Add metadata filters for content type, language, etc.
          language: 'en'
        }
      });

      const response = await this.s3VectorsClient.send(command);
      
      return (response.Vectors || []).map(vector => ({
        vectorId: vector.VectorId!,
        score: vector.Score!,
        metadata: vector.Metadata || {}
      }));
    } catch (error) {
      console.error('❌ Semantic search failed:', error);
      throw new Error('Semantic search failed');
    }
  }

  /**
   * Retrieve full content for vector results
   */
  async retrieveSourceContent(vectorResults: VectorSearchResult[]): Promise<Source[]> {
    const sources: Source[] = [];

    for (const result of vectorResults) {
      try {
        // Extract content from metadata or retrieve from S3 if needed
        const metadata = result.metadata;
        
        const source: Source = {
          url: metadata.url || metadata.sourceUrl || '',
          title: metadata.title || 'Diabetes Information',
          content: metadata.content || metadata.text || '',
          relevanceScore: result.score,
          metadata: metadata
        };

        // Ensure we have meaningful content
        if (source.content && source.content.length > 50) {
          sources.push(source);
        }
      } catch (error) {
        console.error(`❌ Failed to retrieve content for vector ${result.vectorId}:`, error);
        // Continue with other sources
      }
    }

    return sources;
  }

  /**
   * Generate response using retrieved context
   */
  async generateResponse(query: string, sources: Source[], language: string = 'en'): Promise<{ answer: string; confidence: number }> {
    try {
      // Prepare context from sources
      const context = sources.map((source, index) => 
        `Source ${index + 1} (${source.title}):\n${source.content}\nURL: ${source.url}\n`
      ).join('\n---\n');

      // Create prompt for response generation
      const prompt = this.createRAGPrompt(query, context, language);

      const command = new InvokeModelCommand({
        modelId: this.generationModel,
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      const response = await this.bedrockClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      
      const answer = result.content[0].text;
      
      // Calculate confidence based on source relevance and answer quality
      const confidence = this.calculateConfidence(sources, answer);
      
      return { answer, confidence };
    } catch (error) {
      console.error('❌ Response generation failed:', error);
      throw new Error('Response generation failed');
    }
  }

  /**
   * Create RAG prompt for response generation
   */
  private createRAGPrompt(query: string, context: string, language: string): string {
    const languageInstruction = language === 'es' 
      ? 'Responde en español.' 
      : 'Respond in English.';

    return `You are ADA Clara, an AI assistant for the American Diabetes Association. Your role is to provide accurate, helpful information about diabetes based on the provided context from diabetes.org.

INSTRUCTIONS:
1. ${languageInstruction}
2. Answer the user's question using ONLY the information provided in the context below
3. If the context doesn't contain enough information to answer the question, say so clearly
4. Always cite your sources by mentioning the source URLs when relevant
5. Be empathetic and supportive, as users may be dealing with health concerns
6. Keep responses concise but comprehensive
7. If the question requires medical advice beyond general information, recommend consulting a healthcare provider

CONTEXT FROM DIABETES.ORG:
${context}

USER QUESTION: ${query}

RESPONSE:`;
  }

  /**
   * Calculate confidence score based on source relevance and answer quality
   */
  private calculateConfidence(sources: Source[], answer: string): number {
    if (sources.length === 0) return 0.1;
    
    // Base confidence on source relevance scores
    const avgRelevance = sources.reduce((sum, source) => sum + source.relevanceScore, 0) / sources.length;
    
    // Adjust based on answer characteristics
    let confidence = avgRelevance;
    
    // Boost confidence if answer contains citations
    if (answer.includes('diabetes.org') || answer.includes('Source')) {
      confidence += 0.1;
    }
    
    // Reduce confidence if answer is too short or contains uncertainty phrases
    if (answer.length < 100) {
      confidence -= 0.2;
    }
    
    if (answer.includes('I don\'t know') || answer.includes('not enough information')) {
      confidence -= 0.3;
    }
    
    // Ensure confidence is between 0 and 1
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Determine if escalation should be suggested
   */
  private shouldSuggestEscalation(confidence: number, query: string): boolean {
    // Suggest escalation if confidence is low
    if (confidence < 0.6) return true;
    
    // Suggest escalation for medical advice keywords
    const medicalAdviceKeywords = [
      'should i take', 'medication', 'dosage', 'treatment plan',
      'doctor', 'physician', 'medical advice', 'diagnosis',
      'emergency', 'urgent', 'pain', 'symptoms getting worse'
    ];
    
    const queryLower = query.toLowerCase();
    return medicalAdviceKeywords.some(keyword => queryLower.includes(keyword));
  }

  /**
   * Process RAG query end-to-end
   */
  async processQuery(request: RAGRequest): Promise<RAGResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Processing RAG query: "${request.query}"`);
      
      // Step 1: Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(request.query);
      console.log('✅ Generated query embedding');
      
      // Step 2: Perform semantic search
      const vectorResults = await this.performSemanticSearch(
        queryEmbedding, 
        request.maxResults || 5
      );
      console.log(`✅ Found ${vectorResults.length} relevant sources`);
      
      // Step 3: Retrieve source content
      const sources = await this.retrieveSourceContent(vectorResults);
      console.log(`✅ Retrieved content for ${sources.length} sources`);
      
      // Step 4: Generate response
      const { answer, confidence } = await this.generateResponse(
        request.query, 
        sources, 
        request.language || 'en'
      );
      console.log(`✅ Generated response with confidence: ${confidence.toFixed(2)}`);
      
      // Step 5: Determine escalation suggestion
      const escalationSuggested = this.shouldSuggestEscalation(confidence, request.query);
      
      const processingTime = Date.now() - startTime;
      
      return {
        answer,
        confidence,
        sources,
        language: request.language || 'en',
        sessionId: request.sessionId,
        processingTime,
        escalationSuggested
      };
      
    } catch (error: any) {
      console.error('❌ RAG query processing failed:', error);
      
      // Return fallback response
      return {
        answer: request.language === 'es' 
          ? 'Lo siento, no pude procesar tu pregunta en este momento. Por favor, intenta de nuevo o contacta a nuestro equipo de soporte.'
          : 'I\'m sorry, I couldn\'t process your question at this time. Please try again or contact our support team.',
        confidence: 0.1,
        sources: [],
        language: request.language || 'en',
        sessionId: request.sessionId,
        processingTime: Date.now() - startTime,
        escalationSuggested: true
      };
    }
  }
}

/**
 * Lambda handler
 */
export const handler: Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('🚀 RAG Query Processing Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Parse request
    const body = event.body ? JSON.parse(event.body) : event;
    const request: RAGRequest = {
      query: body.query,
      language: body.language || 'en',
      sessionId: body.sessionId,
      maxResults: body.maxResults || 5,
      confidenceThreshold: body.confidenceThreshold || 0.6
    };

    // Validate request
    if (!request.query || request.query.trim().length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Query is required',
          message: 'Please provide a valid query'
        })
      };
    }

    // Process RAG query
    const processor = new RAGProcessor();
    const response = await processor.processQuery(request);

    // Check if response meets accuracy requirements (>95% = confidence > 0.95)
    const meetsAccuracyRequirement = response.confidence > 0.95;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...response,
        meetsAccuracyRequirement,
        metadata: {
          vectorsBucket: process.env.VECTORS_BUCKET,
          vectorIndex: process.env.VECTOR_INDEX,
          embeddingModel: process.env.EMBEDDING_MODEL,
          generationModel: process.env.GENERATION_MODEL,
          processingTimeMs: response.processingTime
        }
      })
    };

  } catch (error: any) {
    console.error('❌ RAG processing failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message,
        message: 'RAG query processing failed'
      })
    };
  }
};
</content>
</invoke>