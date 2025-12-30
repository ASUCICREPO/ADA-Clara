import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DataService } from '../../src/services/data-service';
import { ContextService } from '../../src/services/context-service';
import { EscalationService } from '../../src/services/escalation-service';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ComprehendClient, DetectDominantLanguageCommand } from '@aws-sdk/client-comprehend';
import { 
  UserSession, 
  ChatMessage, 
  ConversationRecord, 
  MessageRecord, 
  QuestionRecord,
  ChatRequest,
  ChatResponse,
  ConversationContext
} from '../../src/types/index';
import { validationService } from '../../src/services/validation-service';
import { cacheService } from '../../src/services/cache-service';

/**
 * ADA Clara Chat Processing Lambda Function
 * Handles user interactions, language detection, and RAG responses
 * 
 * TASK 11 ENHANCEMENTS:
 * - Enhanced conversation metadata capture
 * - Message-level confidence score tracking
 * - Question extraction and categorization
 * - Escalation trigger identification and recording
 * 
 * TASK 7.3 ENHANCEMENTS:
 * - Conversation context management
 * - Session state tracking
 * - Conversation memory integration
 */

// TASK 11: Enhanced conversation tracking
interface ConversationMetadata {
  conversationId: string;
  userId: string;
  sessionId: string;
  startTime: string;
  endTime?: string;
  language: 'en' | 'es';
  messageCount: number;
  totalConfidenceScore: number;
  averageConfidenceScore: number;
  outcome: 'resolved' | 'escalated' | 'abandoned';
  escalationReason?: string;
  escalationTimestamp?: string;
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
}

// TASK 11: Question extraction and categorization
interface ExtractedQuestion {
  question: string;
  normalizedQuestion: string;
  category: string;
  confidence: number;
  isAnswered: boolean;
  language: 'en' | 'es';
}

