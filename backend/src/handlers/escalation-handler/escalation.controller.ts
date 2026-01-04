import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EscalationServiceContainer } from './escalation-container';
import { EscalationService, EscalationRequest } from '../../business/escalation/escalation.service';

export class EscalationController {
  private escalationService: EscalationService;

  constructor(private container: EscalationServiceContainer) {
    this.escalationService = new EscalationService(
      this.container.dynamoService
    );
  }

  /**
   * Handle incoming API Gateway requests
   */
  async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Escalation controller invoked:', JSON.stringify(event, null, 2));

    try {
      const path = event.path;
      const method = event.httpMethod;

      // Route requests based on path and method
      if (method === 'POST') {
        return await this.handlePostRequest(path, event);
      } else if (method === 'GET') {
        return await this.handleGetRequest(path, event);
      } else if (method === 'OPTIONS') {
        return this.handleOptionsRequest();
      } else {
        return this.createResponse(405, {
          error: 'Method not allowed',
          message: `${method} method is not supported`
        });
      }

    } catch (error) {
      console.error('Escalation controller error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }

  /**
   * Handle POST requests
   */
  private async handlePostRequest(path: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    if (path === '/escalation/request' || path === '/escalation') {
      return await this.handleEscalationRequest(event);
    } else {
      return this.createResponse(404, {
        error: 'Endpoint not found',
        message: `POST ${path} is not supported`
      });
    }
  }

  /**
   * Handle GET requests
   */
  private async handleGetRequest(path: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    switch (path) {
      case '/escalation/requests':
      case '/admin/escalation-requests':
        return await this.getEscalationRequests(event);
      
      case '/escalation/health':
      case '/escalation':
        return await this.getHealthCheck();
      
      default:
        return this.createResponse(404, {
          error: 'Endpoint not found',
          availableEndpoints: [
            'POST /escalation/request',
            'GET /escalation/requests',
            'GET /escalation/health'
          ]
        });
    }
  }

  /**
   * Handle escalation request submission
   */
  private async handleEscalationRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      if (!event.body) {
        return this.createResponse(400, {
          error: 'Request body is required',
          message: 'Please provide escalation request data'
        });
      }

      let request: EscalationRequest;
      try {
        request = JSON.parse(event.body);
      } catch (parseError) {
        return this.createResponse(400, {
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        });
      }

      const escalationRecord = await this.escalationService.handleEscalationRequest(request);

      return this.createResponse(200, {
        success: true,
        message: 'Thank you! Someone from the American Diabetes Association will reach out to you shortly.',
        escalationId: escalationRecord.escalationId,
        status: escalationRecord.status
      });

    } catch (error) {
      console.error('Error handling escalation request:', error);
      
      // Return validation errors as 400 Bad Request
      if (error instanceof Error && (
        error.message.includes('required') ||
        error.message.includes('valid email') ||
        error.message.includes('format')
      )) {
        return this.createResponse(400, {
          error: 'Validation error',
          message: error.message
        });
      }

      return this.createResponse(500, {
        error: 'Failed to process escalation request',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get escalation requests for admin dashboard
   */
  private async getEscalationRequests(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const limit = event.queryStringParameters?.limit ?
        parseInt(event.queryStringParameters.limit) : 10;
      const page = event.queryStringParameters?.page ?
        parseInt(event.queryStringParameters.page) : 1;

      console.log(`[EscalationController] Received request: page=${page}, limit=${limit}, queryParams=`, event.queryStringParameters);

      // Validate limit parameter
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return this.createResponse(400, {
          error: 'Invalid limit parameter',
          message: 'Limit must be a number between 1 and 100'
        });
      }

      // Validate page parameter
      if (isNaN(page) || page < 1) {
        return this.createResponse(400, {
          error: 'Invalid page parameter',
          message: 'Page must be a number greater than 0'
        });
      }

      const result = await this.escalationService.getEscalationRequests(limit, page);
      
      console.log(`[EscalationController] Returning ${result.requests.length} requests for page ${page}, total: ${result.total}`);

      return this.createResponse(200, result);

    } catch (error) {
      console.error('Error fetching escalation requests:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch escalation requests',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get health check
   */
  private async getHealthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const health = await this.escalationService.healthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      return this.createResponse(statusCode, health);
    } catch (error) {
      console.error('Error in health check:', error);
      return this.createResponse(503, {
        status: 'unhealthy',
        service: 'escalation-handler',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle OPTIONS requests for CORS
   */
  private handleOptionsRequest(): APIGatewayProxyResult {
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
   * Create standardized API response
   */
  private createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: JSON.stringify(body)
    };
  }
}