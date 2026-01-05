/**
 * Web Scraper Lambda Handler
 * 
 * Entry point for web scraping operations with comprehensive AI processing
 * Supports both HTTP API Gateway requests and EventBridge scheduled events
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ServiceContainer } from '../../services/container';
import { 
  WebScraperController,
  ScrapeUrlsRequest,
  ScrapeUrlRequest,
  TestScraperRequest
} from './web-scraper.controller';

/**
 * EventBridge Event Interface
 */
interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: {
    action: string;
    domain?: string;
    urls?: string[];
    maxUrls?: number;
    forceRefresh?: boolean;
    scheduledExecution?: boolean;
    executionId?: string;
    timestamp?: string;
  };
}

// Initialize service container with comprehensive configuration
const container = ServiceContainer.getInstance({
  region: process.env.AWS_REGION || 'us-east-1',
  
  // S3 Vectors configuration
  contentBucket: process.env.CONTENT_BUCKET,
  vectorsBucket: process.env.VECTORS_BUCKET,
  vectorIndex: process.env.VECTOR_INDEX,
  embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
  
  // Web scraper configuration
  contentTrackingTable: process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking',
  targetDomain: process.env.TARGET_DOMAIN || 'diabetes.org',
  maxPages: parseInt(process.env.MAX_PAGES || '50'),
  rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
  
  // Path configuration (from environment or defaults)
  allowedPaths: (process.env.ALLOWED_PATHS || '/about-diabetes,/living-with-diabetes,/food-nutrition,/tools-and-resources,/community,/professionals').split(','),
  blockedPaths: (process.env.BLOCKED_PATHS || '/admin,/login,/api/internal,/private,/search,/cart,/checkout').split(',')
});

const controller = new WebScraperController(container);

/**
 * Lambda handler for web scraping operations
 * Supports both HTTP API Gateway requests and EventBridge scheduled events
 */
export const handler = async (
  event: any,
  context: Context
): Promise<APIGatewayProxyResult | any> => {
  console.log('Web Scraper Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Check if this is an EventBridge scheduled event
    if (event.source === 'aws.events') {
      console.log('📅 Processing scheduled EventBridge event');
      
      const eventBridgeEvent = event as EventBridgeEvent;
      const detail = eventBridgeEvent.detail;
      
      // Handle scheduled scraping with simplified processing
      let result: APIGatewayProxyResult;
      
      switch (detail.action) {
        case 'scheduled-scrape-urls':
          if (detail.urls && detail.urls.length > 0) {
            const scrapeRequest: ScrapeUrlsRequest = {
              action: 'scrape-urls',
              urls: detail.urls
            };
            result = await controller.handleScrapeUrls(scrapeRequest);
          } else {
            // Use default URLs for scheduled execution
            const scrapeRequest: ScrapeUrlsRequest = {
              action: 'scrape-urls'
            };
            result = await controller.handleScrapeUrls(scrapeRequest);
          }
          break;
          
        default:
          result = await controller.healthCheck();
      }
      
      // For EventBridge, return success/failure status with detailed information
      const eventBridgeResponse = {
        statusCode: result.statusCode,
        success: result.statusCode === 200,
        timestamp: new Date().toISOString(),
        source: 'scheduled-execution',
        executionId: detail.executionId || 'unknown',
        action: detail.action,
        result: JSON.parse(result.body)
      };
      
      console.log('EventBridge response:', JSON.stringify(eventBridgeResponse, null, 2));
      
      // Log success/failure for CloudWatch metrics
      if (eventBridgeResponse.success) {
        console.log(`SUCCESS: Scheduled execution completed successfully`);
      } else {
        console.error(`ERROR: Scheduled execution failed with status ${result.statusCode}`);
      }
      
      return eventBridgeResponse;
    }

    // Handle HTTP API Gateway requests
    console.log('Processing HTTP API Gateway request');
    
    const apiEvent = event as APIGatewayProxyEvent;
    // Handle CORS preflight requests
    if (apiEvent.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: ''
      };
    }

    // Handle health check requests
    if (apiEvent.httpMethod === 'GET' && (apiEvent.path === '/health' || apiEvent.path === '/')) {
      return await controller.healthCheck();
    }

    // Parse request body
    let requestBody: any = {};
    if (apiEvent.body) {
      try {
        requestBody = JSON.parse(apiEvent.body);
      } catch (error) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Invalid JSON in request body',
            details: error instanceof Error ? error.message : 'Unknown error'
          })
        };
      }
    } else {
      // Support direct event body (for testing)
      requestBody = event;
    }

    // Route requests based on action
    const action = requestBody.action || apiEvent.queryStringParameters?.action;

    switch (action) {
      case 'scrape-urls':
        return await controller.handleScrapeUrls(requestBody as ScrapeUrlsRequest);

      case 'scrape-single':
        return await controller.handleScrapeUrl(requestBody as ScrapeUrlRequest);

      case 'test-scraper':
        return await controller.handleTestScraper(requestBody as TestScraperRequest);

      case 'health':
        return await controller.healthCheck();

      default:
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Invalid or missing action parameter',
            supportedActions: [
              'scrape-urls', 'scrape-single',
              'test-scraper', 'health'
            ],
            examples: {
              'scrape-urls': {
                action: 'scrape-urls',
                urls: [
                  'https://diabetes.org/about-diabetes/type-1',
                  'https://diabetes.org/about-diabetes/type-2'
                ]
              },
              'scrape-single': {
                action: 'scrape-single',
                url: 'https://diabetes.org/about-diabetes/type-1'
              },
              'test-scraper': {
                action: 'test-scraper',
                testUrl: 'https://diabetes.org/about-diabetes/type-1'
              }
            }
          })
        };
    }
  } catch (error) {
    console.error('Web Scraper handler error:', error);
    
    const errorResponse = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };

    // For EventBridge events, return error status in EventBridge format
    if (event.source === 'aws.events') {
      const eventBridgeErrorResponse = {
        statusCode: 500,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        source: 'scheduled-execution',
        executionId: event.detail?.executionId || 'unknown'
      };
      
      console.error(`ERROR: Scheduled execution failed:`, JSON.stringify(eventBridgeErrorResponse, null, 2));
      
      return eventBridgeErrorResponse;
    }

    return errorResponse;
  }
};

// Export for testing
export { controller, container };