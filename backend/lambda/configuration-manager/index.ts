import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ConfigurationService, ScheduleConfiguration } from '../../src/services/configuration-service';

/**
 * Configuration Manager Lambda Function
 * 
 * Handles configuration management requests for the weekly crawler scheduling system.
 * Provides REST API endpoints for:
 * - Getting current configuration
 * - Updating configuration with validation
 * - Getting configuration history
 * - Resetting to defaults
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

interface ConfigurationRequest {
  action: 'get' | 'update' | 'history' | 'reset' | 'validate';
  configuration?: Partial<ScheduleConfiguration>;
  userId?: string;
  reason?: string;
  limit?: number;
}

const configurationService = new ConfigurationService();

export const handler: Handler<APIGatewayProxyEvent, APIGatewayProxyResult> = async (event) => {
  console.log('Configuration Manager Lambda invoked:', JSON.stringify(event, null, 2));

  try {
    // Handle different HTTP methods and paths
    const method = event.httpMethod;
    const path = event.path;
    const body = event.body ? JSON.parse(event.body) : {};
    const queryParams = event.queryStringParameters || {};

    // Extract user information from headers or context
    const userId = event.headers?.['x-user-id'] || event.requestContext?.identity?.userArn || 'system';
    
    let result: any;

    switch (method) {
      case 'GET':
        if (path.endsWith('/current')) {
          // Get current configuration
          result = await configurationService.getCurrentConfiguration();
        } else if (path.endsWith('/defaults')) {
          // Get default configuration
          result = configurationService.getDefaultConfiguration();
        } else if (path.endsWith('/history')) {
          // Get configuration history
          const limit = parseInt(queryParams.limit || '50');
          result = await configurationService.getConfigurationHistory(limit);
        } else {
          return createErrorResponse(400, 'Invalid GET endpoint');
        }
        break;

      case 'POST':
        if (path.endsWith('/update')) {
          // Update configuration
          if (!body.configuration) {
            return createErrorResponse(400, 'Configuration object required');
          }
          
          result = await configurationService.updateConfiguration(
            body.configuration,
            userId,
            body.reason
          );
        } else if (path.endsWith('/validate')) {
          // Validate configuration
          if (!body.configuration) {
            return createErrorResponse(400, 'Configuration object required');
          }
          
          result = configurationService.validateConfiguration(body.configuration);
        } else if (path.endsWith('/reset')) {
          // Reset to defaults
          result = await configurationService.resetToDefaults(userId, body.reason);
        } else {
          return createErrorResponse(400, 'Invalid POST endpoint');
        }
        break;

      default:
        return createErrorResponse(405, 'Method not allowed');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-User-Id',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Configuration Manager error:', error);
    
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
};

/**
 * Handle direct Lambda invocation (non-API Gateway)
 */
const directInvocationHandler: Handler = async (event: ConfigurationRequest) => {
  console.log('Configuration Manager direct invocation:', JSON.stringify(event, null, 2));

  try {
    let result: any;

    switch (event.action) {
      case 'get':
        result = await configurationService.getCurrentConfiguration();
        break;

      case 'update':
        if (!event.configuration) {
          throw new Error('Configuration object required for update action');
        }
        result = await configurationService.updateConfiguration(
          event.configuration,
          event.userId,
          event.reason
        );
        break;

      case 'history':
        result = await configurationService.getConfigurationHistory(event.limit || 50);
        break;

      case 'reset':
        result = await configurationService.resetToDefaults(event.userId, event.reason);
        break;

      case 'validate':
        if (!event.configuration) {
          throw new Error('Configuration object required for validate action');
        }
        result = configurationService.validateConfiguration(event.configuration);
        break;

      default:
        throw new Error(`Invalid action: ${event.action}`);
    }

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Configuration Manager direct invocation error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
};

function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-User-Id',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    })
  };
}

// Export both handlers for different use cases
export { handler as apiHandler, directInvocationHandler as directHandler };