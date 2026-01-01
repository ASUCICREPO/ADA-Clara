import { BedrockService } from '../../core/services/bedrock.service';
import { S3VectorsService, VectorSearchRequest } from '../../core/services/s3-vectors.service';

export interface RAGRequest {
  query: string;
  language?: 'en' | 'es';
  sessionId?: string;
  maxResults?: number;
  confidenceThreshold?: number;
}

export interface RAGResponse {
  answer: string;
  confidence: number;
  sources: Source[];
  language: string;
  sessionId?: string;
  processingTime: number;
  escalationSuggested: boolean;
}

export interface Source {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, any>;
}

export interface VectorSearchResult {
  vectorId: string;
  score: number;
  metadata: Record<string, any>;
}

export interface RAGConfig {
  vectorsBucket: string;
  vectorIndex: string;
  embeddingModel: string;
  generationModel: string;
  maxResults: number;
  confidenceThreshold: number;
}

/**
 * RAG Service - Handles Retrieval-Augmented Generation processing
 * 
 * This service orchestrates the RAG pipeline:
 * 1. Generate query embeddings
 * 2. Perform semantic search in S3 Vectors
 * 3. Retrieve source content
 * 4. Generate contextual responses using Bedrock
 * 5. Calculate confidence and escalation suggestions
 */
export class RAGService {
  constructor(
    private readonly bedrockService: BedrockService,
    private readonly s3VectorsService: S3VectorsService,
    private readonly config: RAGConfig
  ) {}

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
        request.maxResults || this.config.maxResults
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

    } catch (error) {
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

  /**
   * Generate embedding for the user query
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const result = await this.bedrockService.generateEmbedding(query, this.config.embeddingModel);
      
      return result.embedding;
    } catch (error) {
      console.error('❌ Failed to generate query embedding:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Perform semantic search using S3 Vectors
   */
  private async performSemanticSearch(
    queryEmbedding: number[], 
    maxResults: number = 5
  ): Promise<VectorSearchResult[]> {
    try {
      const searchRequest: VectorSearchRequest = {
        bucketName: this.config.vectorsBucket,
        indexName: this.config.vectorIndex,
        queryVector: queryEmbedding,
        maxResults,
        filter: {
          // Optional: Add metadata filters for content type, language, etc.
          language: 'en'
        }
      };

      const searchResult = await this.s3VectorsService.searchVectors(searchRequest);

      return searchResult.vectors.map((vector) => ({
        vectorId: vector.id,
        score: vector.score,
        metadata: vector.metadata || {}
      }));
    } catch (error) {
      console.error('❌ Semantic search failed:', error);
      throw new Error('Semantic search failed');
    }
  }

  /**
   * Retrieve full content for vector results
   */
  private async retrieveSourceContent(vectorResults: VectorSearchResult[]): Promise<Source[]> {
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
  private async generateResponse(
    query: string, 
    sources: Source[], 
    language: string = 'en'
  ): Promise<{ answer: string; confidence: number }> {
    try {
      // Prepare context from sources
      const context = sources.map((source, index) => 
        `Source ${index + 1} (${source.title}):\n${source.content}\nURL: ${source.url}\n`
      ).join('\n---\n');

      // Create prompt for response generation
      const prompt = this.createRAGPrompt(query, context, language);

      const response = await this.bedrockService.generateText(prompt, this.config.generationModel, {
        maxTokens: 1000,
        temperature: 0.1
      });

      const answer = response;

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
    if (confidence < (this.config.confidenceThreshold || 0.6)) return true;

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
   * Health check for RAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic embedding generation
      await this.generateQueryEmbedding('test query');
      
      // Test S3 Vectors connectivity
      await this.s3VectorsService.healthCheck();
      
      return true;
    } catch (error) {
      console.error('RAG service health check failed:', error);
      return false;
    }
  }
}