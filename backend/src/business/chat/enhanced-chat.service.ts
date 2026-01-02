import { DynamoDBService } from '../../core/services/dynamodb.service';
import { BedrockService } from '../../core/services/bedrock.service';
import { ComprehendService } from '../../core/services/comprehend.service';
import { RAGService, RAGRequest, RAGResponse } from '../rag/rag.service';

export interface ChatMessage {
  messageId: string;
  sessionId: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  language: string;
  confidence?: number;
  sources?: Array<{
    url: string;
    title: string;
    excerpt: string;
    relevanceScore?: number;
    contentType?: string;
  }>;
  processingTime?: number;
  escalationTriggered?: boolean;
  escalationReason?: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  userInfo?: Record<string, any>;
}

export interface ChatResponse {
  response: string;
  confidence: number;
  sources: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
  escalated: boolean;
  escalationSuggested: boolean;
  escalationReason?: string;
  sessionId: string;
  language: string;
  timestamp: string;
  meetsConfidenceThreshold: boolean;
  confidenceThreshold: number;
}

/**
 * Enhanced Chat Service with 95% Confidence Requirement
 * 
 * This service implements strict confidence requirements where responses
 * must meet a 95% confidence threshold or trigger escalation to human agents.
 */
export class EnhancedChatService {
  private readonly SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
  private readonly MESSAGES_TABLE = process.env.CONVERSATIONS_TABLE || 'ada-clara-conversations';
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
  
  // Client requirement: 95% confidence threshold
  private readonly CONFIDENCE_THRESHOLD = 0.95;
  private readonly FALLBACK_CONFIDENCE_THRESHOLD = 0.85; // For partial responses

  constructor(
    private dynamoService: DynamoDBService,
    private bedrockService: BedrockService,
    private comprehendService: ComprehendService,
    private ragService: RAGService
  ) {}

  /**
   * Process incoming chat message with 95% confidence requirement
   */
  async processMessage(request: ChatRequest): Promise<ChatResponse> {
    const timestamp = new Date();
    
    // Validate input
    this.validateRequest(request);
    
    // Step 1: Detect language
    const language = await this.detectLanguage(request.message);
    
    // Step 2: Get or create session
    const session = await this.getOrCreateSession(request.sessionId, language, request.userInfo);
    
    // Step 3: Store user message
    await this.storeUserMessage(session.sessionId, request.message, language, timestamp);
    
    // Step 4: Generate response using RAG service
    const processingStart = Date.now();
    const ragResponse = await this.generateRAGResponse(request.message, language, session.sessionId);
    const processingTime = Date.now() - processingStart;
    
    // Step 5: Evaluate confidence and determine response strategy
    const responseStrategy = this.determineResponseStrategy(ragResponse);
    
    // Step 6: Create final response based on strategy
    const finalResponse = await this.createFinalResponse(
      ragResponse, 
      responseStrategy, 
      language, 
      session.sessionId
    );
    
    // Step 7: Store bot response
    await this.storeBotMessage(
      session.sessionId,
      finalResponse.response,
      language,
      finalResponse.confidence,
      finalResponse.sources,
      processingTime,
      finalResponse.escalated,
      finalResponse.escalationReason
    );
    
    // Step 8: Handle escalation if needed
    if (finalResponse.escalated) {
      await this.createEscalation(
        session.sessionId, 
        finalResponse.escalationReason || 'Confidence below required threshold'
      );
    }
    
    // Step 9: Record analytics
    await this.recordAnalytics('chat', 'message_processed', {
      sessionId: session.sessionId,
      language,
      confidence: finalResponse.confidence,
      meetsThreshold: finalResponse.meetsConfidenceThreshold,
      escalated: finalResponse.escalated,
      processingTime,
      strategy: responseStrategy
    });
    
    return {
      ...finalResponse,
      sessionId: session.sessionId,
      language,
      timestamp: timestamp.toISOString(),
      confidenceThreshold: this.CONFIDENCE_THRESHOLD
    };
  }

