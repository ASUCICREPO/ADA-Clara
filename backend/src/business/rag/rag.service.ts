import { BedrockService } from '../../services/bedrock.service';
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { RAGASConfidenceService, RAGASEvaluation } from './ragas-confidence.service';

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
  ragasMetrics?: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    contextRecall: number;
  };
  confidenceExplanation?: string;
}

export interface Source {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, any>;
}

export interface RAGConfig {
  knowledgeBaseId: string;
  embeddingModel: string;
  generationModel: string;
  maxResults: number;
  confidenceThreshold: number;
}

/**
 * RAG Service - Uses Bedrock Knowledge Base with RAGAS confidence scoring
 * 
 * This service uses the working Knowledge Base integration with industry-standard
 * RAGAS confidence metrics for medical AI applications.
 */
export class RAGService {
  private readonly ragasService: RAGASConfidenceService;
  private bedrockAgentClient: BedrockAgentRuntimeClient;

  constructor(
    private readonly bedrockService: BedrockService,
    private readonly config: RAGConfig
  ) {
    this.ragasService = new RAGASConfidenceService();
    this.bedrockAgentClient = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  /**
   * Process RAG query using Bedrock Knowledge Base with RAGAS confidence
   */
  async processQuery(request: RAGRequest): Promise<RAGResponse> {
    const startTime = Date.now();

    try {
      console.log(`Processing RAG query via Knowledge Base: "${request.query}"`);

      // Check if question is off-topic before processing
      const isOffTopic = this.isOffTopicQuestion(request.query);
      
      if (isOffTopic) {
        console.log('Off-topic question detected - returning redirect response');
        return this.createOffTopicResponse(request, startTime);
      }

      // Use Bedrock Knowledge Base for retrieval and generation
      const kbResponse = await this.queryKnowledgeBase(
        request.query,
        request.sessionId,
        request.maxResults || this.config.maxResults
      );

      console.log(`Knowledge Base response received`);

      // Extract answer and sources from KB response
      const answer = kbResponse.output?.text || 'I apologize, but I couldn\'t generate a response at this time.';
      const sources = this.extractSources(kbResponse);
      const retrievedContexts = this.extractContexts(kbResponse);

      // Calculate RAGAS-based confidence
      const ragasEvaluation = await this.ragasService.calculateConfidence(
        request.query,
        answer,
        retrievedContexts,
        sources
      );

      // Determine escalation suggestion based on RAGAS confidence
      const escalationSuggested = this.shouldSuggestEscalation(ragasEvaluation.confidence, request.query);

      const processingTime = Date.now() - startTime;

      console.log(`RAG processing completed in ${processingTime}ms`);
      console.log(`RAGAS Confidence: ${(ragasEvaluation.confidence * 100).toFixed(1)}%`);
      console.log(`Escalation: ${escalationSuggested ? 'YES' : 'NO'}`);

      return {
        answer,
        confidence: ragasEvaluation.confidence,
        sources,
        language: request.language || 'en',
        sessionId: request.sessionId,
        processingTime,
        escalationSuggested,
        ragasMetrics: ragasEvaluation.metrics,
        confidenceExplanation: ragasEvaluation.explanation
      };

    } catch (error) {
      console.error('RAG query processing failed:', error);
      
      // Return fallback response
      return {
        answer: request.language === 'es'
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.',
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
   * Query Bedrock Knowledge Base
   */
  private async queryKnowledgeBase(
    query: string,
    sessionId?: string,
    maxResults: number = 5
  ): Promise<any> {
    const command = new RetrieveAndGenerateCommand({
      input: {
        text: query
      },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: this.config.knowledgeBaseId,
          modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-east-1'}::foundation-model/${this.config.generationModel}`,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: maxResults,
              overrideSearchType: 'SEMANTIC' // S3 Vectors only supports SEMANTIC search
            }
          }
        }
      },
      sessionId: sessionId
    });

    return await this.bedrockAgentClient.send(command);
  }

  /**
   * Extract sources from Knowledge Base response
   */
  private extractSources(kbResponse: any): Source[] {
    const sources: Source[] = [];
    const citations = kbResponse.citations || [];

    for (const citation of citations) {
      const retrievedReferences = citation.retrievedReferences || [];
      
      for (const reference of retrievedReferences) {
        const location = reference.location?.s3Location;
        const content = reference.content?.text || '';
        
        if (location || reference.metadata) {
          sources.push({
            url: location?.uri || reference.metadata?.sourceUrl || '',
            title: reference.metadata?.title || reference.metadata?.sourceTitle || 'Diabetes Information',
            content: content,
            relevanceScore: 0.9, // KB sources are high quality
            metadata: reference.metadata || {}
          });
        }
      }
    }

    return sources;
  }

  /**
   * Extract contexts from Knowledge Base response for RAGAS
   */
  private extractContexts(kbResponse: any): string[] {
    const contexts: string[] = [];
    const citations = kbResponse.citations || [];

    for (const citation of citations) {
      const retrievedReferences = citation.retrievedReferences || [];
      
      for (const reference of retrievedReferences) {
        const content = reference.content?.text || '';
        if (content.trim().length > 0) {
          contexts.push(content);
        }
      }
    }

    // If no content in citations, use the generated response as context
    if (contexts.length === 0 && kbResponse.output?.text) {
      contexts.push(kbResponse.output.text);
    }

    return contexts;
  }

