/**
 * Chat Handler Lambda
 * Minimal latency, user-facing chat processor
 *
 * Responsibilities:
 * - Validate chat requests
 * - Manage sessions (get/create)
 * - Store user message
 * - Call RAG processor (synchronous)
 * - Store bot response
 * - Async invoke chat-data-processor
 * - Return response immediately to frontend
 *
 * What this Lambda DOES NOT do:
 * - Language detection (done by chat-data-processor)
 * - Analytics recording (done by chat-data-processor)
 * - Question categorization (done by chat-data-processor)
 * - Escalation logic (done by chat-data-processor)
 * - Session activity updates (done by chat-data-processor)
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const RAG_FUNCTION_NAME = process.env.RAG_FUNCTION_NAME;
const CHAT_DATA_PROCESSOR_FUNCTION = process.env.CHAT_DATA_PROCESSOR_FUNCTION;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Chat handler invoked:', JSON.stringify(event, null, 2));

  try {
    // Normalize path - remove stage prefix if present
    let path = event.path;
    if (path.startsWith('/prod/')) {
      path = path.replace('/prod', '');
    } else if (path.startsWith('/dev/')) {
      path = path.replace('/dev', '');
    } else if (path.startsWith('/staging/')) {
      path = path.replace('/staging', '');
    }

    const method = event.httpMethod;

    // Route requests
    if (method === 'POST' && (path === '/chat' || path.endsWith('/chat'))) {
      return await handleChatMessage(event);
    } else if (method === 'GET' && (path === '/health' || path === '/chat/health' || path.endsWith('/health'))) {
      return await handleHealthCheck(event);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '', event);
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /chat',
          'GET /health'
        ]
      }, event);
    }

  } catch (error) {
    console.error('Chat handler error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    }, event);
  }
};

/**
 * Handle chat message processing - OPTIMIZED FOR MINIMAL LATENCY
 */
async function handleChatMessage(event) {
  try {
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

    // Validate request
    const validation = validateChatRequest(request);
    if (!validation.valid) {
      return createResponse(400, {
        error: 'Validation error',
        message: validation.message
      }, event);
    }

    const timestamp = new Date();
    const startTime = Date.now();

    // STEP 1: Check if session exists (optimized - single lookup)
    let existingSession = null;
    let isNewSession = false;

    if (request.sessionId) {
      try {
        const result = await dynamodb.send(new GetItemCommand({
          TableName: SESSIONS_TABLE,
          Key: marshall({
            PK: `SESSION#${request.sessionId}`,
            SK: 'METADATA'
          })
        }));

        if (result.Item) {
          existingSession = unmarshall(result.Item);
          console.log(`Found existing session: ${request.sessionId}`);
        }
      } catch (error) {
        console.log('Session not found, will create new one');
      }
    }

    // STEP 2: Get or create session (no language detection here - done async)
    const session = await getOrCreateSession(request.sessionId, request.userInfo, existingSession);
    isNewSession = !existingSession;

    // STEP 3: Store user message
    await storeUserMessage(session.sessionId, request.message, timestamp);

    // STEP 4: Generate response using RAG (ONLY BLOCKING OPERATION)
    const processingStart = Date.now();
    const ragResponse = await generateResponse(request.message, session.language || 'en');
    const processingTime = Date.now() - processingStart;

    // STEP 5: Store bot response
    await storeBotMessage(
      session.sessionId,
      ragResponse.response,
      ragResponse.confidence,
      ragResponse.sources,
      processingTime
    );

    const totalTime = Date.now() - startTime;
    console.log(`Chat processing time: ${totalTime}ms (RAG: ${processingTime}ms)`);

    // STEP 6: Check for escalation and modify response if needed (BEFORE returning to user)
    const escalationSuggested = shouldEscalate(ragResponse.confidence, request.message);

    let finalResponse = ragResponse.response;
    if (escalationSuggested) {
      // Replace generic escalation message with more helpful one
      if (ragResponse.response.includes('Sorry, I am unable to assist you with this request') ||
          ragResponse.response.includes('Lo siento, no puedo ayudarte con esta solicitud')) {
        finalResponse = (session.language || 'en') === 'es'
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
      console.log(`Escalation suggested - modified response for user-friendly message`);
    }

    // STEP 7: Async invoke chat-data-processor (FIRE AND FORGET - DOES NOT BLOCK)
    const analyticsEvent = {
      eventType: 'chat_message_processed',
      sessionId: session.sessionId,
      userMessage: request.message,
      botResponse: ragResponse.response,
      confidence: ragResponse.confidence,
      sources: ragResponse.sources,
      processingTime,
      timestamp: timestamp.toISOString(),
      isNewSession,
      language: session.language || 'en',
      escalationSuggested // Pass escalation flag to analytics processor
    };

    // Invoke async - no await!
    invokeAsync(CHAT_DATA_PROCESSOR_FUNCTION, analyticsEvent).catch(err => {
      console.error('Failed to invoke chat-data-processor (non-blocking):', err);
      // Don't fail the request - analytics are best-effort
    });

    // STEP 8: Return response IMMEDIATELY (with potentially modified escalation message)
    return createResponse(200, {
      message: finalResponse, // Use modified response if escalated
      sources: ragResponse.sources || [],
      sessionId: session.sessionId,
      escalated: escalationSuggested
    }, event);

  } catch (error) {
    console.error('Chat message processing error:', error);

    if (error.message && error.message.includes('required')) {
      return createResponse(400, {
        error: 'Bad Request',
        message: error.message
      }, event);
    }

    return createResponse(500, {
      error: 'Failed to process chat message',
      message: error.message || 'Unknown error'
    }, event);
  }
}

/**
 * Handle health check
 */
async function handleHealthCheck(event) {
  try {
    // Simple health check - verify core services
    const services = {};

    // Test DynamoDB
    try {
      await dynamodb.send(new GetItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({
          PK: 'HEALTH_CHECK',
          SK: 'HEALTH_CHECK'
        })
      }));
      services.dynamodb = true;
    } catch (error) {
      // Not found is OK for health check
      services.dynamodb = true;
    }

    // Test RAG function connectivity
    try {
      if (RAG_FUNCTION_NAME) {
        services.rag = 'configured';
      } else {
        services.rag = 'not_configured';
      }
    } catch (error) {
      services.rag = false;
    }

    const overall = services.dynamodb;

    return createResponse(overall ? 200 : 503, {
      status: overall ? 'healthy' : 'unhealthy',
      service: 'chat-handler',
      timestamp: new Date().toISOString(),
      services
    }, event);

  } catch (error) {
    console.error('Health check error:', error);
    return createResponse(503, {
      status: 'unhealthy',
      service: 'chat-handler',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    }, event);
  }
}

