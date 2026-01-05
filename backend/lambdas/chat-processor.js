/**
 * Chat Processor Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /chat - Process chat messages
 * - GET /health - Health check
 * - GET /chat/history - Get chat history for a session
 * - GET /chat/sessions - Get list of chat sessions
 * - OPTIONS - CORS support
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { ComprehendClient, DetectDominantLanguageCommand } = require('@aws-sdk/client-comprehend');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const comprehend = new ComprehendClient({ region: process.env.AWS_REGION || 'us-west-2' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'ada-clara-messages';
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
const RAG_FUNCTION_NAME = process.env.RAG_FUNCTION_NAME || 'ada-clara-rag-processor-dev-v2';
const RAG_ENDPOINT = process.env.RAG_ENDPOINT || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Chat processor invoked:', JSON.stringify(event, null, 2));

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
    } else if (method === 'GET' && (path === '/chat/history' || path.endsWith('/chat/history'))) {
      return await handleChatHistory(event);
    } else if (method === 'GET' && (path === '/chat/sessions' || path.endsWith('/chat/sessions'))) {
      return await handleChatSessions(event);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '', event);
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /chat',
          'GET /health',
          'GET /chat/history?sessionId=<sessionId>',
          'GET /chat/sessions?limit=<limit>'
        ]
      }, event);
    }

  } catch (error) {
    console.error('Chat processor error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    }, event);
  }
};

/**
 * Handle chat message processing
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
    
    // Step 1: Detect language
    const language = await detectLanguage(request.message);
    
    // Step 2: Get or create session
    const session = await getOrCreateSession(request.sessionId, language, request.userInfo);
    
    // Step 3: Store user message
    await storeUserMessage(session.sessionId, request.message, language, timestamp);
    
    // Step 4: Generate response using RAG
    const processingStart = Date.now();
    const ragResponse = await generateResponse(request.message, language);
    const processingTime = Date.now() - processingStart;
    
    // Step 5: Store bot response
    await storeBotMessage(
      session.sessionId, 
      ragResponse.response, 
      language, 
      ragResponse.confidence, 
      ragResponse.sources, 
      processingTime
    );
    
    // Step 6: Check for escalation
    const escalationSuggested = shouldEscalate(ragResponse.confidence, request.message);
    
    // Step 6a: Handle escalation
    let finalResponse = ragResponse.response;
    if (escalationSuggested) {
      await createEscalation(session.sessionId, 'Low confidence or complex query');
      await storeUnansweredQuestion(request.message, language, ragResponse.confidence);
      
      // Replace generic escalation message with more helpful one
      if (ragResponse.response.includes('Sorry, I am unable to assist you with this request') || 
          ragResponse.response.includes('Lo siento, no puedo ayudarte con esta solicitud')) {
        finalResponse = language === 'es' 
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
    }
    
    // Step 7: Update session activity
    try {
      await updateSessionActivity(session.sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
    
    // Step 8: Record analytics
    await recordAnalytics('chat', 'message_processed', {
      sessionId: session.sessionId,
      language,
      confidence: ragResponse.confidence,
      escalated: escalationSuggested,
      processingTime
    });
    
    // Step 9: Process question for analytics
    try {
      await processQuestion(
        request.message,
        finalResponse,
        ragResponse.confidence,
        language,
        session.sessionId,
        escalationSuggested
      );
    } catch (error) {
      console.error('Failed to process question for analytics:', error);
    }

    // Return frontend-focused response
    const frontendResponse = {
      message: finalResponse,
      sources: ragResponse.sources || [],
      sessionId: session.sessionId,
      escalated: escalationSuggested
    };

    return createResponse(200, frontendResponse, event);

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
    // Test access to required services
    const services = {};
    
    // Test DynamoDB
    try {
      await dynamodb.send(new ScanCommand({
        TableName: SESSIONS_TABLE,
        Limit: 1
      }));
      services.dynamodb = true;
    } catch (error) {
      services.dynamodb = false;
    }
    
    // Test Comprehend
    try {
      await comprehend.send(new DetectDominantLanguageCommand({
        Text: 'test'
      }));
      services.comprehend = true;
    } catch (error) {
      services.comprehend = false;
    }
    
    // Test RAG function
    try {
      if (RAG_FUNCTION_NAME) {
        await lambda.send(new InvokeCommand({
          FunctionName: RAG_FUNCTION_NAME,
          Payload: JSON.stringify({
            httpMethod: 'GET',
            path: '/health'
          })
        }));
        services.rag = true;
      } else {
        services.rag = 'not_configured';
      }
    } catch (error) {
      services.rag = false;
    }
    
    const overall = services.dynamodb && services.comprehend && (services.rag === true || services.rag === 'not_configured');

    return createResponse(overall ? 200 : 503, {
      message: "ADA Clara API is working!",
      timestamp: new Date().toISOString(),
      path: "/health",
      method: "GET",
      userModel: "simplified",
      status: overall ? 'healthy' : 'unhealthy',
      services
    }, event);

  } catch (error) {
    console.error('Health check error:', error);
    return createResponse(503, {
      message: "ADA Clara API health check failed",
      timestamp: new Date().toISOString(),
      path: "/health",
      method: "GET",
      userModel: "simplified",
      status: 'unhealthy',
      error: error.message || 'Unknown error'
    }, event);
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
      }, event);
    }

    const history = await getChatHistory(sessionId);

    return createResponse(200, {
      sessionId,
      messages: history,
      timestamp: new Date().toISOString()
    }, event);

  } catch (error) {
    console.error('Chat history error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to retrieve chat history'
    }, event);
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
    }, event);

  } catch (error) {
    console.error('Chat sessions error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: 'Failed to retrieve chat sessions'
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
 * Detect language using Comprehend
 */
