import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';
import { S3VectorsController } from './s3-vectors.controller';

// Initialize service container
const container = ServiceContainer.getInstance({
  region: process.env.AWS_REGION,
  contentBucket: process.env.CONTENT_BUCKET,
  vectorsBucket: process.env.VECTORS_BUCKET,
  vectorIndex: process.env.VECTOR_INDEX,
  embeddingModel: process.env.EMBEDDING_MODEL,
  maxPages: parseInt(process.env.MAX_URLS || '5')
});

// Initialize controller
const controller = new S3VectorsController(container);

/**
 * Lambda handler for S3 Vectors operations - matches working implementation
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('🚀 S3 Vectors Scraper started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Parse request body (matches working implementation)
    const body = event.body ? JSON.parse(event.body) : event;
    const action = body.action || 'test-scraper';

    // Route to appropriate controller method (matches working implementation)
    switch (action) {
      case 'test-scraper':
        return await controller.handleTestScraper();
        
      case 'manual-crawl':
        return await controller.handleManualCrawl(body);
        
      case 'test-single-url':
        return await controller.handleTestSingleUrl(body);
        
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
            supportedActions: ['test-scraper', 'manual-crawl', 'test-single-url', 'health']
          })
        };
    }
  } catch (error) {
    console.error('Handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      })
    };
  }
};