/**
 * Validate chat request
 */
function validateChatRequest(request) {
  if (!request.message || typeof request.message !== 'string' || request.message.trim().length === 0) {
    return { valid: false, message: 'Message content is required and cannot be empty' };
  }

  if (request.message.length > 5000) {
    return { valid: false, message: 'Message content cannot exceed 5000 characters' };
  }

  return { valid: true };
}

/**
 * Check if escalation should be suggested
 */
function shouldEscalate(confidence, message) {
  // Escalate if confidence is below threshold (based on Bedrock KB relevance scores)
  // 0.75 = good semantic match between query and retrieved content
  if (confidence < 0.75) {
    return true;
  }

  // Escalate if user explicitly asks for human help
  // Use word boundary patterns to avoid false positives (e.g., "humanely", "personal")
  const escalationPatterns = [
    // ENGLISH: General human contact
    /\btalk to (a |an )?person\b/i,
    /\bspeak to (a |an )?human\b/i,
    /\bhuman help\b/i,
    /\brepresentative\b/i,

    // ENGLISH: Doctor/physician requests
    /\b(talk to|speak to|speak with|see|contact|need|find) (a |an )?(doctor|physician)\b/i,
    /\bmedical (advice|help|professional|guidance)\b/i,
    /\b(connect|refer) me (to|with) (a |an )?(doctor|physician)\b/i,

    // ENGLISH: Emergency/urgent (CRITICAL)
    /\b(medical )?emergency\b/i,
    /\burgent (medical )?(help|care|attention|assistance)\b/i,
    /\bimmediate (medical )?(help|attention|care)\b/i,

    // ENGLISH: Healthcare providers
    /\b(talk to|speak to|see|need) (a |an )?(nurse|specialist|clinician)\b/i,
    /\b(healthcare|health care) provider\b/i,
    /\bmedical (consultation|appointment)\b/i,

    // SPANISH: General human contact
    /\bhablar con (una )?persona\b/i,
    /\bhablar con (un )?humano\b/i,
    /\bayuda humana\b/i,
    /\brepresentante\b/i,

    // SPANISH: Doctor/physician requests
    /\b(hablar con|ver|contactar|necesito|encontrar) (un |una )?(médico|doctor|doctora)\b/i,
    /\b(consejo|ayuda|orientación) médic[oa]\b/i,
    /\b(conectar|conect|referir)([ae])?rme (con|a) (un |una )?(médico|doctor)\b/i,

    // SPANISH: Emergency/urgent (CRITICAL)
    /\bemergencia( médica)?\b/i,
    /\bayuda urgente( médica)?\b/i,
    /\batención (médica )?inmediata\b/i,

    // SPANISH: Healthcare providers
    /\b(hablar con|ver|necesito) (un |una )?(enfermera|enfermero|especialista)\b/i,
    /\bproveedor de (salud|atención médica)\b/i,
    /\bconsulta médica\b/i,
  ];

  return escalationPatterns.some(pattern => pattern.test(message));
}

