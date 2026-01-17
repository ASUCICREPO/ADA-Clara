/**
 * Analytics Processor Lambda
 * Async analytics and data processing
 *
 * Responsibilities:
 * - Update session activity
 * - Record analytics events
 * - Handle GET endpoints (history, sessions, config)
 *
 * Invocation:
 * - Async from chat-handler (fire and forget)
 * - Sync from API Gateway for GET endpoints
 */

const { DynamoDBClient, PutItemCommand, ScanCommand, QueryCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const DATA_TABLE = process.env.DATA_TABLE; // Consolidated data table
const FRONTEND_URL = process.env.FRONTEND_URL || '';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Chat data processor invoked:', JSON.stringify(event, null, 2));

  try {
    // Check if this is an async event from chat-handler (has sessionId, userMessage, etc.)
    if (event.sessionId && event.userMessage && !event.httpMethod && !event.requestContext) {
      return await processChatAnalytics(event);
    }

    // Otherwise, handle as API Gateway request (GET endpoints)
    // Support both REST API (path, httpMethod) and HTTP API v2 (rawPath, requestContext.http.method)
    const path = event.rawPath || event.path || '';
    const method = event.requestContext?.http?.method || event.httpMethod;

    if (method === 'GET' && (path === '/config' || path.endsWith('/config'))) {
      return await handleConfig(event);
    } else if (method === 'GET' && (path === '/chat/history' || path.endsWith('/chat/history'))) {
      return await handleChatHistory(event);
    } else if (method === 'GET' && (path === '/chat/sessions' || path.endsWith('/chat/sessions'))) {
      return await handleChatSessions(event);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /config',
          'GET /chat/history?sessionId=<sessionId>',
          'GET /chat/sessions?limit=<limit>'
        ]
      });
    }

  } catch (error) {
    console.error('Chat data processor error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    });
  }
};

/**
 * Process chat analytics (invoked async from chat-handler)
 */
