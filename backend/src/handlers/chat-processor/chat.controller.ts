import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ChatService, FrontendChatResponse } from '../../business/chat/chat.service';
import { ChatServiceContainer } from './chat-container';

export class ChatController {
  private chatService: ChatService;

  constructor(container: ChatServiceContainer) {
    this.chatService = new ChatService(
      container.dynamoService,
      container.bedrockService,
      container.comprehendService
    );
  }

  /**
   * Handle incoming API Gateway requests
   */
  async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Chat controller invoked:', JSON.stringify(event, null, 2));

    try {
      // Normalize path - remove stage prefix if present (e.g., /prod/chat -> /chat)
      let path = event.path;
      if (path.startsWith('/prod/')) {
        path = path.replace('/prod', '');
      } else if (path.startsWith('/dev/')) {
        path = path.replace('/dev', '');
      } else if (path.startsWith('/staging/')) {
        path = path.replace('/staging', '');
      }
      
      const method = event.httpMethod;

      if (method === 'POST' && (path === '/chat' || path.endsWith('/chat'))) {
        return await this.handleChatMessage(event);
      } else if (method === 'GET' && (path === '/health' || path === '/chat/health' || path.endsWith('/health'))) {
        return await this.handleHealthCheck();
      } else if (method === 'GET' && (path === '/chat/history' || path.endsWith('/chat/history'))) {
        return await this.handleChatHistory(event);
      } else if (method === 'GET' && (path === '/chat/sessions' || path.endsWith('/chat/sessions'))) {
        return await this.handleChatSessions(event);
      } else if (method === 'OPTIONS') {
        return this.handleCorsPrelight();
      } else {
        return this.handleNotFound();
      }
    } catch (error) {
      console.error('Chat controller error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Handle chat message processing
   */
  private async handleChatMessage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: this.getCorsHeaders(),
        body: JSON.stringify({
          error: 'Request body is required',
          message: 'Please provide a chat message'
        })
      };
    }

    try {
      const request = JSON.parse(event.body);
      const result = await this.chatService.processMessage(request);

      // Transform to frontend-focused response
      const frontendResponse: FrontendChatResponse = {
        message: result.response,
        sources: result.sources,
        sessionId: result.sessionId,
        escalated: result.escalated
      };

      return {
        statusCode: 200,
        headers: {
          ...this.getCorsHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(frontendResponse)
      };
    } catch (error) {
      console.error('Chat message processing error:', error);
      
      if (error instanceof Error && error.message.includes('required')) {
        return {
          statusCode: 400,
          headers: this.getCorsHeaders(),
          body: JSON.stringify({
            error: 'Bad Request',
            message: error.message
          })
        };
      }
      
      throw error; // Re-throw for general error handling
    }
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const container = ChatServiceContainer.getInstance();
      const health = await container.healthCheck();

      // Frontend-aligned response format
      return {
        statusCode: health.overall ? 200 : 503,
        headers: {
          ...this.getCorsHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: "ADA Clara API is working!",
          timestamp: new Date().toISOString(),
          path: "/health",
          method: "GET",
          userModel: "simplified",
          status: health.overall ? 'healthy' : 'unhealthy',
          services: health.services
        })
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        statusCode: 503,
        headers: this.getCorsHeaders(),
        body: JSON.stringify({
          message: "ADA Clara API health check failed",
          timestamp: new Date().toISOString(),
          path: "/health",
          method: "GET",
          userModel: "simplified",
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * Handle chat history request
   */
  private async handleChatHistory(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const sessionId = event.queryStringParameters?.sessionId;
      
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: this.getCorsHeaders(),
          body: JSON.stringify({
            error: 'Bad Request',
            message: 'sessionId query parameter is required'
          })
        };
      }

      const history = await this.chatService.getChatHistory(sessionId);

      return {
        statusCode: 200,
        headers: {
          ...this.getCorsHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          messages: history,
          timestamp: new Date().toISOString()
        })
      };
    } catch (error) {
      console.error('Chat history error:', error);
      return {
        statusCode: 500,
        headers: this.getCorsHeaders(),
        body: JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to retrieve chat history'
        })
      };
    }
  }

  /**
   * Handle chat sessions request
   */
  private async handleChatSessions(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const limit = parseInt(event.queryStringParameters?.limit || '10');
      const sessions = await this.chatService.getChatSessions(limit);

      return {
        statusCode: 200,
        headers: {
          ...this.getCorsHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessions,
          count: sessions.length,
          timestamp: new Date().toISOString()
        })
      };
    } catch (error) {
      console.error('Chat sessions error:', error);
      return {
        statusCode: 500,
        headers: this.getCorsHeaders(),
        body: JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to retrieve chat sessions'
        })
      };
    }
  }

  /**
   * Handle CORS preflight requests
   */
  private handleCorsPrelight(): APIGatewayProxyResult {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: ''
    };
  }

  /**
   * Handle 404 Not Found
   */
  private handleNotFound(): APIGatewayProxyResult {
    return {
      statusCode: 404,
      headers: this.getCorsHeaders(),
      body: JSON.stringify({
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /chat',
          'GET /health',
          'GET /chat/history?sessionId=<sessionId>',
          'GET /chat/sessions?limit=<limit>'
        ]
      })
    };
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown): APIGatewayProxyResult {
    return {
      statusCode: 500,
      headers: this.getCorsHeaders(),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }

  /**
   * Get CORS headers
   */
  private getCorsHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    };
  }
}