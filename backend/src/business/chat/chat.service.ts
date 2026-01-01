import { DynamoDBService } from '../../core/services/dynamodb.service';
import { BedrockService } from '../../core/services/bedrock.service';
import { ComprehendService } from '../../core/services/comprehend.service';

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
}

export interface ChatSession {
  sessionId: string;
  startTime: string;
  language: string;
  escalated: boolean;
  messageCount: number;
  lastActivity: string;
  userInfo?: Record<string, any>;
  ttl?: number;
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
}

export class ChatService {
  private readonly SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
  private readonly MESSAGES_TABLE = process.env.CONVERSATIONS_TABLE || 'ada-clara-conversations';
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';

  constructor(
    private dynamoService: DynamoDBService,
    private bedrockService: BedrockService,
    private comprehendService: ComprehendService
  ) {}

  /**
   * Process incoming chat message
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
    const userMessage = await this.storeUserMessage(session.sessionId, request.message, language, timestamp);
    
    // Step 4: Generate response
    const processingStart = Date.now();
    const { response, confidence, sources } = await this.generateResponse(request.message, language);
    const processingTime = Date.now() - processingStart;
    
    // Step 5: Store bot response
    const botMessage = await this.storeBotMessage(
      session.sessionId, 
      response, 
      language, 
      confidence, 
      sources, 
      processingTime
    );
    
    // Step 6: Check for escalation
    const escalationSuggested = this.shouldEscalate(confidence, request.message);
    
    if (escalationSuggested) {
      await this.createEscalation(session.sessionId, 'Low confidence or complex query');
    }
    
    // Step 7: Record analytics
    await this.recordAnalytics('chat', 'message_processed', {
      sessionId: session.sessionId,
      language,
      confidence,
      escalated: escalationSuggested,
      processingTime
    });
    
    return {
      response,
      confidence,
      sources,
      escalated: escalationSuggested,
      escalationSuggested,
      escalationReason: escalationSuggested ? 'Low confidence or complex query' : undefined,
      sessionId: session.sessionId,
      language,
      timestamp: timestamp.toISOString()
    };
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
    const result = await this.comprehendService.detectLanguage(text);
    return result.languageCode;
  }

  /**
   * Get existing session or create new one
   */
  private async getOrCreateSession(
    sessionId?: string, 
    language: string = 'en', 
    userInfo?: Record<string, any>
  ): Promise<ChatSession> {
    if (sessionId) {
      try {
        // Use PK/SK pattern for chat-sessions table
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
            lastActivity: existingSession.lastActivity,
            userInfo: existingSession.userInfo,
            ttl: existingSession.ttl
          } as ChatSession;
        }
      } catch (error) {
        console.log('Session not found, creating new one:', error);
      }
    }
    
    // Create new session
    const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newSession: ChatSession = {
      sessionId: newSessionId,
      startTime: new Date().toISOString(),
      language,
      escalated: false,
      messageCount: 0,
      lastActivity: new Date().toISOString(),
      userInfo,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    };
    
    // Store with PK/SK pattern
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
  ): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      messageId: `msg-${Date.now()}-user`,
      sessionId,
      content,
      sender: 'user',
      timestamp: timestamp.toISOString(),
      language,
      processingTime: 0
    };
    
    // Store in conversations table with conversationId/timestamp pattern
    await this.dynamoService.putItem(this.MESSAGES_TABLE, {
      conversationId: sessionId,
      timestamp: timestamp.toISOString(),
      messageId: userMessage.messageId,
      sessionId: userMessage.sessionId,
      content: userMessage.content,
      sender: userMessage.sender,
      language: userMessage.language,
      processingTime: userMessage.processingTime,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    });
    
    return userMessage;
  }

  /**
   * Store bot message
   */
  private async storeBotMessage(
    sessionId: string,
    content: string,
    language: string,
    confidence: number,
    sources: Array<{ url: string; title: string; excerpt: string }>,
    processingTime: number
  ): Promise<ChatMessage> {
    const botMessage: ChatMessage = {
      messageId: `msg-${Date.now()}-bot`,
      sessionId,
      content,
      sender: 'bot',
      timestamp: new Date().toISOString(),
      language,
      confidence,
      sources: sources.map(s => ({
        ...s,
        relevanceScore: 0.8,
        contentType: 'article'
      })),
      processingTime
    };
    
    // Store in conversations table with conversationId/timestamp pattern
    await this.dynamoService.putItem(this.MESSAGES_TABLE, {
      conversationId: sessionId,
      timestamp: botMessage.timestamp,
      messageId: botMessage.messageId,
      sessionId: botMessage.sessionId,
      content: botMessage.content,
      sender: botMessage.sender,
      language: botMessage.language,
      confidence: botMessage.confidence,
      sources: botMessage.sources,
      processingTime: botMessage.processingTime,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    });
    
    return botMessage;
  }

  /**
   * Generate response using mock RAG (placeholder for real implementation)
   */
  private async generateResponse(
    message: string, 
    language: string
  ): Promise<{ response: string; confidence: number; sources: Array<{ url: string; title: string; excerpt: string }> }> {
    // Mock diabetes-related responses based on common patterns
    const diabetesKeywords = [
      'diabetes', 'blood sugar', 'glucose', 'insulin', 'type 1', 'type 2',
      'diabético', 'azúcar en sangre', 'glucosa', 'insulina', 'tipo 1', 'tipo 2'
    ];
    
    const hasKeywords = diabetesKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasKeywords) {
      // High confidence diabetes-related response
      const responses = language === 'es' ? {
        response: 'Entiendo que tienes preguntas sobre la diabetes. La diabetes es una condición donde el cuerpo no puede procesar adecuadamente el azúcar en sangre. Hay dos tipos principales: Tipo 1 y Tipo 2. ¿Te gustaría saber más sobre algún tipo específico o tienes preguntas sobre el manejo de la diabetes?',
        sources: [
          {
            url: 'https://diabetes.org/about-diabetes',
            title: 'Acerca de la Diabetes | ADA',
            excerpt: 'Información completa sobre los tipos de diabetes y su manejo.'
          }
        ]
      } : {
        response: 'I understand you have questions about diabetes. Diabetes is a condition where your body cannot properly process blood sugar. There are two main types: Type 1 and Type 2. Would you like to learn more about a specific type or do you have questions about diabetes management?',
        sources: [
          {
            url: 'https://diabetes.org/about-diabetes',
            title: 'About Diabetes | ADA',
            excerpt: 'Comprehensive information about diabetes types and management.'
          }
        ]
      };
      
      return { ...responses, confidence: 0.9 };
    }
    
    // Medium confidence general health response
    const generalResponses = language === 'es' ? {
      response: 'Gracias por tu pregunta. Aunque me especializo en información sobre diabetes, puedo ayudarte con preguntas generales de salud. Para obtener la información más precisa y personalizada, te recomiendo consultar con un profesional de la salud. ¿Hay algo específico sobre diabetes en lo que pueda ayudarte?',
      sources: [
        {
          url: 'https://diabetes.org/resources',
          title: 'Recursos de Diabetes | ADA',
          excerpt: 'Recursos y herramientas para el cuidado de la diabetes.'
        }
      ]
    } : {
      response: 'Thank you for your question. While I specialize in diabetes information, I can help with general health questions. For the most accurate and personalized information, I recommend consulting with a healthcare professional. Is there something specific about diabetes I can help you with?',
      sources: [
        {
          url: 'https://diabetes.org/resources',
          title: 'Diabetes Resources | ADA',
          excerpt: 'Resources and tools for diabetes care and management.'
        }
      ]
    };
    
    return { ...generalResponses, confidence: 0.6 };
  }

  /**
   * Determine if escalation is needed
   */
  private shouldEscalate(confidence: number, message: string): boolean {
    // Escalate if confidence is very low
    if (confidence < 0.4) {
      return true;
    }
    
    // Escalate for explicit requests for human help
    const escalationKeywords = [
      'human', 'person', 'agent', 'representative', 'help me', 'speak to someone',
      'humano', 'persona', 'agente', 'representante', 'ayúdame', 'hablar con alguien'
    ];
    
    return escalationKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Create escalation request
   */
  private async createEscalation(sessionId: string, reason: string): Promise<void> {
    try {
      const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.dynamoService.putItem(this.ESCALATION_TABLE, {
        escalationId,
        sessionId,
        reason,
        status: 'pending',
        timestamp: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      });
    } catch (error) {
      console.error('Error creating escalation:', error);
      // Don't throw - escalation failure shouldn't break chat
    }
  }

  /**
   * Record analytics data
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
        metadata,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
      });
    } catch (error) {
      console.error('Error recording analytics:', error);
      // Don't throw - analytics failure shouldn't break chat
    }
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
          scanIndexForward: true, // Sort by timestamp ascending
          limit: 100 // Limit to last 100 messages
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
        processingTime: item.processingTime
      }));
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Get list of chat sessions
   */
  async getChatSessions(limit: number = 10): Promise<ChatSession[]> {
    try {
      // Scan sessions table with PK prefix filter
      const result = await this.dynamoService.scanItems(
        this.SESSIONS_TABLE,
        {
          filterExpression: 'begins_with(PK, :pk)',
          expressionAttributeValues: { ':pk': 'SESSION#' },
          limit: limit
        }
      );

      return result.map((item: any) => ({
        sessionId: item.sessionId,
        startTime: item.startTime,
        language: item.language,
        escalated: item.escalated,
        messageCount: item.messageCount,
        lastActivity: item.lastActivity,
        userInfo: item.userInfo,
        ttl: item.ttl
      }));
    } catch (error) {
      console.error('Error getting chat sessions:', error);
      return [];
    }
  }
}