import { Handler } from 'aws-lambda';

interface CrawlerEvent {
  action: 'test' | 'test-crawl' | 'full-crawl' | 'process-content' | 'create-embeddings';
}

export const handler: Handler = async (event: CrawlerEvent) => {
  console.log('Simple S3 Vectors Test Event:', JSON.stringify(event, null, 2));
  
  try {
    switch (event.action) {
      case 'test':
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'S3 Vectors Lambda function is working!',
            timestamp: new Date().toISOString(),
            event
          })
        };
      
      default:
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Action not implemented yet',
            action: event.action,
            timestamp: new Date().toISOString()
          })
        };
    }
  } catch (error) {
    console.error('S3 Vectors Test Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};