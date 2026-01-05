import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AdminServiceContainer } from './admin-container';
import { AnalyticsService } from '../../business/analytics/analytics.service';

export class AdminAnalyticsController {
  private analyticsService: AnalyticsService;

  constructor(private container: AdminServiceContainer) {
    this.analyticsService = new AnalyticsService(
      this.container.dynamoService
    );
  }

  /**
   * Handle incoming API Gateway requests
   */
  async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('Admin analytics controller invoked:', JSON.stringify(event, null, 2));

    try {
      const path = event.path;
      const method = event.httpMethod;

      // Authentication is handled by API Gateway Cognito Authorizer
      // The request will only reach this Lambda if the token is valid
      // We can extract user information from the request context if needed
      // event.requestContext.authorizer.claims contains user claims

      // Route requests based on path and method
      if (method === 'GET') {
        return await this.handleGetRequest(path);
      } else if (method === 'OPTIONS') {
        return this.handleOptionsRequest();
      } else {
        return this.createResponse(405, {
          error: 'Method not allowed',
          message: `${method} method is not supported`
        });
      }

    } catch (error) {
      console.error('Admin analytics controller error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }

  /**
   * Handle GET requests
   */
  private async handleGetRequest(path: string): Promise<APIGatewayProxyResult> {
    switch (path) {
      case '/admin/dashboard':
        return await this.getDashboardData();
      
      case '/admin/metrics':
        return await this.getMetrics();
      
      case '/admin/conversations/chart':
        return await this.getConversationsChart();
      
      case '/admin/language-split':
        return await this.getLanguageSplit();
      
      case '/admin/frequently-asked-questions':
        return await this.getFrequentlyAskedQuestions();
      
      case '/admin/unanswered-questions':
        return await this.getUnansweredQuestions();
      
      case '/admin/question-analytics':
        return await this.getQuestionAnalytics();
      
      case '/admin/health':
      case '/admin':
        return await this.getHealthCheck();
      
      default:
        return this.createResponse(404, {
          error: 'Endpoint not found',
          availableEndpoints: [
            'GET /admin/dashboard',
            'GET /admin/metrics',
            'GET /admin/conversations/chart',
            'GET /admin/language-split',
            'GET /admin/frequently-asked-questions',
            'GET /admin/unanswered-questions',
            'GET /admin/question-analytics',
            'GET /admin/health'
          ]
        });
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  private async getDashboardData(): Promise<APIGatewayProxyResult> {
    try {
      const dashboardData = await this.analyticsService.getDashboardData();
      return this.createResponse(200, dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get metrics data only
   */
  private async getMetrics(): Promise<APIGatewayProxyResult> {
    try {
      const metrics = await this.analyticsService.getMetrics();
      return this.createResponse(200, metrics);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get conversations chart data
   */
  private async getConversationsChart(): Promise<APIGatewayProxyResult> {
    try {
      const chartData = await this.analyticsService.getConversationsChart();
      return this.createResponse(200, chartData);
    } catch (error) {
      console.error('Error fetching conversations chart:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch conversations chart',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get language distribution data
   */
  private async getLanguageSplit(): Promise<APIGatewayProxyResult> {
    try {
      const languageData = await this.analyticsService.getLanguageSplit();
      return this.createResponse(200, languageData);
    } catch (error) {
      console.error('Error fetching language split:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch language split',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get frequently asked questions (enhanced with QuestionProcessingService)
   */
  private async getFrequentlyAskedQuestions(): Promise<APIGatewayProxyResult> {
    try {
      // Use the enhanced question processing service if available
      const dynamoService = this.analyticsService.getDynamoService();
      if (dynamoService) {
        const { QuestionProcessingService } = require('../../services/question-processing.service');
        const questionService = new QuestionProcessingService(dynamoService);
        
        // Get enhanced FAQ data (limit to 6 to match frontend expectations)
        const enhancedQuestions = await questionService.getFrequentlyAskedQuestions(6);
        
        if (enhancedQuestions.length > 0) {
          // Transform to match frontend expectations
          const questions = enhancedQuestions.map((q: any) => ({
            question: q.question,
            count: q.count
          }));
          
          return this.createResponse(200, { questions });
        }
      }

      // Fallback to original analytics service implementation
      const faqData = await this.analyticsService.getFrequentlyAskedQuestions();
      return this.createResponse(200, { questions: faqData });
    } catch (error) {
      console.error('Error fetching FAQ data:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch FAQ data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get unanswered questions (enhanced with QuestionProcessingService)
   */
  private async getUnansweredQuestions(): Promise<APIGatewayProxyResult> {
    try {
      // Use the enhanced question processing service if available
      const dynamoService = this.analyticsService.getDynamoService();
      if (dynamoService) {
        const { QuestionProcessingService } = require('../../services/question-processing.service');
        const questionService = new QuestionProcessingService(dynamoService);
        
        // Get enhanced unanswered questions data (limit to 6 to match frontend expectations)
        const enhancedQuestions = await questionService.getUnansweredQuestions(6);
        
        if (enhancedQuestions.length > 0) {
          // Transform to match frontend expectations
          const questions = enhancedQuestions.map((q: any) => ({
            question: q.question,
            count: q.count
          }));
          
          return this.createResponse(200, { questions });
        }
      }

      // Fallback to original analytics service implementation
      const unansweredData = await this.analyticsService.getUnansweredQuestions();
      return this.createResponse(200, { questions: unansweredData });
    } catch (error) {
      console.error('Error fetching unanswered questions:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch unanswered questions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get enhanced question analytics
   */
  private async getQuestionAnalytics(): Promise<APIGatewayProxyResult> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      const endDate = new Date();
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Get analytics from the enhanced question processing service
      const dynamoService = this.analyticsService.getDynamoService();
      if (dynamoService) {
        const { QuestionProcessingService } = require('../../services/question-processing.service');
        const questionService = new QuestionProcessingService(dynamoService);
        
        const analytics = await questionService.getQuestionAnalytics(startDateStr, endDateStr);
        
        return this.createResponse(200, {
          analytics,
          dateRange: {
            start: startDateStr,
            end: endDateStr
          },
          timestamp: new Date().toISOString()
        });
      } else {
        return this.createResponse(500, {
          error: 'Analytics service not properly initialized'
        });
      }
    } catch (error) {
      console.error('Error fetching question analytics:', error);
      return this.createResponse(500, {
        error: 'Failed to fetch question analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get health check
   */
  private async getHealthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const health = await this.analyticsService.healthCheck();
      return this.createResponse(200, health);
    } catch (error) {
      console.error('Error in health check:', error);
      return this.createResponse(503, {
        status: 'unhealthy',
        service: 'admin-analytics',
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify(body)
    };
  }
}