async function detectLanguage(text) {
  try {
    const result = await comprehend.send(new DetectDominantLanguageCommand({
      Text: text
    }));
    
    if (result.Languages && result.Languages.length > 0) {
      return result.Languages[0].LanguageCode || 'en';
    }
    
    return 'en';
  } catch (error) {
    console.error('Language detection failed:', error);
    return 'en'; // Default to English
  }
}

/**
 * Get existing session or create new one
 */
async function getOrCreateSession(sessionId, language = 'en', userInfo) {
  if (sessionId) {
    try {
      const result = await dynamodb.send(new GetItemCommand({
        TableName: SESSIONS_TABLE,
        Key: marshall({
          PK: `SESSION#${sessionId}`,
          SK: 'METADATA'
        })
      }));
      
      if (result.Item) {
        const session = unmarshall(result.Item);
        return {
          sessionId: session.sessionId,
          startTime: session.startTime,
          language: session.language,
          escalated: session.escalated,
          messageCount: session.messageCount,
          lastActivity: session.lastActivity,
          userInfo: session.userInfo,
          ttl: session.ttl
        };
      }
    } catch (error) {
      console.log('Session not found, creating new one:', error);
    }
  }
  
  // Create new session
  const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newSession = {
    sessionId: newSessionId,
    startTime: new Date().toISOString(),
    language,
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
    })
  }));
  
  return newSession;
}

/**
 * Store user message
 */
async function storeUserMessage(sessionId, content, language, timestamp) {
  const userMessage = {
    messageId: `msg-${Date.now()}-user`,
    sessionId,
    content,
    sender: 'user',
    timestamp: timestamp.toISOString(),
    language,
    processingTime: 0
  };
  
  // Store in messages table
  await dynamodb.send(new PutItemCommand({
    TableName: MESSAGES_TABLE,
    Item: marshall({
      conversationId: sessionId,
      timestamp: timestamp.toISOString(),
      ...userMessage
    })
  }));
  
  return userMessage;
}

/**
 * Generate response using RAG processor
 */
async function generateResponse(message, language) {
  try {
    // Call RAG processor Lambda function
    const ragPayload = {
      httpMethod: 'POST',
      path: '/query',
      body: JSON.stringify({
        query: message,
        language: language,
        maxResults: 5,
        confidenceThreshold: 0.95
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
async function storeBotMessage(sessionId, content, language, confidence, sources, processingTime) {
  const botMessage = {
    messageId: `msg-${Date.now()}-bot`,
    sessionId,
    content,
    sender: 'bot',
    timestamp: new Date().toISOString(),
    language,
    confidence,
    sources,
    processingTime
  };
  
  // Store in messages table
  await dynamodb.send(new PutItemCommand({
    TableName: MESSAGES_TABLE,
    Item: marshall({
      conversationId: sessionId,
      timestamp: new Date().toISOString(),
      ...botMessage
    })
  }));
  
  return botMessage;
}

/**
 * Check if escalation should be suggested
 */
function shouldEscalate(confidence, message) {
  // Escalate if confidence is below 95% threshold
  if (confidence < 0.95) {
    return true;
  }
  
  // Escalate if user explicitly asks for human help
  const escalationKeywords = [
    'talk to person', 'speak to human', 'human help', 'representative',
    'hablar con persona', 'hablar con humano', 'ayuda humana', 'representante'
  ];
  
  const lowerMessage = message.toLowerCase();
  return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Create escalation record
 */
async function createEscalation(sessionId, reason) {
  const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
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
    Item: marshall(escalationRecord)
  }));
  
  return escalationRecord;
}

/**
 * Store unanswered question
 */
async function storeUnansweredQuestion(question, language, confidence) {
  const questionId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const questionRecord = {
    questionId,
    question,
    language,
    confidence,
    timestamp: new Date().toISOString(),
    status: 'unanswered'
  };
  
  await dynamodb.send(new PutItemCommand({
    TableName: QUESTIONS_TABLE,
    Item: marshall(questionRecord)
  }));
  
  return questionRecord;
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
      Item: marshall(analyticsRecord)
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
    const questionRecord = {
      questionId: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      question,
      response,
      confidence,
      language,
      sessionId,
      escalated,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      category: 'general' // Could be enhanced with categorization logic
    };
    
    await dynamodb.send(new PutItemCommand({
      TableName: QUESTIONS_TABLE,
      Item: marshall(questionRecord)
    }));
  } catch (error) {
    console.error('Failed to process question:', error);
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
    
    // Sort by timestamp
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
    
    // Sort by last activity
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
function createResponse(statusCode, body, event) {
  // Get origin from request headers
  const origin = event?.headers?.origin || event?.headers?.Origin || '*';
  
  // Allowed origins
  const allowedOrigins = [
    ...(FRONTEND_URL ? [FRONTEND_URL] : []),
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