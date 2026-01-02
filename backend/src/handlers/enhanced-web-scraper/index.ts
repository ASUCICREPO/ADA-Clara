/**
 * Enhanced Web Scraper Lambda Handler
 * 
 * Entry point for enhanced web scraping operations with comprehensive AI processing
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';
import { 
  EnhancedWebScraperController,
  EnhancedDiscoverAndScrapeRequest,
  EnhancedScrapeUrlsRequest,
  EnhancedScrapeUrlRequest,
  TestEnhancedScraperRequest
} from './enhanced-web-scraper.controller';

// Initialize service container
const container = ServiceContainer.getInstance({
  region: process.env.AWS_REGION || 'us-east-1',
  
  // S3 Vectors configuration
  contentBucket: process.env.CONTENT_BUCKET,
  vectorsBucket: process.env.VECTORS_BUCKET,
  vectorIndex: process.env.VECTOR_INDEX,
  embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
  
  // Web scraper configuration
  contentTrackingTable: process.env.CONTENT_TRACKING_TABLE,
  targetDomain: process.env.TARGET_DOMAIN || 'diabetes.org',
  maxPages: parseInt(process.env.MAX_PAGES || '10'),
  rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
  
  // Path configuration
  allowedPaths: ['/about-diabetes', '/living-with-diabetes', '/tools-and-resources', '/community', '/professionals'],
  blockedPaths: ['/admin', '/login', '/api/internal', '/private', '/search']
});

const controller = new EnhancedWebScraperController(container);

/**
 * Lambda handler for enhanced web scraping operations
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Enhanced Web Scraper Lambda invoked:', {
    httpMethod: event.httpMethod,
    path: event.path,
    body: event.body ? JSON.parse(event.body) : null,
    requestId: context.awsRequestId
  });

  try {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
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
    if (event.httpMethod === 'GET' && (event.path === '/health' || event.path === '/')) {
      return await controller.healthCheck();
    }

    // Parse request body
    let requestBody: any = {};
    if (event.body) {
      try {
        requestBody = JSON.parse(event.body);
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
    }

    // Route requests based on action
    const action = requestBody.action || event.queryStringParameters?.action;

    switch (action) {
      case 'enhanced-discover-scrape':
        return await controller.handleEnhancedDiscoverAndScrape(requestBody as EnhancedDiscoverAndScrapeRequest);

      case 'enhanced-scrape-urls':
        return await controller.handleEnhancedScrapeUrls(requestBody as EnhancedScrapeUrlsRequest);

      case 'enhanced-scrape-url':
        return await controller.handleEnhancedScrapeUrl(requestBody as EnhancedScrapeUrlRequest);

      case 'test-enhanced-scraper':
        return await controller.handleTestEnhancedScraper(requestBody as TestEnhancedScraperRequest);

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
              'enhanced-discover-scrape',
              'enhanced-scrape-urls', 
              'enhanced-scrape-url',
              'test-enhanced-scraper'
            ],
            examples: {
              'enhanced-discover-scrape': {
                action: 'enhanced-discover-scrape',
                domain: 'diabetes.org',
                maxUrls: 10,
                enableContentEnhancement: true,
                enableIntelligentChunking: true,
                enableStructuredExtraction: true,
                chunkingStrategy: 'hybrid'
              },
              'enhanced-scrape-urls': {
                action: 'enhanced-scrape-urls',
                urls: [
                  'https://diabetes.org/about-diabetes/type-1',
                  'https://diabetes.org/about-diabetes/type-2'
                ],
                enableContentEnhancement: true,
                enableIntelligentChunking: true,
                chunkingStrategy: 'semantic'
              },
              'enhanced-scrape-url': {
                action: 'enhanced-scrape-url',
                url: 'https://diabetes.org/about-diabetes/type-1',
                enableContentEnhancement: true,
                enableIntelligentChunking: true,
                enableStructuredExtraction: true
              },
              'test-enhanced-scraper': {
                action: 'test-enhanced-scraper',
                testUrl: 'https://diabetes.org/about-diabetes/type-1'
              }
            }
          })
        };
    }
  } catch (error) {
    console.error('Enhanced Web Scraper Lambda error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: context.awsRequestId
      })
    };
  }
};

// Export for testing
export { controller, container };