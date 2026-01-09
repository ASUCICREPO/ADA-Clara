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
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const crypto = require('crypto');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const comprehend = new ComprehendClient({ region: process.env.AWS_REGION || 'us-west-2' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables - No fallbacks for table names (must be set by CDK)
const SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE;
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE;
const RAG_FUNCTION_NAME = process.env.RAG_FUNCTION_NAME;
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

    // Step 1: Check if session exists first
    let existingSession = null;
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
        }
      } catch (error) {
        console.log('Session not found, will create new one:', error);
      }
    }

    // Step 2: Detect language only for new sessions (optimization)
    let language;
    if (existingSession) {
      // Reuse existing session language (no API call needed)
      language = existingSession.language || 'en';
      console.log(`Reusing session language: ${language}`);
    } else {
      // New session - detect language from first message
      language = await detectLanguage(request.message);
      console.log(`Detected language for new session: ${language}`);
    }

    // Step 3: Get or create session (will reuse existingSession if available)
    const session = await getOrCreateSession(request.sessionId, language, request.userInfo, existingSession);

    // Step 4: Store user message
    await storeUserMessage(session.sessionId, request.message, language, timestamp);

    // Step 5: Generate response using RAG
    const processingStart = Date.now();
    const ragResponse = await generateResponse(request.message, language);
    const processingTime = Date.now() - processingStart;

    // Step 6: Store bot response
    await storeBotMessage(
      session.sessionId,
      ragResponse.response,
      language,
      ragResponse.confidence,
      ragResponse.sources,
      processingTime
    );

    // Step 7: Check for escalation
    const escalationSuggested = shouldEscalate(ragResponse.confidence, request.message);

    // Step 7a: Handle escalation
    let finalResponse = ragResponse.response;
    if (escalationSuggested) {
      await createEscalation(session.sessionId, 'Low confidence or complex query');

      // Replace generic escalation message with more helpful one
      if (ragResponse.response.includes('Sorry, I am unable to assist you with this request') ||
          ragResponse.response.includes('Lo siento, no puedo ayudarte con esta solicitud')) {
        finalResponse = language === 'es'
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
    }

    // Step 8: Update session activity
    try {
      await updateSessionActivity(session.sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }

    // Step 9: Record analytics
    await recordAnalytics('chat', 'message_processed', {
      sessionId: session.sessionId,
      language,
      confidence: ragResponse.confidence,
      escalated: escalationSuggested,
      processingTime
    });

    // Step 10: Process question for analytics
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
        const response = await lambda.send(new InvokeCommand({
          FunctionName: RAG_FUNCTION_NAME,
          Payload: JSON.stringify({
            httpMethod: 'GET',
            path: '/health'
          })
        }));

        // Check if Lambda returned an error (FunctionError field)
        if (response.FunctionError) {
          console.error('RAG health check returned error:', response.FunctionError);
          services.rag = false;
        } else {
          services.rag = true;
        }
      } else {
        services.rag = 'not_configured';
      }
    } catch (error) {
      console.error('RAG health check failed:', error.message);
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
 * Heuristic-based language detection fallback
 * Used when AWS Comprehend is unavailable or returns no results
 */
function detectLanguageFallback(text) {
  // Spanish indicators - special characters, question words, and common words
  const spanishPatterns = [
    // Spanish-specific characters
    /[áéíóúñ¿¡]/i,
    // Common Spanish question words
    /^(qué|cómo|cuándo|dónde|por qué|quién|cuál)\s/i,
    // Common Spanish articles and prepositions
    /\b(el|la|los|las|un|una|de|del|por|para|con|sin|sobre)\b/i,
    // Common Spanish verbs and expressions
    /\b(es|son|está|están|tiene|tienen|puede|pueden|necesito|quiero|ayuda|ayúdame)\b/i,
  ];

  // Check if any Spanish pattern matches
  const hasSpanishIndicators = spanishPatterns.some(pattern => pattern.test(text));

  return hasSpanishIndicators ? 'es' : 'en';
}

/**
 * Detect language using Comprehend with heuristic fallback
 */
async function detectLanguage(text) {
  try {
    const result = await comprehend.send(new DetectDominantLanguageCommand({
      Text: text
    }));

    if (result.Languages && result.Languages.length > 0) {
      return result.Languages[0].LanguageCode || detectLanguageFallback(text);
    }

    // No languages detected, use heuristic fallback
    return detectLanguageFallback(text);
  } catch (error) {
    console.error('Language detection failed, using heuristic fallback:', error);
    return detectLanguageFallback(text);
  }
}

/**
 * Get existing session or create new one
 */
async function getOrCreateSession(sessionId, language = 'en', userInfo, existingSession = null) {
  // If existingSession provided (already fetched), use it to avoid duplicate lookup
  if (existingSession) {
    return {
      sessionId: existingSession.sessionId,
      startTime: existingSession.startTime,
      language: existingSession.language,
      escalated: existingSession.escalated,
      messageCount: existingSession.messageCount,
      lastActivity: existingSession.lastActivity,
      userInfo: existingSession.userInfo,
      ttl: existingSession.ttl
    };
  }

  // Fallback: Try to fetch session (for backward compatibility if called without existingSession)
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
    }, { removeUndefinedValues: true })
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
    }, { removeUndefinedValues: true })
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
    }, { removeUndefinedValues: true })
  }));
  
  return botMessage;
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
 * Create escalation record
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
 * Process question for analytics with AI-powered categorization
 */
