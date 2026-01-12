/**
 * Chat Data Processor Lambda
 * Async analytics and data processing
 *
 * Responsibilities:
 * - Language detection for new sessions
 * - Update session activity
 * - Record analytics events
 * - Process questions with AI categorization
 * - Check escalation conditions
 * - Create escalation records
 * - Handle GET endpoints (history, sessions)
 *
 * Invocation:
 * - Async from chat-handler (fire and forget)
 * - Sync from API Gateway for GET endpoints
 */

const { DynamoDBClient, PutItemCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { ComprehendClient, DetectDominantLanguageCommand } = require('@aws-sdk/client-comprehend');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const crypto = require('crypto');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const comprehend = new ComprehendClient({ region: process.env.AWS_REGION || 'us-west-2' });
const bedrockRuntime = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

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

    if (method === 'GET' && (path === '/chat/history' || path.endsWith('/chat/history'))) {
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

    // STEP 1: Detect language for new sessions (or update existing)
    let language = detectedLanguage;
    if (isNewSession && userMessage) {
      language = await detectLanguage(userMessage);
      console.log(`Detected language for new session: ${language}`);

      // Update session with detected language
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
            ':language': language
          })
        }));
      } catch (error) {
        console.error('Failed to update session language:', error);
      }
    }

    // STEP 2: Create escalation record if needed (escalation already determined by chat-handler)
    if (escalationSuggested) {
      await createEscalation(sessionId, 'Low confidence or complex query');
    }

    // STEP 4: Update session activity
    try {
      await updateSessionActivity(sessionId);
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }

    // STEP 5: Record analytics
    await recordAnalytics('chat', 'message_processed', {
      sessionId,
      language,
      confidence,
      escalated: escalationSuggested,
      processingTime
    });

    // STEP 6: Process question for analytics
    try {
      await processQuestion(
        userMessage,
        botResponse,
        confidence,
        language,
        sessionId,
        escalationSuggested
      );
    } catch (error) {
      console.error('Failed to process question for analytics:', error);
    }

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

/**
 * Heuristic-based language detection fallback
 */
function detectLanguageFallback(text) {
  const spanishPatterns = [
    /[áéíóúñ¿¡]/i,
    /^(qué|cómo|cuándo|dónde|por qué|quién|cuál)\s/i,
    /\b(el|la|los|las|un|una|de|del|por|para|con|sin|sobre)\b/i,
    /\b(es|son|está|están|tiene|tienen|puede|pueden|necesito|quiero|ayuda|ayúdame)\b/i,
  ];

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

    return detectLanguageFallback(text);
  } catch (error) {
    console.error('Language detection failed, using heuristic fallback:', error);
    return detectLanguageFallback(text);
  }
}

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
  } catch (error) {
    console.error('Failed to process question:', error);
  }
}

/**
 * Categorize question using AI
 */
async function categorizeQuestion(question, language = 'en') {
  try {
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

    const bedrockCommand = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 50,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const response = await bedrockRuntime.send(bedrockCommand);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    const category = result.content[0].text.trim().toLowerCase();

    if (categories.includes(category)) {
      return category;
    } else {
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

  // Check for obvious non-diabetes topics
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

    // Test Comprehend
    try {
      await comprehend.send(new DetectDominantLanguageCommand({
        Text: 'test'
      }));
      services.comprehend = true;
    } catch (error) {
      services.comprehend = false;
    }

    const overall = services.dynamodb && services.comprehend;

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
