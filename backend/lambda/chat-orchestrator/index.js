/**
 * Chat Orchestrator Lambda
 * API Gateway entry point - starts Step Functions workflow
 *
 * Responsibilities:
 * - Parse API Gateway request
 * - Start Step Functions execution (Express Workflow - synchronous)
 * - Wait for result and return response to user
 * - Handle CORS and health checks
 */

const { SFNClient, StartSyncExecutionCommand } = require('@aws-sdk/client-sfn');

const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'us-west-2' });
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

exports.handler = async (event) => {
  console.log('Chat orchestrator invoked:', JSON.stringify(event, null, 2));

  try {
    // Support both HTTP API (v2) and REST API (v1) formats
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    // Handle health check
    if (method === 'GET' && path.includes('/health')) {
      return createResponse(200, {
        status: 'healthy',
        service: 'chat-orchestrator',
        timestamp: new Date().toISOString()
      }, event);
    }

    // Handle OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
      return createResponse(200, '', event);
    }

    // Parse request
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
        message: 'Please provide a chat message'
      }, event);
    }

    let request;
    try {
      request = JSON.parse(event.body);
    } catch (parseError) {
      return createResponse(400, {
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      }, event);
    }

    // Start Step Functions execution (Express Workflow - synchronous)
    const input = {
      message: request.message,
      sessionId: request.sessionId || null,
      userInfo: request.userInfo || {}
    };

    console.log('Starting Step Functions execution with input:', JSON.stringify(input));

    const command = new StartSyncExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      input: JSON.stringify(input)
    });

    const result = await sfnClient.send(command);

    // Check execution status
    if (result.status === 'SUCCEEDED') {
      const output = JSON.parse(result.output);
      console.log('Step Functions execution succeeded');

      // Extract response from Step Functions output
      return createResponse(output.statusCode || 200, output.body, event);

    } else {
      console.error('Step Functions execution failed:', result.status, result.cause);

      return createResponse(500, {
        error: 'Failed to process chat message',
        message: result.cause || 'Unknown error occurred'
      }, event);
    }

  } catch (error) {
    console.error('Chat orchestrator error:', error);

    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    }, event);
  }
};

/**
 * Create standardized API response with CORS
 */
function createResponse(statusCode, body, event) {
  // Get origin from request headers (normalize by removing trailing slash)
  let origin = event?.headers?.origin || event?.headers?.Origin || '*';
  if (origin !== '*' && origin.endsWith('/')) {
    origin = origin.slice(0, -1);
  }

  // Allowed origins (normalized - no trailing slashes)
  const allowedOrigins = [
    ...(FRONTEND_URL ? [FRONTEND_URL.replace(/\/$/, '')] : []),
    'http://localhost:3000',
    'https://localhost:3000'
  ].filter(Boolean);

  // Determine CORS origin
  let corsOrigin;
  if (allowedOrigins.length === 0) {
    corsOrigin = origin !== '*' ? origin : 'http://localhost:3000';
  } else {
    corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Credentials': 'true'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}
