import { DynamoDBService } from '../../services/dynamodb-service';
import { BedrockService } from '../../services/bedrock.service';
import { ComprehendService } from '../../services/comprehend.service';
import { QuestionProcessingService } from '../../services/question-processing.service';
import { DynamoDBKeyGenerator, QuestionRecord } from '../../types/index';

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

/**
 * Simplified response interface for frontend integration
 * Contains only the essential data needed by the UI
 */
export interface FrontendChatResponse {
  message: string;
  sources: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
  sessionId: string;
  escalated?: boolean;
}

export class ChatService {
  private readonly SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
  private readonly MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'ada-clara-messages'; // Fixed: use MESSAGES_TABLE env var
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
  private readonly QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
  
  private questionProcessingService: QuestionProcessingService;

  constructor(
    private dynamoService: DynamoDBService,
    private bedrockService: BedrockService,
    private comprehendService: ComprehendService
  ) {
    // Initialize question processing service for enhanced question handling
    this.questionProcessingService = new QuestionProcessingService(dynamoService);
  }

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
    
    // Step 6a: Modify response for escalation with more helpful message
    let finalResponse = response;
    if (escalationSuggested) {
      await this.createEscalation(session.sessionId, 'Low confidence or complex query');
      
      // Store unanswered question when chatbot shows "Talk to a person"
      await this.storeUnansweredQuestion(request.message, language, confidence);
      
      // Replace generic escalation message with more helpful one
      if (response.includes('Sorry, I am unable to assist you with this request') || 
          response.includes('Lo siento, no puedo ayudarte con esta solicitud')) {
        finalResponse = language === 'es' 
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
    }
    
    // Step 7: Update session with message count
    try {
      await this.updateSessionActivity(session.sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
      // Don't fail the chat if session update fails
    }
    
    // Step 8: Record analytics
    await this.recordAnalytics('chat', 'message_processed', {
      sessionId: session.sessionId,
      language,
      confidence,
      escalated: escalationSuggested,
      processingTime
    });
    
    // Step 8: Process question for enhanced analytics (if not escalated due to out-of-scope)
    try {
      await this.questionProcessingService.processQuestion(
        request.message,
        finalResponse,
        confidence,
        language as 'en' | 'es',
        session.sessionId,
        escalationSuggested
      );
    } catch (error) {
      console.error('Failed to process question for analytics:', error);
      // Don't fail the chat if question processing fails
    }
    
    return {
      response: finalResponse,
      confidence,
      sources,
      escalated: escalationSuggested,
      escalationSuggested,
      escalationReason: escalationSuggested ? 
        (confidence < 0.95 ? `Confidence ${(confidence * 100).toFixed(1)}% below required 95% threshold` : 'Explicit request for human assistance') 
        : undefined,
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
    
    // Get current message count for this conversation to determine messageIndex
    const existingMessages = await this.dynamoService.getMessagesByConversation(sessionId, 1000);
    const messageIndex = existingMessages.length;
    
    // Store in messages table with conversationId/messageIndex pattern
    const messageRecord = {
      conversationId: sessionId,
      messageIndex: messageIndex,
      timestamp: timestamp.toISOString(),
      type: 'user' as const,
      content: content,
      escalationTrigger: false,
      isAnswered: false, // Will be updated when bot responds
      language: language as 'en' | 'es',
      processingTime: 0
    };
    
    await this.dynamoService.createMessageRecord(messageRecord);
    
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
    
    // Get current message count for this conversation to determine messageIndex
    const existingMessages = await this.dynamoService.getMessagesByConversation(sessionId, 1000);
    const messageIndex = existingMessages.length;
    
    // Store in messages table with conversationId/messageIndex pattern
    const messageRecord = {
      conversationId: sessionId,
      messageIndex: messageIndex,
      timestamp: botMessage.timestamp,
      type: 'bot' as const,
      content: content,
      confidenceScore: confidence,
      escalationTrigger: confidence < 0.95, // Mark as escalation trigger if low confidence
      isAnswered: confidence >= 0.95, // Consider answered if high confidence
      language: language as 'en' | 'es',
      processingTime: processingTime,
      sources: sources.map(s => ({
        url: s.url,
        title: s.title,
        excerpt: s.excerpt,
        relevanceScore: 0.8,
        contentType: 'article' as const
      }))
    };
    
    await this.dynamoService.createMessageRecord(messageRecord);
    
    return botMessage;
  }

  /**
   * Generate response using RAG service integration
   */
  private async generateResponse(
    message: string, 
    language: string
  ): Promise<{ response: string; confidence: number; sources: Array<{ url: string; title: string; excerpt: string }> }> {
    try {
      // Use RAG service for knowledge base queries
      const ragRequest = {
        query: message,
        language: language as 'en' | 'es',
        maxResults: 5,
        confidenceThreshold: 0.6
      };

      const ragResponse = await this.callRAGService(ragRequest);
      
      // Use RAGAS confidence directly (no additional enhancement needed)
      console.log(`RAGAS confidence: ${(ragResponse.confidence * 100).toFixed(1)}%`);
      
      if (ragResponse.ragasMetrics) {
        console.log(`RAGAS metrics - F:${(ragResponse.ragasMetrics.faithfulness * 100).toFixed(1)}% AR:${(ragResponse.ragasMetrics.answerRelevancy * 100).toFixed(1)}% CP:${(ragResponse.ragasMetrics.contextPrecision * 100).toFixed(1)}% CR:${(ragResponse.ragasMetrics.contextRecall * 100).toFixed(1)}%`);
      }

      return {
        response: ragResponse.answer,
        confidence: ragResponse.confidence, // Use RAGAS confidence directly
        sources: ragResponse.sources.map((source: any) => ({
          url: source.url,
          title: source.title,
          excerpt: source.content ? source.content.substring(0, 200) + '...' : 'No content available'
        }))
      };

    } catch (error) {
      console.error('RAG service call failed, using fallback:', error);
      
      // Fallback to basic response with low confidence to trigger escalation
      const fallbackResponse = language === 'es'
        ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
        : 'Let me connect you with someone who can help you with that.';

      return {
        response: fallbackResponse,
        confidence: 0.3, // Low confidence to trigger escalation
        sources: []
      };
    }
  }

  /**
   * Call RAG service via Lambda function
   */
  private async callRAGService(request: any): Promise<any> {
    // Use API Gateway endpoint instead of direct Lambda invocation
    const ragEndpoint = process.env.RAG_ENDPOINT;
    
    if (!ragEndpoint) {
      throw new Error('RAG_ENDPOINT environment variable is not set');
    }
    
    try {
      console.log(`Calling RAG processor via API Gateway: ${ragEndpoint}`);
      
      // Call RAG processor via API Gateway (using native fetch in Node.js 18+)
      const response = await fetch(ragEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: request.query,
          sessionId: request.sessionId, // Only pass if provided, don't auto-generate
          language: request.language || 'en',
          maxResults: request.maxResults || 5
        })
      });
      
      if (!response.ok) {
        throw new Error(`RAG API returned status ${response.status}: ${await response.text()}`);
      }
      
      const responseText = await response.text();
      console.log(`RAG processor raw response: ${responseText.substring(0, 500)}`);
      
      const body: any = JSON.parse(responseText);
      
      console.log(`RAG processor response: ${(body.confidence * 100).toFixed(1)}% confidence`);
      console.log(`Response keys: ${Object.keys(body).join(', ')}`);
      console.log(`Answer preview: ${body.answer ? body.answer.substring(0, 100) : 'NO ANSWER'}`);
      
      return {
        answer: body.answer,
        confidence: body.confidence,
        sources: body.sources || [],
        ragasMetrics: body.ragasMetrics,
        processingTime: body.processingTime || 0
      };

    } catch (error) {
      console.error('RAG API call failed:', error);
      throw error; // Re-throw to trigger fallback in generateResponse
    }
  }

  /**
   * Enhanced confidence calculation for 95% requirement
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
    
    // Comprehensive answers get confidence boost
    if (answerLength >= 150 && answerLength <= 800) {
      enhancedConfidence += 0.02;
    }
    
    // Answers with citations get confidence boost
    if (answer.includes('diabetes.org') || answer.includes('Based on')) {
      enhancedConfidence += 0.03;
    }

    // Factor 3: Medical accuracy indicators
    const medicalTerms = [
      'diabetes', 'blood sugar', 'glucose', 'insulin', 'A1C',
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
   * Determine if escalation is needed based on 95% confidence requirement
   */
  private shouldEscalate(confidence: number, message: string): boolean {
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
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (explicitRequest) {
      console.log('Escalating due to explicit request for human assistance');
      return true;
    }
    
    return false;
  }

  /**
   * Create escalation request using enhanced service method
   */
  private async createEscalation(sessionId: string, reason: string): Promise<void> {
    try {
      const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date(); // Use Date object instead of string
      
      // Use enhanced escalation service method
      await this.dynamoService.addToEscalationQueue({
        escalationId,
        sessionId,
        status: 'pending',
        priority: 'medium',
        reason,
        userInfo: {
          // We don't have detailed user info in chat context
        },
        conversationHistory: [], // Could be populated but keeping simple for now
        createdAt: timestamp,
        updatedAt: timestamp
        // ttl is added automatically by the DynamoDB service
      });
      
      console.log(`Created escalation request: ${escalationId}`);
    } catch (error) {
      console.error('Error creating escalation:', error);
      // Don't throw - escalation failure shouldn't break chat
    }
  }

  /**
   * Update session activity and message count
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      // Get current message count
      const messages = await this.dynamoService.getMessagesByConversation(sessionId, 1000);
      const messageCount = messages.length;
      
      // Update session record
      await this.dynamoService.putItem(this.SESSIONS_TABLE, {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA',
        sessionId: sessionId,
        messageCount: messageCount,
        lastActivity: new Date().toISOString(),
        // Keep existing fields by getting the current session first
        ...(await this.getSessionData(sessionId))
      });
    } catch (error) {
      console.error('Error updating session activity:', error);
      // Don't throw - session update failure shouldn't break chat
    }
  }

  /**
   * Get current session data
   */
  private async getSessionData(sessionId: string): Promise<any> {
    try {
      const session = await this.dynamoService.getItem(this.SESSIONS_TABLE, {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      });
      return session || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Store unanswered question when chatbot shows "Talk to a person" button
   */
  private async storeUnansweredQuestion(question: string, language: string, confidence: number): Promise<void> {
    try {
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const normalizedQuestion = DynamoDBKeyGenerator.normalizeQuestion(question);
      const questionHash = DynamoDBKeyGenerator.generateQuestionHash(normalizedQuestion);
      const questionLanguage = (language === 'es' ? 'es' : 'en') as 'en' | 'es';

      const questionRecord: QuestionRecord = {
        questionHash,
        originalQuestion: question,
        normalizedQuestion,
        category: 'out-of-scope', // All unanswered questions are out-of-scope
        date,
        count: 1,
        totalConfidenceScore: confidence,
        averageConfidenceScore: confidence,
        answeredCount: 0,
        unansweredCount: 1, // This is an unanswered question
        escalationCount: 1,
        language: questionLanguage,
        lastAsked: now.toISOString()
      };

      await this.dynamoService.createOrUpdateQuestionRecord(questionRecord);
      console.log(`Stored unanswered question: ${question} (hash: ${questionHash})`);
    } catch (error) {
      console.error('Error storing unanswered question:', error);
      // Don't throw - question storage failure shouldn't break chat
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
        messageId: item.messageId || `msg-${item.messageIndex}`,
        sessionId: item.conversationId,
        content: item.content,
        sender: item.type, // Map 'type' field to 'sender' field
        timestamp: item.timestamp,
        language: item.language,
        confidence: item.confidenceScore,
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