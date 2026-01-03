import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AdminServiceContainer } from './admin-container';
import { AdminAnalyticsController } from './admin-analytics.controller';

// Initialize service container
const container = AdminServiceContainer.getInstance();
const controller = new AdminAnalyticsController(container);

/**
 * Lambda handler for admin analytics
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Set Lambda context for logging
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    return await controller.handleRequest(event);
  } catch (error) {
    console.error('Lambda handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      })
    };
  }
};