async function processQuestion(question, response, confidence, language, sessionId, escalated) {
  try {
    // Get AI-powered category
    const category = await categorizeQuestion(question, language);
    
    const questionRecord = {
      questionId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      question,
      response,
      confidence,
      language,
      sessionId,
      escalated, // This will be true for low confidence or explicit escalation requests
      category, // Now uses AI-powered categorization
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
    };
    
    await dynamodb.send(new PutItemCommand({
      TableName: QUESTIONS_TABLE,
      Item: marshall(questionRecord, { removeUndefinedValues: true })
    }));
  } catch (error) {
    console.error('Failed to process question:', error);
  }
}

/**
 * Categorize question using AI
 */
async function categorizeQuestion(question, language = 'en') {
  try {
    // Define diabetes-specific categories
    const categories = [
      'type-1-diabetes',
      'type-2-diabetes', 
      'gestational-diabetes',
      'prediabetes',
      'symptoms-diagnosis',
      'blood-sugar-management',
      'insulin-medication',
      'diet-nutrition',
      'exercise-lifestyle',
      'complications',
      'emergency-care',
      'insurance-coverage',
      'general-information',
      'non-diabetes-related'
    ];

    const prompt = language === 'es'
      ? `Clasifica esta pregunta en UNA de estas categorías:
${categories.join(', ')}

IMPORTANTE: Si la pregunta NO está relacionada con diabetes en absoluto, usa "non-diabetes-related".

Ejemplos:
- "¿Qué es la diabetes?" → general-information
- "¿Qué debo comer?" → diet-nutrition
- "¿Cómo está el clima?" → non-diabetes-related
- "¿Quién ganó el partido?" → non-diabetes-related

Pregunta: "${question}"

Responde SOLO con el nombre de la categoría.`
      : `Classify this question into ONE of these categories:
${categories.join(', ')}

IMPORTANT: If the question is NOT related to diabetes at all, use "non-diabetes-related".

Examples:
- "What is diabetes?" → general-information
- "What foods should I eat?" → diet-nutrition
- "What's the weather like?" → non-diabetes-related
- "Who won the game?" → non-diabetes-related

Question: "${question}"

Respond with ONLY the category name.`;

    // Use Bedrock to categorize
    const bedrockCommand = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0', // Fast, cost-effective model for classification
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 50,
        temperature: 0, // Deterministic classification
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });
    const response = await bedrockClient.send(bedrockCommand);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    const category = result.content[0].text.trim().toLowerCase();
    
    // Validate category is in our list
    if (categories.includes(category)) {
      return category;
    } else {
      // Fallback to keyword-based classification
      return classifyByKeywords(question, language);
    }
    
  } catch (error) {
    console.error('AI categorization failed, falling back to keywords:', error);
    return classifyByKeywords(question, language);
  }
}

/**
 * Fallback keyword-based categorization
 */