async function processChatAnalytics(event) {
  console.log('Processing chat analytics...');

  try {
    const {
      sessionId,
      userMessage,
      botResponse,
      confidence,
      processingTime,
      language: detectedLanguage,
      escalationSuggested
    } = event;

    // Update session activity
    try {
      await updateSessionActivity(sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }

    // Process question for analytics
    try {
      await processQuestion(
        userMessage,
        botResponse,
        confidence,
        detectedLanguage,
        sessionId,
        escalationSuggested
      );
      console.log(`Recorded question with language: ${detectedLanguage}`);
    } catch (error) {
      console.error('Failed to process question for analytics:', error);
    }

    // Record analytics
    await recordAnalytics('chat', 'message_processed', {
      sessionId,
      language: detectedLanguage,
      confidence,
      escalated: escalationSuggested,
      processingTime
    });

    console.log('Chat analytics processing completed successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error processing chat analytics:', error);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

/**
 * Update session activity
 */
async function updateSessionActivity(sessionId) {
  await dynamodb.send(new UpdateItemCommand({
    TableName: DATA_TABLE,
    Key: marshall({
      PK: `SESSION#${sessionId}`,
      SK: 'METADATA'
    }),
    UpdateExpression: 'SET lastActivity = :timestamp, messageCount = messageCount + :inc',
    ExpressionAttributeValues: marshall({
      ':timestamp': new Date().toISOString(),
      ':inc': 1
    })
  }));
}

/**
 * Record analytics
 */
async function recordAnalytics(category, action, data) {
  try {
    const timestampStr = new Date().toISOString();
    const analyticsRecord = {
      PK: `ANALYTICS#${category}`,
      SK: `${action}#${Date.now()}`,
      EntityType: 'ANALYTICS',
      timestamp: timestampStr,
      category,
      action,
      data,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    };

    await dynamodb.send(new PutItemCommand({
      TableName: DATA_TABLE,
      Item: marshall(analyticsRecord, { removeUndefinedValues: true })
    }));
  } catch (error) {
    console.error('Failed to record analytics:', error);
  }
}

/**
 * Process question for analytics
 */
async function processQuestion(question, response, confidence, language, sessionId, escalated) {
  try {
    const timestampStr = new Date().toISOString();
    const date = timestampStr.split('T')[0];
    const questionId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const questionRecord = {
      PK: `QUESTION#${date}`,
      SK: `${timestampStr}#${questionId}`,
      EntityType: 'QUESTION',
      questionId,
      question,
      response,
      confidence,
      language,
      sessionId,
      escalated,
      timestamp: timestampStr,
      date,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
    };

    await dynamodb.send(new PutItemCommand({
      TableName: DATA_TABLE,
      Item: marshall(questionRecord, { removeUndefinedValues: true })
    }));
  } catch (error) {
    console.error('Failed to process question:', error);
  }
}

/**
 * Handle config request - provides runtime configuration to frontend
 * This allows frontend to be built once and work across deployments
 */
async function handleConfig() {
  try {
    // Build config from environment variables (always up-to-date)
    const config = {
      apiBaseUrl: process.env.API_GATEWAY_URL || '',
      region: process.env.AWS_REGION || 'us-west-2',
      cognito: {
        userPoolId: process.env.USER_POOL_ID || '',
        clientId: process.env.USER_POOL_CLIENT_ID || '',
        identityPoolId: process.env.IDENTITY_POOL_ID || '',
        domain: process.env.COGNITO_DOMAIN || '',
        redirectSignIn: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/callback` : '',
        redirectSignOut: process.env.FRONTEND_URL || ''
      },
      version: new Date().toISOString(), // For debugging/cache busting
    };

    // Validate required fields
    if (!config.apiBaseUrl) {
      return createResponse(500, {
        error: 'Configuration incomplete',
        message: 'API_GATEWAY_URL not configured'
      });
    }

    // Add cache header for 5 minutes
    const response = createResponse(200, config);
    response.headers['Cache-Control'] = 'public, max-age=300';
    response.headers['Access-Control-Allow-Origin'] = '*'; // Allow all origins for config

    return response;

  } catch (error) {
    console.error('Config error:', error);
    return createResponse(500, {
      error: 'Failed to retrieve configuration',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Handle chat history request
 */
async function handleChatHistory(event) {
  try {
    const sessionId = event.queryStringParameters?.sessionId;

    if (!sessionId) {
      return createResponse(400, {
        error: 'Bad Request',
        message: 'sessionId query parameter is required'
      });
    }

    const history = await getChatHistory(sessionId);

    return createResponse(200, {
      sessionId,
      messages: history,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat history error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to retrieve chat history'
    });
  }
}

/**
 * Handle chat sessions request
 */
async function handleChatSessions(event) {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '10');
    const sessions = await getChatSessions(limit);

    return createResponse(200, {
      sessions,
      count: sessions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat sessions error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to retrieve chat sessions'
    });
  }
}

/**
 * Get chat history for a session
 */
async function getChatHistory(sessionId) {
  try {
    // Use Query instead of Scan for much better performance
    // Query by PK=SESSION#sessionId and filter SK to only get messages
    const result = await dynamodb.send(new QueryCommand({
      TableName: DATA_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': `SESSION#${sessionId}`,
        ':sk': 'MESSAGE#'
      }),
      Limit: 100
    }));

    const messages = result.Items?.map(item => unmarshall(item)) || [];
    // Messages are already sorted by timestamp in SK (MESSAGE#timestamp#...)
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return messages;
  } catch (error) {
    console.error('Failed to get chat history:', error);
    return [];
  }
}

/**
 * Get chat sessions
 */
async function getChatSessions(limit = 10) {
  try {
    // Use Scan to get all sessions (can be optimized with GSI if needed)
    const result = await dynamodb.send(new ScanCommand({
      TableName: DATA_TABLE,
      FilterExpression: 'EntityType = :entityType AND SK = :sk',
      ExpressionAttributeValues: marshall({
        ':entityType': 'SESSION',
        ':sk': 'METADATA'
      }),
      Limit: limit
    }));

    const sessions = result.Items?.map(item => unmarshall(item)) || [];
    sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    return sessions;
  } catch (error) {
    console.error('Failed to get chat sessions:', error);
    return [];
  }
}

/**
 * Create standardized API response with CORS
 */
function createResponse(statusCode, body) {
  // Allowed origins
  const allowedOrigins = [
    ...(FRONTEND_URL ? [FRONTEND_URL.replace(/\/$/, '')] : []),
    'http://localhost:3000',
    'https://localhost:3000'
  ].filter(Boolean);

  const corsOrigin = allowedOrigins.length > 0 ? allowedOrigins[0] : 'http://localhost:3000';

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