// TASK 11: Escalation trigger tracking
interface EscalationTrigger {
  type: 'low_confidence' | 'explicit_request' | 'repeated_question' | 'complex_query' | 'error_condition';
  confidence?: number;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class ChatProcessor {
  private dataService: DataService;
  private contextService: ContextService;
  private escalationService: EscalationService;
  private bedrockClient: BedrockRuntimeClient;
  private comprehendClient: ComprehendClient;
  
  // TASK 11: Enhanced conversation tracking
  private conversationMetadata: Map<string, ConversationMetadata> = new Map();
  private questionCategories: Map<string, string[]> = new Map();

  constructor() {
    this.dataService = new DataService();
    this.contextService = new ContextService();
    this.escalationService = new EscalationService();
    this.bedrockClient = new BedrockRuntimeClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    this.comprehendClient = new ComprehendClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    
    // TASK 11: Initialize question categories
    this.initializeQuestionCategories();
  }

  /**
   * TASK 11: Initialize question categories for classification
   */
  private initializeQuestionCategories(): void {
    this.questionCategories.set('diabetes-basics', [
      'what is diabetes', 'types of diabetes', 'diabetes definition', 'diabetes causes',
      'qué es diabetes', 'tipos de diabetes', 'definición diabetes', 'causas diabetes'
    ]);
    
    this.questionCategories.set('blood-sugar', [
      'blood sugar', 'glucose', 'blood glucose', 'sugar levels', 'a1c',
      'azúcar en sangre', 'glucosa', 'niveles de azúcar', 'hemoglobina'
    ]);
    
    this.questionCategories.set('insulin', [
      'insulin', 'insulin injection', 'insulin pump', 'insulin types',
      'insulina', 'inyección insulina', 'bomba insulina', 'tipos insulina'
    ]);
    
    this.questionCategories.set('diet-nutrition', [
      'diet', 'food', 'nutrition', 'carbs', 'carbohydrates', 'meal planning',
      'dieta', 'comida', 'nutrición', 'carbohidratos', 'planificación comidas'
    ]);
    
    this.questionCategories.set('exercise', [
      'exercise', 'physical activity', 'workout', 'sports', 'fitness',
      'ejercicio', 'actividad física', 'entrenamiento', 'deportes'
    ]);
    
    this.questionCategories.set('complications', [
      'complications', 'side effects', 'problems', 'symptoms', 'emergency',
      'complicaciones', 'efectos secundarios', 'problemas', 'síntomas', 'emergencia'
    ]);
    
    this.questionCategories.set('medication', [
      'medication', 'medicine', 'drugs', 'prescription', 'treatment',
      'medicamento', 'medicina', 'medicinas', 'receta', 'tratamiento'
    ]);
    
    this.questionCategories.set('general', [
      'help', 'information', 'support', 'resources', 'contact',
      'ayuda', 'información', 'apoyo', 'recursos', 'contacto'
    ]);
  }

  /**
   * Process incoming chat message
   * TASK 11: Enhanced with conversation metadata, question extraction, and escalation tracking
   */
  async processMessage(request: ChatRequest): Promise<ChatResponse> {
    const timestamp = new Date();
    
    // TASK 11: Validate input parameters
    if (!request.message || typeof request.message !== 'string' || request.message.trim().length === 0) {
      throw new Error('Message content is required and cannot be empty');
    }
    
    if (request.message.length > 5000) {
      throw new Error('Message content cannot exceed 5000 characters');
    }
    
    // Step 1: Detect language
    const language = await this.detectLanguage(request.message);
    
    // Step 2: Get or create session
    const session = await this.getOrCreateSession(request.sessionId, language, request.userInfo);
    
    // TASK 7.3: Get or create conversation context
    let conversationContext = await this.contextService.getConversationContext(session.sessionId);
    if (!conversationContext) {
      conversationContext = await this.contextService.createConversationContext(
        session.sessionId,
        session.userId,
        language
      );
    }
    
    // TASK 7.3: Update session state with user info if provided
    if (request.userInfo) {
      const sessionState = conversationContext.sessionState;
      sessionState.userInfo = { ...sessionState.userInfo, ...request.userInfo };
      await this.contextService.updateSessionState(session.sessionId, sessionState);
    }
    
    // TASK 11: Initialize or update conversation metadata
    const conversationId = `conv-${session.sessionId}`;
    let conversationMeta = this.conversationMetadata.get(conversationId);
    
    if (!conversationMeta) {
      conversationMeta = {
        conversationId,
        userId: session.userId || `user-${Date.now()}`,
        sessionId: session.sessionId,
        startTime: timestamp.toISOString(),
        language,
        messageCount: 0,
        totalConfidenceScore: 0,
        averageConfidenceScore: 0,
        outcome: 'resolved',
        userInfo: request.userInfo
      };
      this.conversationMetadata.set(conversationId, conversationMeta);
    }
    
    // TASK 11: Extract and categorize question
    const extractedQuestion = await this.extractAndCategorizeQuestion(request.message, language);
    
    // Step 3: Store user message with enhanced metadata
    const userMessage: Omit<ChatMessage, 'ttl'> = {
      messageId: `msg-${Date.now()}-user`,
      sessionId: session.sessionId,
      content: request.message,
      sender: 'user',
      timestamp,
      language,
      // TASK 11: Enhanced message metadata
      processingTime: 0,
      sources: []
    };
    
    await this.dataService.addChatMessage(userMessage);
    
    // TASK 7.3: Add user message to conversation memory
    await this.contextService.addToMemory(session.sessionId, {
      messageId: userMessage.messageId,
      sessionId: session.sessionId,
      conversationId,
      content: userMessage.content,
      sender: userMessage.sender,
      timestamp: userMessage.timestamp.toISOString(),
      language: userMessage.language,
      escalationTrigger: false,
      isAnswered: false
    });
    
    // TASK 11: Store message record for analytics
    const messageRecord: MessageRecord = {
      conversationId,
      messageIndex: conversationMeta.messageCount,
      timestamp: timestamp.toISOString(),
      type: 'user',
      content: request.message,
      escalationTrigger: false,
      questionCategory: extractedQuestion?.category,
      isAnswered: false, // Will be updated after bot response
      language,
      processingTime: 0
    };

    // Store user message record for analytics
    await this.dataService.recordAnalytics('chat', 'user_message', 1, {
      conversationId,
      messageIndex: messageRecord.messageIndex,
      type: 'user',
      content: request.message,
      questionCategory: extractedQuestion?.category,
      language
    });
    
    // Step 4: Generate response using mock RAG
    const processingStart = Date.now();
    const { response, confidence, sources } = await this.generateResponse(
      request.message, 
      language, 
      session.sessionId
    );
    const processingTime = Date.now() - processingStart;
    
    // TASK 11: Identify escalation triggers
    const escalationTriggers = await this.identifyEscalationTriggers(
      request.message,
      response,
      confidence,
      language,
      session.sessionId
    );
    
    // Step 5: Store bot response with enhanced metadata
    const botMessage: Omit<ChatMessage, 'ttl'> = {
      messageId: `msg-${Date.now()}-bot`,
      sessionId: session.sessionId,
      content: response,
      sender: 'bot',
      timestamp: new Date(),
      language,
      confidence,
      sources: sources.map(s => ({
        url: s.url,
        title: s.title,
        excerpt: s.excerpt,
        relevanceScore: 0.8,
        contentType: 'article' as const
      })),
      processingTime
    };
    
    await this.dataService.addChatMessage(botMessage);
    
    // TASK 7.3: Add bot message to conversation memory
    await this.contextService.addToMemory(session.sessionId, {
      messageId: botMessage.messageId,
      sessionId: session.sessionId,
      conversationId,
      content: botMessage.content,
      sender: botMessage.sender,
      timestamp: botMessage.timestamp.toISOString(),
      language: botMessage.language,
      confidence: botMessage.confidence,
      escalationTrigger: escalationTriggers.length > 0,
      isAnswered: confidence > 0.6
    });
    
    // TASK 11: Store bot message record for analytics
    const botMessageRecord: MessageRecord = {
      conversationId,
      messageIndex: conversationMeta.messageCount + 1,
      timestamp: botMessage.timestamp.toISOString(),
      type: 'bot',
      content: response,
      confidenceScore: confidence,
      escalationTrigger: escalationTriggers.length > 0,
      questionCategory: extractedQuestion?.category,
      isAnswered: confidence > 0.6, // Consider answered if confidence > 60%
      language,
      processingTime
    };

    // Store bot message record for analytics
    await this.dataService.recordAnalytics('chat', 'bot_message', 1, {
      conversationId,
      messageIndex: botMessageRecord.messageIndex,
      type: 'bot',
      content: response,
      confidenceScore: confidence,
      escalationTrigger: escalationTriggers.length > 0,
      questionCategory: extractedQuestion?.category,
      isAnswered: confidence > 0.6,
      language,
      processingTime
    });
    
    // TASK 11: Update conversation metadata
    conversationMeta.messageCount += 2; // User + bot message
    conversationMeta.totalConfidenceScore += confidence;
    conversationMeta.averageConfidenceScore = conversationMeta.totalConfidenceScore / (conversationMeta.messageCount / 2);
    conversationMeta.endTime = new Date().toISOString();
    
    // Step 6: Check for escalation
    const escalationSuggested = escalationTriggers.length > 0 || this.shouldEscalate(confidence, request.message);
    
    if (escalationSuggested) {
      conversationMeta.outcome = 'escalated';
      conversationMeta.escalationReason = escalationTriggers.map((t: EscalationTrigger) => t.message).join('; ') || 'Low confidence or complex query';
      conversationMeta.escalationTimestamp = new Date().toISOString();
      
      await this.dataService.createEscalation(
        session.sessionId,
        conversationMeta.escalationReason,
        escalationTriggers.some(t => t.severity === 'critical') ? 'high' : 'medium'
      );
      
      // TASK 11: Record escalation triggers
      await this.recordEscalationTriggers(conversationId, escalationTriggers);
    }
    
    // TASK 11: Store question record if question was detected
    if (extractedQuestion) {
      // Update question with answer status
      extractedQuestion.isAnswered = confidence > 0.6;
      await this.storeQuestionRecord(extractedQuestion, conversationId, timestamp);
    }
    
    // TASK 11: Store conversation record
    await this.storeConversationRecord(conversationMeta);
    
    // Step 7: Record analytics with enhanced metadata
    await this.dataService.recordAnalytics('chat', 'message_processed', 1, {
      language,
      confidence,
      escalated: escalationSuggested,
      sessionId: session.sessionId,
      conversationId,
      questionCategory: extractedQuestion?.category,
      processingTime,
      escalationTriggers: escalationTriggers.map(t => t.type)
    });
    
    return {
      sessionId: session.sessionId,
      response,
      confidence,
      language,
      sources,
      escalationSuggested,
      timestamp: timestamp.toISOString(),
      // TASK 11: Enhanced response metadata
      conversationMetadata: {
        messageCount: conversationMeta.messageCount,
        averageConfidence: conversationMeta.averageConfidenceScore,
        questionDetected: !!extractedQuestion,
        questionCategory: extractedQuestion?.category,
        escalationTriggers: escalationTriggers.map((t: EscalationTrigger) => t.type)
      }
    };
  }

  /**
   * Detect language using Amazon Comprehend
   */
  private async detectLanguage(text: string): Promise<'en' | 'es'> {
    try {
      const command = new DetectDominantLanguageCommand({ Text: text });
      const result = await this.comprehendClient.send(command);
      
      const dominantLanguage = result.Languages?.[0];
      
      if (dominantLanguage && dominantLanguage.Score && dominantLanguage.Score > 0.7) {
        if (dominantLanguage.LanguageCode === 'es') {
          return 'es';
        }
      }
      
      return 'en'; // Default to English
    } catch (error) {
      console.error('Language detection failed:', error);
      return 'en'; // Fallback to English
    }
  }

  /**
   * Get existing session or create new one
   */
  private async getOrCreateSession(
    sessionId?: string, 
    language: 'en' | 'es' = 'en',
    userInfo?: any
  ): Promise<UserSession> {
    if (sessionId) {
      const { session } = await this.dataService.getSessionWithMessages(sessionId);
      if (session) {
        return session;
      }
    }

    // Create new session
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newSession: Omit<UserSession, 'ttl'> = {
      sessionId: newSessionId,
      startTime: new Date(),
      language,
      escalated: false,
      messageCount: 0,
      lastActivity: new Date(),
      userInfo
    };

    return await this.dataService.createChatSession(newSession);
  }

  /**
   * Generate response using mock RAG (placeholder for real RAG implementation)
   */
  private async generateResponse(
    message: string, 
    language: 'en' | 'es',
    sessionId: string
  ): Promise<{
    response: string;
    confidence: number;
    sources: Array<{ url: string; title: string; excerpt: string; }>;
  }> {
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
          },
          {
            url: 'https://diabetes.org/living-with-diabetes',
            title: 'Viviendo con Diabetes | ADA',
            excerpt: 'Consejos y recursos para el manejo diario de la diabetes.'
          }
        ]
      } : {
        response: 'I understand you have questions about diabetes. Diabetes is a condition where your body cannot properly process blood sugar. There are two main types: Type 1 and Type 2. Would you like to learn more about a specific type or do you have questions about diabetes management?',
        sources: [
          {
            url: 'https://diabetes.org/about-diabetes',
            title: 'About Diabetes | ADA',
            excerpt: 'Comprehensive information about diabetes types and management.'
          },
          {
            url: 'https://diabetes.org/living-with-diabetes',
            title: 'Living with Diabetes | ADA',
            excerpt: 'Tips and resources for daily diabetes management.'
          }
        ]
      };

      return {
        ...responses,
        confidence: 0.9
      };
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

    return {
      ...generalResponses,
      confidence: 0.6
    };
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
   * Health check for the chat processor
   */
  async healthCheck(): Promise<{ status: string; services: any }> {
    const health = await this.dataService.healthCheck();
    
    return {
      status: health.overall ? 'healthy' : 'unhealthy',
      services: {
        dynamodb: health.dynamodb,
        s3Content: health.s3.contentBucket,
        s3Vectors: health.s3.vectorsBucket,
        bedrock: true, // Assume healthy if no errors
        comprehend: true // Assume healthy if no errors
      }
    };
  }

  /**
   * TASK 11: Extract and categorize question from user message
   */
  private async extractAndCategorizeQuestion(
    message: string, 
    language: 'en' | 'es'
  ): Promise<ExtractedQuestion | null> {
    // Simple question detection patterns
    const questionPatterns = {
      en: [
        /^(what|how|when|where|why|who|which|can|could|would|should|is|are|do|does|did)\s/i,
        /\?$/,
        /^(tell me|explain|help|show me)/i
      ],
      es: [
        /^(qué|cómo|cuándo|dónde|por qué|quién|cuál|puedo|podría|sería|debería|es|son|hace|haces|hizo)\s/i,
        /\?$/,
        /^(dime|explica|ayuda|muéstrame)/i
      ]
    };

    const patterns = questionPatterns[language];
    const isQuestion = patterns.some(pattern => pattern.test(message.trim()));

    if (!isQuestion) {
      return null;
    }

    // Normalize question for categorization
    const normalizedQuestion = message.toLowerCase().trim();
    
    // Categorize question based on keywords
    let category = 'general';
    let confidence = 0.5;

    for (const [cat, keywords] of this.questionCategories.entries()) {
      const matchCount = keywords.filter(keyword => 
        normalizedQuestion.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        const categoryConfidence = Math.min(matchCount / keywords.length, 1.0);
        if (categoryConfidence > confidence) {
          category = cat;
          confidence = categoryConfidence;
        }
      }
    }

    return {
      question: message,
      normalizedQuestion: normalizedQuestion,
      category,
      confidence,
      isAnswered: false, // Will be determined after bot response
      language
    };
  }

  /**
   * TASK 11: Identify escalation triggers in conversation
   */
  private async identifyEscalationTriggers(
    userMessage: string,
    botResponse: string,
    confidence: number,
    language: 'en' | 'es',
    sessionId: string
  ): Promise<EscalationTrigger[]> {
    const triggers: EscalationTrigger[] = [];
    const timestamp = new Date().toISOString();

    // 1. Low confidence trigger
    if (confidence < 0.4) {
      triggers.push({
        type: 'low_confidence',
        confidence,
        message: `Low confidence response: ${confidence.toFixed(2)}`,
        timestamp,
        severity: confidence < 0.2 ? 'critical' : confidence < 0.3 ? 'high' : 'medium'
      });
    }

    // 2. Explicit escalation request
    const escalationKeywords = {
      en: ['human', 'person', 'agent', 'representative', 'help me', 'speak to someone', 'transfer', 'escalate'],
      es: ['humano', 'persona', 'agente', 'representante', 'ayúdame', 'hablar con alguien', 'transferir', 'escalar']
    };

    const keywords = escalationKeywords[language];
    const hasEscalationRequest = keywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasEscalationRequest) {
      triggers.push({
        type: 'explicit_request',
        message: 'User explicitly requested human assistance',
        timestamp,
        severity: 'high'
      });
    }

    // 3. Complex query detection (long messages with multiple questions)
    if (userMessage.length > 200 && (userMessage.match(/\?/g) || []).length > 1) {
      triggers.push({
        type: 'complex_query',
        message: 'Complex multi-part question detected',
        timestamp,
        severity: 'medium'
      });
    }

    // 4. Error condition detection
    if (botResponse.toLowerCase().includes('error') || 
        botResponse.toLowerCase().includes('sorry') ||
        botResponse.toLowerCase().includes('unable')) {
      triggers.push({
        type: 'error_condition',
        message: 'Bot response indicates error or inability to help',
        timestamp,
        severity: 'medium'
      });
    }

    // 5. Check for repeated questions (simplified - would need session history in real implementation)
    // This is a placeholder for more sophisticated repeated question detection
    if (userMessage.toLowerCase().includes('again') || 
        userMessage.toLowerCase().includes('repeat') ||
        userMessage.toLowerCase().includes('otra vez') ||
        userMessage.toLowerCase().includes('repetir')) {
      triggers.push({
        type: 'repeated_question',
        message: 'User appears to be repeating a question',
        timestamp,
        severity: 'medium'
      });
    }

    return triggers;
  }

  /**
   * TASK 11: Record escalation triggers for analytics
   */
  private async recordEscalationTriggers(
    conversationId: string,
    triggers: EscalationTrigger[]
  ): Promise<void> {
    if (triggers.length === 0) return;

    try {
      // Store escalation triggers in analytics for tracking
      for (const trigger of triggers) {
        await this.dataService.recordAnalytics('escalation', 'trigger_detected', 1, {
          conversationId,
          triggerType: trigger.type,
          severity: trigger.severity,
          confidence: trigger.confidence,
          message: trigger.message,
          timestamp: trigger.timestamp
        });
      }

      console.log(`Recorded ${triggers.length} escalation triggers for conversation ${conversationId}`);
    } catch (error) {
      console.error('Failed to record escalation triggers:', error);
      // Don't throw - this is analytics data, not critical for chat flow
    }
  }

  /**
   * TASK 11: Store question record for FAQ analysis
   */
  private async storeQuestionRecord(
    extractedQuestion: ExtractedQuestion,
    conversationId: string,
    timestamp: Date
  ): Promise<void> {
    try {
      const questionHash = this.generateQuestionHash(extractedQuestion.normalizedQuestion);
      const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD

      const questionRecord: QuestionRecord = {
        questionHash,
        originalQuestion: extractedQuestion.question,
        normalizedQuestion: extractedQuestion.normalizedQuestion,
        category: extractedQuestion.category,
        date: dateStr,
        count: 1,
        totalConfidenceScore: extractedQuestion.confidence,
        averageConfidenceScore: extractedQuestion.confidence,
        answeredCount: extractedQuestion.isAnswered ? 1 : 0,
        unansweredCount: extractedQuestion.isAnswered ? 0 : 1,
        escalationCount: 0, // Will be updated if escalation occurs
        language: extractedQuestion.language,
        lastAsked: timestamp.toISOString()
      };

      // Store in Questions table (this would need to be implemented in DataService)
      // For now, store as analytics data
      await this.dataService.recordAnalytics('chat', 'question_asked', 1, {
        conversationId,
        questionHash,
        category: extractedQuestion.category,
        language: extractedQuestion.language,
        confidence: extractedQuestion.confidence,
        isAnswered: extractedQuestion.isAnswered,
        originalQuestion: extractedQuestion.question,
        normalizedQuestion: extractedQuestion.normalizedQuestion
      });

      console.log(`Stored question record for conversation ${conversationId}, category: ${extractedQuestion.category}`);
    } catch (error) {
      console.error('Failed to store question record:', error);
      // Don't throw - this is analytics data, not critical for chat flow
    }
  }

  /**
   * TASK 11: Store conversation record for analytics
   */
  private async storeConversationRecord(conversationMeta: ConversationMetadata): Promise<void> {
    try {
      const conversationRecord: ConversationRecord = {
        conversationId: conversationMeta.conversationId,
        userId: conversationMeta.userId,
        sessionId: conversationMeta.sessionId,
        startTime: conversationMeta.startTime,
        endTime: conversationMeta.endTime,
        timestamp: conversationMeta.endTime || new Date().toISOString(),
        date: conversationMeta.startTime.split('T')[0], // YYYY-MM-DD
        language: conversationMeta.language,
        messageCount: conversationMeta.messageCount,
        totalConfidenceScore: conversationMeta.totalConfidenceScore,
        averageConfidenceScore: conversationMeta.averageConfidenceScore,
        outcome: conversationMeta.outcome,
        escalationReason: conversationMeta.escalationReason,
        escalationTimestamp: conversationMeta.escalationTimestamp,
        userInfo: conversationMeta.userInfo
      };

      // Store conversation record (this would need to be implemented in DataService)
      // For now, store as analytics data
      await this.dataService.recordAnalytics('chat', 'conversation_updated', 1, {
        conversationId: conversationMeta.conversationId,
        userId: conversationMeta.userId,
        sessionId: conversationMeta.sessionId,
        language: conversationMeta.language,
        messageCount: conversationMeta.messageCount,
        averageConfidenceScore: conversationMeta.averageConfidenceScore,
        outcome: conversationMeta.outcome,
        escalationReason: conversationMeta.escalationReason
      });

      console.log(`Stored conversation record: ${conversationMeta.conversationId}, outcome: ${conversationMeta.outcome}`);
    } catch (error) {
      console.error('Failed to store conversation record:', error);
      // Don't throw - this is analytics data, not critical for chat flow
    }
  }

  /**
   * TASK 11: Generate hash for question deduplication
   */
  private generateQuestionHash(normalizedQuestion: string): string {
    // Simple hash function for question deduplication
    let hash = 0;
    for (let i = 0; i < normalizedQuestion.length; i++) {
      const char = normalizedQuestion.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get user sessions (chat history overview)
   */
  async getUserSessions(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      // Extract user ID from JWT token (simplified - in production would validate token)
      const authHeader = event.headers.Authorization || event.headers.authorization;
      if (!authHeader) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Authorization required',
            message: 'Please provide a valid JWT token'
          })
        };
      }

      // For now, return mock data - in production this would query DynamoDB
      const sessions = [
        {
          sessionId: 'session-1',
          startTime: '2024-01-15T10:00:00Z',
          lastActivity: '2024-01-15T10:30:00Z',
          messageCount: 5,
          language: 'en',
          summary: 'Questions about Type 1 diabetes management'
        },
        {
          sessionId: 'session-2', 
          startTime: '2024-01-14T14:00:00Z',
          lastActivity: '2024-01-14T14:15:00Z',
          messageCount: 3,
          language: 'en',
          summary: 'Insulin dosage questions'
        }
      ];

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({
          sessions,
          total: sessions.length
        })
      };

    } catch (error: any) {
      console.error('Get user sessions error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Failed to retrieve sessions',
          message: error.message
        })
      };
    }
  }

  /**
   * Get specific session history
   */
  async getSessionHistory(event: APIGatewayProxyEvent, sessionId: string): Promise<APIGatewayProxyResult> {
    try {
      // Extract user ID from JWT token (simplified - in production would validate token)
      const authHeader = event.headers.Authorization || event.headers.authorization;
      if (!authHeader) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Authorization required',
            message: 'Please provide a valid JWT token'
          })
        };
      }

      if (!sessionId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Session ID required',
            message: 'Please provide a valid session ID'
          })
        };
      }

      // For now, return mock data - in production this would query DynamoDB
      const messages = [
        {
          id: 'msg-1',
          sessionId,
          timestamp: '2024-01-15T10:00:00Z',
          sender: 'user',
          message: 'What is Type 1 diabetes?',
          language: 'en'
        },
        {
          id: 'msg-2',
          sessionId,
          timestamp: '2024-01-15T10:00:30Z',
          sender: 'bot',
          message: 'Type 1 diabetes is an autoimmune condition where the pancreas produces little or no insulin...',
          language: 'en',
          confidence: 0.95,
          sources: [
            {
              title: 'Understanding Type 1 Diabetes',
              url: 'https://diabetes.org/about-diabetes/type-1'
            }
          ]
        }
      ];

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({
          sessionId,
          messages,
          total: messages.length
        })
      };

    } catch (error: any) {
      console.error('Get session history error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Failed to retrieve session history',
          message: error.message
        })
      };
    }
  }
}