  /**
   * Generate response using RAG service
   */
  private async generateRAGResponse(
    message: string, 
    language: string, 
    sessionId: string
  ): Promise<RAGResponse> {
    try {
      const ragRequest: RAGRequest = {
        query: message,
        language: language as 'en' | 'es',
        sessionId,
        maxResults: 5,
        confidenceThreshold: this.CONFIDENCE_THRESHOLD
      };

      return await this.ragService.processQuery(ragRequest);
    } catch (error) {
      console.error('RAG service failed:', error);
      
      // Return low-confidence fallback
      return {
        answer: language === 'es'
          ? 'Lo siento, no pude procesar tu pregunta correctamente. Un representante humano te ayudará.'
          : 'I\'m sorry, I couldn\'t process your question properly. A human representative will help you.',
        confidence: 0.1,
        sources: [],
        language,
        sessionId,
        processingTime: 0,
        escalationSuggested: true
      };
    }
  }

  /**
   * Determine response strategy based on confidence levels
   */
  private determineResponseStrategy(ragResponse: RAGResponse): 'high_confidence' | 'partial_confidence' | 'escalate' {
    if (ragResponse.confidence >= this.CONFIDENCE_THRESHOLD) {
      return 'high_confidence';
    } else if (ragResponse.confidence >= this.FALLBACK_CONFIDENCE_THRESHOLD) {
      return 'partial_confidence';
    } else {
      return 'escalate';
    }
  }

  /**
   * Create final response based on strategy
   */
  private async createFinalResponse(
    ragResponse: RAGResponse,
    strategy: 'high_confidence' | 'partial_confidence' | 'escalate',
    language: string,
    sessionId: string
  ): Promise<{
    response: string;
    confidence: number;
    sources: Array<{ url: string; title: string; excerpt: string }>;
    escalated: boolean;
    escalationSuggested: boolean;
    escalationReason?: string;
    meetsConfidenceThreshold: boolean;
  }> {
    
    switch (strategy) {
      case 'high_confidence':
        // Confidence meets 95% threshold - provide full response
        return {
          response: ragResponse.answer,
          confidence: ragResponse.confidence,
          sources: ragResponse.sources.map(s => ({
            url: s.url,
            title: s.title,
            excerpt: s.content.substring(0, 200) + '...'
          })),
          escalated: false,
          escalationSuggested: false,
          meetsConfidenceThreshold: true
        };

      case 'partial_confidence':
        // Confidence between 85-95% - provide partial response with escalation option
        const partialResponse = language === 'es'
          ? `Basándome en la información disponible: ${ragResponse.answer}\n\n⚠️ Para obtener información más específica y personalizada, te recomiendo hablar con uno de nuestros especialistas. ¿Te gustaría que te conecte con un representante humano?`
          : `Based on available information: ${ragResponse.answer}\n\n⚠️ For more specific and personalized information, I recommend speaking with one of our specialists. Would you like me to connect you with a human representative?`;

        return {
          response: partialResponse,
          confidence: ragResponse.confidence,
          sources: ragResponse.sources.map(s => ({
            url: s.url,
            title: s.title,
            excerpt: s.content.substring(0, 200) + '...'
          })),
          escalated: false,
          escalationSuggested: true,
          escalationReason: `Confidence ${(ragResponse.confidence * 100).toFixed(1)}% below required 95% threshold`,
          meetsConfidenceThreshold: false
        };

      case 'escalate':
        // Confidence below 85% - immediate escalation
        const escalationResponse = language === 'es'
          ? 'No tengo suficiente información confiable para responder tu pregunta adecuadamente. Te voy a conectar con un especialista humano que podrá ayudarte mejor. Un representante se pondrá en contacto contigo pronto.'
          : 'I don\'t have enough reliable information to properly answer your question. I\'m connecting you with a human specialist who can help you better. A representative will contact you soon.';

        return {
          response: escalationResponse,
          confidence: ragResponse.confidence,
          sources: [],
          escalated: true,
          escalationSuggested: true,
          escalationReason: `Confidence ${(ragResponse.confidence * 100).toFixed(1)}% significantly below required 95% threshold`,
          meetsConfidenceThreshold: false
        };

      default:
        throw new Error('Invalid response strategy');
    }
  }

