/**
 * Chat Data Processor Lambda
 * Async analytics and data processing
 *
 * Responsibilities:
 * - AI-powered language detection and question categorization (single Haiku call)
 * - Update session activity
 * - Record analytics events
 * - Create escalation records
 * - Handle GET endpoints (history, sessions)
 *
 * Invocation:
 * - Async from chat-handler (fire and forget)
 * - Sync from API Gateway for GET endpoints
 *
 * NOTE: Language detection now uses Haiku instead of Comprehend
 * This eliminates AWS Comprehend dependency and reduces API calls
 */

const { DynamoDBClient, PutItemCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');
const { categorizeAndDetectLanguage, detectLanguageFallback } = require('./categorization');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE;
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Chat data processor invoked:', JSON.stringify(event, null, 2));

  try {
    // Check if this is an async event from chat-handler
    if (event.eventType === 'chat_message_processed') {
      return await processChatAnalytics(event);
    }

    // Otherwise, handle as API Gateway request (GET endpoints)
    const path = event.path || '';
    const method = event.httpMethod;

    if (method === 'GET' && (path === '/config' || path.endsWith('/config'))) {
      return await handleConfig(event);
    } else if (method === 'GET' && (path === '/chat/history' || path.endsWith('/chat/history'))) {
      return await handleChatHistory(event);
    } else if (method === 'GET' && (path === '/chat/sessions' || path.endsWith('/chat/sessions'))) {
      return await handleChatSessions(event);
    } else if (method === 'GET' && (path === '/health' || path === '/data-processor/health')) {
      return await handleHealthCheck(event);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /config',
          'GET /chat/history?sessionId=<sessionId>',
          'GET /chat/sessions?limit=<limit>',
          'GET /health'
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
      sources,
      processingTime,
      timestamp,
      isNewSession,
      language: detectedLanguage,
      escalationSuggested // Now passed from chat-handler
    } = event;

    // STEP 1: Create escalation record if needed (escalation already determined by chat-handler)
    if (escalationSuggested) {
      await createEscalation(sessionId, 'Low confidence or complex query');
    }

    // STEP 2: Update session activity
    try {
      await updateSessionActivity(sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }

    // STEP 3: Process question for analytics (includes AI language detection + categorization in ONE call)
    let finalLanguage = detectedLanguage;
    try {
      finalLanguage = await processQuestion(
        userMessage,
        botResponse,
        confidence,
        detectedLanguage,
        sessionId,
        escalationSuggested
      );
      console.log(`AI detected language: ${finalLanguage}`);
    } catch (error) {
      console.error('Failed to process question for analytics:', error);
    }

    // STEP 4: Update session with AI-detected language (for new sessions or language corrections)
    if (isNewSession || finalLanguage !== detectedLanguage) {
      try {
        await dynamodb.send(new UpdateItemCommand({
          TableName: SESSIONS_TABLE,
          Key: marshall({
            PK: `SESSION#${sessionId}`,
            SK: 'METADATA'
          }),
          UpdateExpression: 'SET #lang = :language',
          ExpressionAttributeNames: {
            '#lang': 'language'
          },
          ExpressionAttributeValues: marshall({
            ':language': finalLanguage
          })
        }));
        console.log(`Updated session language to: ${finalLanguage}`);
      } catch (error) {
        console.error('Failed to update session language:', error);
      }
    }

    // STEP 5: Record analytics with final language
    await recordAnalytics('chat', 'message_processed', {
      sessionId,
      language: finalLanguage,
      confidence,
      escalated: escalationSuggested,
      processingTime
    });

    console.log('Chat analytics processing completed successfully');

    // Return success (though no one is waiting for this)
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error processing chat analytics:', error);
    // Don't fail - analytics are best-effort
    return {
      statusCode: 200,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}

// NOTE: Language detection and categorization now handled by external module
// See ./categorization.js for implementation details

/**
 * Create escalation record
 * Note: Escalation detection is now handled by chat-handler for minimal latency
 */
async function createEscalation(sessionId, reason) {
  const escalationId = `esc-${crypto.randomUUID()}`;

  const escalationRecord = {
    escalationId,
    sessionId,
    reason,
    status: 'pending',
    timestamp: new Date().toISOString(),
    source: 'chat_escalation',
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
  };

  await dynamodb.send(new PutItemCommand({
    TableName: ESCALATION_TABLE,
    Item: marshall(escalationRecord, { removeUndefinedValues: true })
  }));

  return escalationRecord;
}

/**
 * Update session activity
 */
async function updateSessionActivity(sessionId) {
  await dynamodb.send(new UpdateItemCommand({
    TableName: SESSIONS_TABLE,
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
    const analyticsRecord = {
      PK: `ANALYTICS#${category}`,
      SK: `${action}#${Date.now()}`,
      timestamp: new Date().toISOString(),
      category,
      action,
      data,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    };

    await dynamodb.send(new PutItemCommand({
      TableName: ANALYTICS_TABLE,
      Item: marshall(analyticsRecord, { removeUndefinedValues: true })
    }));
  } catch (error) {
    console.error('Failed to record analytics:', error);
  }
}

/**
 * Process question for analytics with AI-powered categorization and language detection
 */
async function processQuestion(question, response, confidence, language, sessionId, escalated) {
  try {
    // Get AI-powered category (and language if not already detected)
    const { category, detectedLanguage } = await categorizeAndDetectLanguage(question, language);

    const questionRecord = {
      questionId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      question,
      response,
      confidence,
      language: detectedLanguage, // Use AI-detected language if available
      sessionId,
      escalated,
      category,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    };

    await dynamodb.send(new PutItemCommand({
      TableName: QUESTIONS_TABLE,
      Item: marshall(questionRecord, { removeUndefinedValues: true })
    }));

    // Return detected language for session update
    return detectedLanguage;
  } catch (error) {
    console.error('Failed to process question:', error);
    return language; // Return original language on error
  }
}

/**
 * Handle config request - provides runtime configuration to frontend
 * This allows frontend to be built once and work across deployments
 */
async function handleConfig(event) {
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
    const result = await dynamodb.send(new ScanCommand({
      TableName: MESSAGES_TABLE,
      FilterExpression: 'conversationId = :sessionId',
      ExpressionAttributeValues: marshall({
        ':sessionId': sessionId
      }),
      Limit: 100
    }));

    const messages = result.Items?.map(item => unmarshall(item)) || [];
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
    const result = await dynamodb.send(new ScanCommand({
      TableName: SESSIONS_TABLE,
      FilterExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: marshall({
        ':pk': 'SESSION#'
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
 * Handle health check
 */
async function handleHealthCheck(event) {
  try {
    const services = {};

    // Test DynamoDB access
    try {
      await dynamodb.send(new ScanCommand({
        TableName: SESSIONS_TABLE,
        Limit: 1
      }));
      services.dynamodb = true;
    } catch (error) {
      services.dynamodb = false;
    }

    // Note: Comprehend no longer used - language detection now uses Haiku

    const overall = services.dynamodb;

    return createResponse(overall ? 200 : 503, {
      status: overall ? 'healthy' : 'unhealthy',
      service: 'chat-data-processor',
      timestamp: new Date().toISOString(),
      services
    });

  } catch (error) {
    console.error('Health check error:', error);
    return createResponse(503, {
      status: 'unhealthy',
      service: 'chat-data-processor',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    });
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