/**
 * Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Chat processor invoked:', JSON.stringify(event, null, 2));

  const processor = new ChatProcessor();

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Route based on path and method
    if (method === 'POST' && path === '/chat') {
      // Process chat message
      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
          },
          body: JSON.stringify({
            error: 'Request body is required'
          })
        };
      }

      const request: ChatRequest = JSON.parse(event.body);
      const response = await processor.processMessage(request);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
        },
        body: JSON.stringify(response)
      };

    } else if (method === 'GET' && path === '/chat/history') {
      // Get all user sessions
      return await processor.getUserSessions(event);

    } else if (method === 'GET' && path.startsWith('/chat/history/')) {
      // Get specific session history
      const sessionId = path.split('/').pop();
      return await processor.getSessionHistory(event, sessionId!);

    } else if (method === 'GET' && path === '/chat/sessions') {
      // Get user sessions (alias for /chat/history)
      return await processor.getUserSessions(event);

    } else if (method === 'GET' && (path === '/chat' || path === '/health')) {
      // Health check
      const health = await processor.healthCheck();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(health)
      };

    } else if (method === 'OPTIONS') {
      // CORS preflight
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
        },
        body: ''
      };

    } else {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Endpoint not found',
          availableEndpoints: [
            'POST /chat',
            'GET /chat/history',
            'GET /chat/history/{sessionId}',
            'GET /chat/sessions',
            'GET /health'
          ]
        })
      };
    }
  } catch (error) {
    console.error('Chat processor error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};