  /**
   * Enhanced confidence calculation with multiple factors
   */
  private enhanceConfidenceScore(
    baseConfidence: number,
    sources: Array<{ relevanceScore: number; metadata: Record<string, any> }>,
    answer: string
  ): number {
    let enhancedConfidence = baseConfidence;

    // Factor 1: Source quality and relevance
    if (sources.length > 0) {
      const avgRelevance = sources.reduce((sum, s) => sum + s.relevanceScore, 0) / sources.length;
      
      // High relevance sources boost confidence
      if (avgRelevance > 0.9) enhancedConfidence += 0.05;
      else if (avgRelevance > 0.8) enhancedConfidence += 0.02;
      
      // Multiple high-quality sources boost confidence
      const highQualitySources = sources.filter(s => s.relevanceScore > 0.85).length;
      if (highQualitySources >= 3) enhancedConfidence += 0.03;
    }

    // Factor 2: Answer characteristics
    const answerLength = answer.length;
    
    // Comprehensive answers (but not too long) get confidence boost
    if (answerLength >= 150 && answerLength <= 800) {
      enhancedConfidence += 0.02;
    }
    
    // Answers with citations get confidence boost
    if (answer.includes('diabetes.org') || answer.includes('Source')) {
      enhancedConfidence += 0.03;
    }

    // Factor 3: Medical accuracy indicators
    const medicalTerms = [
      'diabetes', 'blood sugar', 'glucose', 'insulin', 'hemoglobin A1C',
      'type 1', 'type 2', 'gestational', 'prediabetes'
    ];
    
    const medicalTermCount = medicalTerms.filter(term => 
      answer.toLowerCase().includes(term.toLowerCase())
    ).length;
    
    if (medicalTermCount >= 2) enhancedConfidence += 0.02;

    // Factor 4: Uncertainty indicators (reduce confidence)
    const uncertaintyPhrases = [
      'might be', 'could be', 'possibly', 'maybe', 'not sure',
      'I think', 'probably', 'it seems'
    ];
    
    const uncertaintyCount = uncertaintyPhrases.filter(phrase =>
      answer.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    
    if (uncertaintyCount > 0) {
      enhancedConfidence -= uncertaintyCount * 0.05;
    }

    // Ensure confidence stays within bounds
    return Math.max(0.1, Math.min(1.0, enhancedConfidence));
  }

  /**
   * Validate chat request
   */
  private validateRequest(request: ChatRequest): void {
    if (!request.message || typeof request.message !== 'string' || request.message.trim().length === 0) {
      throw new Error('Message content is required and cannot be empty');
    }
    
    if (request.message.length > 5000) {
      throw new Error('Message content cannot exceed 5000 characters');
    }
  }

  /**
   * Detect language using Comprehend
   */
  private async detectLanguage(text: string): Promise<string> {
    try {
      const result = await this.comprehendService.detectLanguage(text);
      return result.languageCode;
    } catch (error) {
      console.error('Language detection failed:', error);
      return 'en'; // Default to English
    }
  }

  /**
   * Get existing session or create new one
   */
  private async getOrCreateSession(
    sessionId?: string, 
    language: string = 'en', 
    userInfo?: Record<string, any>
  ): Promise<{ sessionId: string; startTime: string; language: string; escalated: boolean; messageCount: number; lastActivity: string }> {
    if (sessionId) {
      try {
        const existingSession = await this.dynamoService.getItem(this.SESSIONS_TABLE, { 
          PK: `SESSION#${sessionId}`,
          SK: 'METADATA'
        });
        if (existingSession) {
          return {
            sessionId: existingSession.sessionId,
            startTime: existingSession.startTime,
            language: existingSession.language,
            escalated: existingSession.escalated,
            messageCount: existingSession.messageCount,
            lastActivity: existingSession.lastActivity
          };
        }
      } catch (error) {
        console.log('Session not found, creating new one:', error);
      }
    }
    
    // Create new session
    const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newSession = {
      sessionId: newSessionId,
      startTime: new Date().toISOString(),
      language,
      escalated: false,
      messageCount: 0,
      lastActivity: new Date().toISOString(),
      userInfo,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    };
    
    await this.dynamoService.putItem(this.SESSIONS_TABLE, {
      PK: `SESSION#${newSessionId}`,
      SK: 'METADATA',
      ...newSession
    });
    
    return newSession;
  }

  /**
   * Store user message
   */
  private async storeUserMessage(
    sessionId: string, 
    content: string, 
    language: string, 
    timestamp: Date
  ): Promise<void> {
    const userMessage = {
      conversationId: sessionId,
      timestamp: timestamp.toISOString(),
      messageId: `msg-${Date.now()}-user`,
      sessionId,
      content,
      sender: 'user',
      language,
      processingTime: 0,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    await this.dynamoService.putItem(this.MESSAGES_TABLE, userMessage);
  }

  /**
   * Store bot message with enhanced metadata
   */
  private async storeBotMessage(
    sessionId: string,
    content: string,
    language: string,
    confidence: number,
    sources: Array<{ url: string; title: string; excerpt: string }>,
    processingTime: number,
    escalated: boolean = false,
    escalationReason?: string
  ): Promise<void> {
    const botMessage = {
      conversationId: sessionId,
      timestamp: new Date().toISOString(),
      messageId: `msg-${Date.now()}-bot`,
      sessionId,
      content,
      sender: 'bot',
      language,
      confidence,
      sources: sources.map(s => ({
        ...s,
        relevanceScore: 0.8,
        contentType: 'article'
      })),
      processingTime,
      escalationTriggered: escalated,
      escalationReason,
      meetsConfidenceThreshold: confidence >= this.CONFIDENCE_THRESHOLD,
      confidenceThreshold: this.CONFIDENCE_THRESHOLD,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    await this.dynamoService.putItem(this.MESSAGES_TABLE, botMessage);
  }

  /**
   * Create escalation request with enhanced metadata
   */
  private async createEscalation(sessionId: string, reason: string): Promise<void> {
    try {
      const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.dynamoService.putItem(this.ESCALATION_TABLE, {
        escalationId,
        sessionId,
        reason,
        status: 'pending',
        priority: 'high', // High priority for confidence-based escalations
        timestamp: new Date().toISOString(),
        source: 'confidence_threshold',
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
      });
    } catch (error) {
      console.error('Error creating escalation:', error);
    }
  }

  /**
   * Record analytics with confidence tracking
   */
  private async recordAnalytics(category: string, action: string, metadata: Record<string, any>): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      await this.dynamoService.putItem(this.ANALYTICS_TABLE, {
        PK: `ANALYTICS#${category}`,
        SK: `${timestamp}#${action}`,
        analyticsId: `${category}-${action}-${Date.now()}`,
        category,
        action,
        timestamp,
        metadata: {
          ...metadata,
          confidenceThreshold: this.CONFIDENCE_THRESHOLD,
          confidenceCategory: this.categorizeConfidence(metadata.confidence)
        },
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
      });
    } catch (error) {
      console.error('Error recording analytics:', error);
    }
  }

  /**
   * Categorize confidence for analytics
   */
  private categorizeConfidence(confidence: number): string {
    if (confidence >= 0.95) return 'high_confidence';
    if (confidence >= 0.85) return 'medium_confidence';
    if (confidence >= 0.70) return 'low_confidence';
    return 'very_low_confidence';
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const result = await this.dynamoService.queryItems(
        this.MESSAGES_TABLE,
        'conversationId = :sessionId',
        { ':sessionId': sessionId },
        {
          scanIndexForward: true,
          limit: 100
        }
      );

      return result.map((item: any) => ({
        messageId: item.messageId,
        sessionId: item.sessionId,
        content: item.content,
        sender: item.sender,
        timestamp: item.timestamp,
        language: item.language,
        confidence: item.confidence,
        sources: item.sources,
        processingTime: item.processingTime,
        escalationTriggered: item.escalationTriggered,
        escalationReason: item.escalationReason
      }));
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Get confidence statistics for monitoring
   */
  async getConfidenceStatistics(timeRange: 'day' | 'week' | 'month' = 'day'): Promise<{
    totalMessages: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    veryLowConfidence: number;
    escalationRate: number;
    averageConfidence: number;
  }> {
    try {
      // This would need to be implemented based on your analytics requirements
      // For now, return mock data structure
      return {
        totalMessages: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        veryLowConfidence: 0,
        escalationRate: 0,
        averageConfidence: 0
      };
    } catch (error) {
      console.error('Error getting confidence statistics:', error);
      throw error;
    }
  }
}