import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DataService } from './src/services/data-service';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ComprehendClient, DetectDominantLanguageCommand } from '@aws-sdk/client-comprehend';
import { UserSession, ChatMessage } from './src/types/index';

/**
 * ADA Clara Chat Processing Lambda Function
 * Handles user interactions, language detection, and RAG responses
 */

interface ChatRequest {
  sessionId?: string;
  message: string;
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
}

interface ChatResponse {
  sessionId: string;
  response: string;
  confidence: number;
  language: 'en' | 'es';
  sources?: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
  escalationSuggested: boolean;
  timestamp: string;
}

class ChatProcessor {
  private dataService: DataService;
  private bedrockClient: BedrockRuntimeClient;
  private comprehendClient: ComprehendClient;

  constructor() {
    this.dataService = new DataService();
    this.bedrockClient = new BedrockRuntimeClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    this.comprehendClient = new ComprehendClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  /**
   * Process incoming chat message
   */
  async processMessage(request: ChatRequest): Promise<ChatResponse> {
    const timestamp = new Date();
    
    // Step 1: Detect language
    const language = await this.detectLanguage(request.message);
    
    // Step 2: Get or create session
    const session = await this.getOrCreateSession(request.sessionId, language, request.userInfo);
    
    // Step 3: Store user message
    const userMessage: Omit<ChatMessage, 'ttl'> = {
      messageId: `msg-${Date.now()}-user`,
      sessionId: session.sessionId,
      content: request.message,
      sender: 'user',
      timestamp,
      language
    };
    
    await this.dataService.addChatMessage(userMessage);
    
    // Step 4: Generate response using mock RAG (since S3 Vectors is blocked)
    const { response, confidence, sources } = await this.generateResponse(
      request.message, 
      language, 
      session.sessionId
    );
    
    // Step 5: Store bot response
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
      }))
    };
    
    await this.dataService.addChatMessage(botMessage);
    
    // Step 6: Check for escalation
    const escalationSuggested = this.shouldEscalate(confidence, request.message);
    
    if (escalationSuggested) {
      await this.dataService.createEscalation(
        session.sessionId,
        'Low confidence response or complex query detected',
        confidence < 0.3 ? 'high' : 'medium'
      );
    }
    
    // Step 7: Record analytics
    await this.dataService.recordAnalytics('chat', 'message_processed', 1, {
      language,
      confidence,
      escalated: escalationSuggested,
      sessionId: session.sessionId
    });
    
    return {
      sessionId: session.sessionId,
      response,
      confidence,
      language,
      sources,
      escalationSuggested,
      timestamp: timestamp.toISOString()
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
    // Handle different HTTP methods
    switch (event.httpMethod) {
      case 'POST':
        // Process chat message
        if (!event.body) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
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
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
          },
          body: JSON.stringify(response)
        };

      case 'GET':
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

      case 'OPTIONS':
        // CORS preflight
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
          },
          body: ''
        };

      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Method not allowed'
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