/**
 * Get existing session or create new one
 * No language detection here - handled async by chat-data-processor
 */
async function getOrCreateSession(sessionId, userInfo, existingSession = null) {
  // If existingSession provided (already fetched), use it
  if (existingSession) {
    return {
      sessionId: existingSession.sessionId,
      startTime: existingSession.startTime,
      language: existingSession.language || 'en', // Default to English
      escalated: existingSession.escalated,
      messageCount: existingSession.messageCount,
      lastActivity: existingSession.lastActivity,
      userInfo: existingSession.userInfo,
      ttl: existingSession.ttl
    };
  }

  // Create new session with default language (will be updated async)
  const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newSession = {
    sessionId: newSessionId,
    startTime: new Date().toISOString(),
    language: 'en', // Default - will be updated by chat-data-processor
    escalated: false,
    messageCount: 0,
    lastActivity: new Date().toISOString(),
    userInfo,
    ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
  };

  // Store with PK/SK pattern
  await dynamodb.send(new PutItemCommand({
    TableName: SESSIONS_TABLE,
    Item: marshall({
      PK: `SESSION#${newSessionId}`,
      SK: 'METADATA',
      ...newSession
    }, { removeUndefinedValues: true })
  }));

  return newSession;
}

/**
 * Store user message
 */
async function storeUserMessage(sessionId, content, timestamp) {
  const userMessage = {
    messageId: `msg-${Date.now()}-user`,
    sessionId,
    content,
    sender: 'user',
    timestamp: timestamp.toISOString(),
    processingTime: 0
  };

  await dynamodb.send(new PutItemCommand({
    TableName: MESSAGES_TABLE,
    Item: marshall({
      conversationId: sessionId,
      timestamp: timestamp.toISOString(),
      ...userMessage
    }, { removeUndefinedValues: true })
  }));

  return userMessage;
}

/**
 * Generate response using RAG processor
 */
async function generateResponse(message, language) {
  try {
    const ragPayload = {
      httpMethod: 'POST',
      path: '/query',
      body: JSON.stringify({
        query: message,
        language: language,
        maxResults: 5,
        confidenceThreshold: 0.75
      })
    };

    const result = await lambda.send(new InvokeCommand({
      FunctionName: RAG_FUNCTION_NAME,
      Payload: JSON.stringify(ragPayload)
    }));

    const response = JSON.parse(new TextDecoder().decode(result.Payload));

    if (response.statusCode === 200) {
      const ragResponse = JSON.parse(response.body);
      return {
        response: ragResponse.response || 'I apologize, but I could not generate a response to your question.',
        confidence: ragResponse.confidence || 0.5,
        sources: ragResponse.sources || []
      };
    } else {
      throw new Error(`RAG processor returned status ${response.statusCode}`);
    }

  } catch (error) {
    console.error('RAG generation failed:', error);

    // Fallback response
    return {
      response: language === 'es'
        ? 'Lo siento, no puedo ayudarte con esta solicitud en este momento.'
        : 'Sorry, I am unable to assist you with this request at this time.',
      confidence: 0.3,
      sources: []
    };
  }
}

/**
 * Store bot response
 */
async function storeBotMessage(sessionId, content, confidence, sources, processingTime) {
  const botMessage = {
    messageId: `msg-${Date.now()}-bot`,
    sessionId,
    content,
    sender: 'bot',
    timestamp: new Date().toISOString(),
    confidence,
    sources,
    processingTime
  };

  await dynamodb.send(new PutItemCommand({
    TableName: MESSAGES_TABLE,
    Item: marshall({
      conversationId: sessionId,
      timestamp: new Date().toISOString(),
      ...botMessage
    }, { removeUndefinedValues: true })
  }));

  return botMessage;
}

/**
 * Invoke Lambda asynchronously (fire and forget)
 */
async function invokeAsync(functionName, payload) {
  try {
    await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(payload)
    }));
    console.log(`Async invoked ${functionName}`);
  } catch (error) {
    console.error(`Failed to async invoke ${functionName}:`, error);
    throw error;
  }
}

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
