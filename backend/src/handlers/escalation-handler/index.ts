import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EscalationServiceContainer } from './escalation-container';
import { EscalationController } from './escalation.controller';

// Initialize service container
const container = EscalationServiceContainer.getInstance();
const controller = new EscalationController(container);

/**
 * Lambda handler for escalation requests
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