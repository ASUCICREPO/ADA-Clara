import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ChatServiceContainer } from './chat-container';
import { ChatController } from './chat.controller';

// Initialize minimal service container for chat
const container = ChatServiceContainer.getInstance({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Initialize controller
const controller = new ChatController(container);

/**
 * Lambda handler for chat processing
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  return controller.handleRequest(event);
};