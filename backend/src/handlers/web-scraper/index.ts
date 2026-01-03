import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ServiceContainer } from '../../services/container';
import { WebScraperController } from './web-scraper.controller';

/**
 * EventBridge Event Interface
 */
interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: {
    action: string;
    urls?: string[];
    forceRefresh?: boolean;
    scheduledExecution?: boolean;
    executionId?: string;
    timestamp?: string;
  };
}

// Initialize service container
const container = ServiceContainer.getInstance({
  region: process.env.AWS_REGION,
  // Web scraper specific configuration
  contentBucket: process.env.CONTENT_BUCKET,
  contentTrackingTable: process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking',
  targetDomain: process.env.TARGET_DOMAIN || 'diabetes.org',
  maxPages: parseInt(process.env.MAX_PAGES || '10'),
  rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
  allowedPaths: (process.env.ALLOWED_PATHS || '/about-diabetes,/living-with-diabetes,/tools-and-resources,/community,/professionals').split(','),
  blockedPaths: (process.env.BLOCKED_PATHS || '/admin,/login,/api/internal,/private').split(',')
});

// Initialize controller
const controller = new WebScraperController(container);

/**
 * Lambda handler for Web Scraper operations
 * Supports both HTTP API Gateway requests and EventBridge scheduled events
 */
export const handler = async (
  event: any,
  context?: Context
): Promise<APIGatewayProxyResult | any> => {
  console.log('🕷️ ADA Clara Web Scraper started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Check if this is an EventBridge scheduled event
    if (event.source === 'aws.events') {
      console.log('📅 Processing scheduled EventBridge event');
      
      const eventBridgeEvent = event as EventBridgeEvent;
      const detail = eventBridgeEvent.detail;
      
      // Handle scheduled scraping
      const request = {
        action: 'scrape-urls' as const,
        urls: detail.urls,
        forceRefresh: detail.forceRefresh || false
      };
      
      console.log('EventBridge request:', JSON.stringify(request, null, 2));
      
      let result: APIGatewayProxyResult;
      
      switch (request.action) {
        case 'scrape-urls':
          result = await controller.handleScrapeUrls(request);
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
        action: request.action,
        result: JSON.parse(result.body)
      };
      
      console.log('EventBridge response:', JSON.stringify(eventBridgeResponse, null, 2));
      
      // Log success/failure for CloudWatch metrics
      if (eventBridgeResponse.success) {
        console.log(`✅ SUCCESS: Scheduled execution completed successfully`);
      } else {
        console.error(`❌ ERROR: Scheduled execution failed with status ${result.statusCode}`);
      }
      
      return eventBridgeResponse;
    }

    // Handle HTTP API Gateway requests (existing logic)
    console.log('🌐 Processing HTTP API Gateway request');
    
    // Parse request body (matches working implementation)
    const apiEvent = event as APIGatewayProxyEvent;
    const body = apiEvent.body ? JSON.parse(apiEvent.body) : event;
    const action = body.action || 'scrape-urls';

    console.log('HTTP request action:', action);

    // Route to appropriate controller method (matches working implementation)
    switch (action) {
      case 'discover-domain':
        return await controller.handleDiscoverDomain(body);
        
      case 'scrape-urls':
        return await controller.handleScrapeUrls(body);
        
      case 'scrape-single':
        return await controller.handleScrapeSingle(body);
        
      case 'test-scraper':
        return await controller.handleTestScraper(body);
        
      case 'check-content-changes':
        return await controller.handleCheckContentChanges(body);
        
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
            error: 'Unknown action',
            supportedActions: ['discover-domain', 'scrape-urls', 'scrape-single', 'test-scraper', 'check-content-changes', 'health']
          })
        };
    }
  } catch (error) {
    console.error('❌ Web scraper handler error:', error);
    
    const errorResponse = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
        timestamp: new Date().toISOString()
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
      
      console.error(`❌ ERROR: Scheduled execution failed:`, JSON.stringify(eventBridgeErrorResponse, null, 2));
      
      return eventBridgeErrorResponse;
    }

    return errorResponse;
  }
};