  /**
   * Determine if escalation should be suggested based on RAGAS confidence
   */
  private shouldSuggestEscalation(confidence: number, query: string): boolean {
    // Client requirement: 95% confidence threshold
    const CONFIDENCE_THRESHOLD = 0.95;
    
    // Escalate if confidence is below 95%
    if (confidence < CONFIDENCE_THRESHOLD) {
      console.log(`Escalating due to confidence ${(confidence * 100).toFixed(1)}% below required 95%`);
      return true;
    }
    
    // Also escalate for explicit requests for human help
    const escalationKeywords = [
      'human', 'person', 'agent', 'representative', 'help me', 'speak to someone',
      'humano', 'persona', 'agente', 'representante', 'ayúdame', 'hablar con alguien'
    ];
    
    const explicitRequest = escalationKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (explicitRequest) {
      console.log('Escalating due to explicit request for human assistance');
      return true;
    }
    
    return false;
  }

  /**
   * Check if a question is off-topic (not related to diabetes)
   */
  private isOffTopicQuestion(query: string): boolean {
    const queryLower = query.toLowerCase();
    
    // Diabetes-related keywords
    const diabetesKeywords = [
      'diabetes', 'diabetic', 'blood sugar', 'glucose', 'insulin', 'a1c', 'hba1c',
      'type 1', 'type 2', 'gestational', 'prediabetes', 'hyperglycemia', 'hypoglycemia',
      'pancreas', 'beta cells', 'carbohydrate', 'carbs', 'sugar', 'glycemic',
      'metformin', 'glucometer', 'blood test', 'endocrinologist'
    ];
    
    // Check if query contains diabetes-related terms
    const hasDiabetesTerms = diabetesKeywords.some(keyword => 
      queryLower.includes(keyword)
    );
    
    if (hasDiabetesTerms) {
      return false; // Not off-topic
    }
    
    // Off-topic categories
    const offTopicCategories = [
      // Weather
      ['weather', 'temperature', 'rain', 'snow', 'sunny', 'cloudy', 'forecast', 'climate'],
      // Sports
      ['football', 'basketball', 'soccer', 'baseball', 'tennis', 'golf', 'sports', 'game', 'team', 'player', 'score'],
      // Entertainment
      ['movie', 'film', 'music', 'song', 'celebrity', 'actor', 'actress', 'tv show', 'television', 'concert'],
      // Technology (non-medical)
      ['computer', 'software', 'programming', 'coding', 'app', 'website', 'internet', 'python', 'javascript', 'code'],
      // Politics
      ['president', 'election', 'politics', 'government', 'congress', 'senate', 'vote', 'political'],
      // General knowledge
      ['history', 'geography', 'math', 'science', 'physics', 'chemistry', 'biology'],
      // Food (non-diabetes related) - be careful here
      ['recipe', 'cooking', 'restaurant', 'menu'],
      // Travel
      ['vacation', 'hotel', 'flight', 'travel', 'tourism', 'trip'],
      // Shopping/Commerce
      ['buy', 'purchase', 'shopping', 'store', 'price', 'cost', 'money'],
      // General conversation
      ['hello', 'hi', 'how are you', 'good morning', 'good afternoon']
    ];
    
    // Check if query matches off-topic categories
    const isOffTopic = offTopicCategories.some(category =>
      category.some(keyword => queryLower.includes(keyword))
    );
    
    return isOffTopic;
  }

  /**
   * Create off-topic response without escalation
   */
  private createOffTopicResponse(request: RAGRequest, startTime: number): RAGResponse {
    const processingTime = Date.now() - startTime;
    
    const offTopicMessages = {
      en: "I'm sorry—I can only answer questions about information on diabetes.org. Do you have any diabetes-related questions for me?",
      es: "Lo siento, solo puedo responder preguntas sobre información en diabetes.org. ¿Tienes alguna pregunta relacionada con la diabetes para mí?"
    };
    
    const message = offTopicMessages[request.language as keyof typeof offTopicMessages] || offTopicMessages.en;
    
    return {
      answer: message,
      confidence: 0.95, // High confidence in off-topic detection
      sources: [],
      language: request.language || 'en',
      sessionId: request.sessionId,
      processingTime,
      escalationSuggested: false, // No escalation for off-topic
      ragasMetrics: {
        faithfulness: 1.0,
        answerRelevancy: 0.0, // Not relevant to user's question
        contextPrecision: 1.0, // Perfect precision (no context needed)
        contextRecall: 1.0 // Complete recall (standard response)
      },
      confidenceExplanation: 'Off-topic question detected. Providing standard redirect response to diabetes-related topics.'
    };
  }

  /**
   * Health check for RAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic Knowledge Base connectivity
      const testQuery = 'What is diabetes?';
      const command = new RetrieveAndGenerateCommand({
        input: { text: testQuery },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: this.config.knowledgeBaseId,
            modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-east-1'}::foundation-model/${this.config.generationModel}`,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 1
              }
            }
          }
        }
      });
      
      await this.bedrockAgentClient.send(command);
      return true;
    } catch (error) {
      console.error('RAG service health check failed:', error);
      return false;
    }
  }
}