function classifyByKeywords(question, language = 'en') {
  const lowerQuestion = question.toLowerCase();
  
  // Define keyword patterns for different categories
  const keywordPatterns = {
    'type-1-diabetes': [
      'type 1', 'tipo 1', 't1d', 'insulin dependent', 'insulino dependiente',
      'autoimmune', 'autoinmune', 'juvenile diabetes', 'diabetes juvenil'
    ],
    'type-2-diabetes': [
      'type 2', 'tipo 2', 't2d', 'adult onset', 'diabetes adulto',
      'insulin resistance', 'resistencia insulina', 'metformin', 'metformina'
    ],
    'gestational-diabetes': [
      'gestational', 'gestacional', 'pregnancy', 'embarazo', 'pregnant', 'embarazada'
    ],
    'prediabetes': [
      'prediabetes', 'prediabético', 'borderline', 'pre diabetes', 'pre diabetic'
    ],
    'blood-sugar-management': [
      'blood sugar', 'azúcar sangre', 'glucose', 'glucosa', 'a1c', 'hemoglobina',
      'monitor', 'monitorear', 'test', 'prueba', 'cgm', 'glucometer', 'glucómetro'
    ],
    'insulin-medication': [
      'insulin', 'insulina', 'injection', 'inyección', 'pen', 'pluma',
      'pump', 'bomba', 'medication', 'medicamento', 'drug', 'fármaco'
    ],
    'diet-nutrition': [
      'diet', 'dieta', 'food', 'comida', 'carb', 'carbohidrato', 'nutrition', 'nutrición',
      'meal', 'comida', 'eat', 'comer', 'sugar', 'azúcar', 'carbohydrate'
    ],
    'exercise-lifestyle': [
      'exercise', 'ejercicio', 'workout', 'entrenamiento', 'physical activity', 'actividad física',
      'lifestyle', 'estilo vida', 'weight', 'peso', 'fitness'
    ],
    'complications': [
      'complication', 'complicación', 'neuropathy', 'neuropatía', 'retinopathy', 'retinopatía',
      'kidney', 'riñón', 'heart', 'corazón', 'foot', 'pie', 'wound', 'herida'
    ],
    'symptoms-diagnosis': [
      'symptom', 'síntoma', 'diagnos', 'diagnóstico', 'thirsty', 'sed',
      'urinate', 'orinar', 'tired', 'cansado', 'blurred vision', 'visión borrosa'
    ],
    'emergency-care': [
      'emergency', 'emergencia', 'hypoglycemia', 'hipoglucemia', 'low blood sugar',
      'azúcar bajo', 'ketoacidosis', 'cetoacidosis', 'dka', 'urgent', 'urgente'
    ],
    'insurance-coverage': [
      'insurance', 'seguro', 'coverage', 'cobertura', 'cost', 'costo',
      'medicare', 'medicaid', 'afford', 'permitir', 'expensive', 'caro'
    ]
  };

  // Check each category for keyword matches
  for (const [category, keywords] of Object.entries(keywordPatterns)) {
    for (const keyword of keywords) {
      if (lowerQuestion.includes(keyword)) {
        return category;
      }
    }
  }

  // Check for obvious non-diabetes topics first
  const offTopicKeywords = [
    'weather', 'clima', 'sports', 'deportes', 'game', 'partido',
    'movie', 'película', 'music', 'música', 'politics', 'política',
    'stock', 'acción', 'crypto', 'bitcoin', 'recipe', 'receta',
    'car', 'coche', 'travel', 'viaje', 'hotel', 'restaurant'
  ];

  const isOffTopic = offTopicKeywords.some(keyword =>
    lowerQuestion.includes(keyword)
  );

  if (isOffTopic) {
    // Double-check it's not actually about diabetes (e.g., "weather affecting blood sugar")
    const diabetesKeywords = [
      'diabetes', 'diabetic', 'diabético', 'insulin', 'insulina',
      'glucose', 'glucosa', 'blood sugar', 'azúcar'
    ];

    const mentionsDiabetes = diabetesKeywords.some(keyword =>
      lowerQuestion.includes(keyword)
    );

    if (!mentionsDiabetes) {
      return 'non-diabetes-related';
    }
  }

  // Check if it's diabetes-related
  const diabetesKeywords = [
    'diabetes', 'diabetic', 'diabético', 'insulin', 'insulina',
    'glucose', 'glucosa', 'blood sugar', 'azúcar sangre', 'a1c',
    'hemoglobin', 'hemoglobina', 'pancreas', 'páncreas'
  ];

  const isDiabetesRelated = diabetesKeywords.some(keyword =>
    lowerQuestion.includes(keyword)
  );

  return isDiabetesRelated ? 'general-information' : 'non-diabetes-related';
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