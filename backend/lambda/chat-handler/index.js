/**
 * Chat Handler Lambda - Unified Chat Processing
 *
 * Responsibilities:
 * 1. API Gateway request handling
 * 2. Session management
 * 3. User message storage
 * 4. Knowledge base retrieval
 * 5. Claude AI generation
 * 6. Bot response storage
 * 7. Escalation logic
 * 8. Async analytics invocation

 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import crypto from 'crypto';

// Initialize AWS clients
const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);
const bedrockAgent = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });
const bedrockRuntime = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const DATA_TABLE = process.env.DATA_TABLE;
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE;
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const GENERATION_MODEL = process.env.GENERATION_MODEL || 'anthropic.claude-3-5-haiku-20241022-v1:0';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');
const ANALYTICS_PROCESSOR_ARN = process.env.ANALYTICS_PROCESSOR_ARN;
const MIN_RELEVANCE_SCORE = 0.65;
// Number of chunks to retrieve from Knowledge Base
// Higher values = more likely to find quality sources, but slower response time
const MAX_RETRIEVAL_RESULTS = parseInt(process.env.MAX_RETRIEVAL_RESULTS || '10');
// High confidence threshold - if top source exceeds this, trust it even if avg is lower
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Main Lambda handler - Direct API Gateway entry point
 */
export const handler = async (event) => {
  console.log('Chat handler invoked:', JSON.stringify(event, null, 2));

  try {
    // Support both HTTP API (v2) and REST API (v1) formats
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    // Handle OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
      return createResponse(200, '');
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
        message: 'Please provide a chat message'
      });
    }

    // Decode base64 body if needed (API Gateway v2 HTTP API format)
    let bodyString = event.body;
    if (event.isBase64Encoded) {
      bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
      console.log('Decoded base64 body:', bodyString);
    }

    let request;
    try {
      request = JSON.parse(bodyString);
      console.log('Parsed request:', JSON.stringify(request));
    } catch (parseError) {
      return createResponse(400, {
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      });
    }

    // Validate message
    if (!request.message || typeof request.message !== 'string') {
      return createResponse(400, {
        error: 'Message is required',
        message: 'Message must be a non-empty string'
      });
    }

    if (request.message.trim().length === 0) {
      return createResponse(400, {
        error: 'Message cannot be empty',
        message: 'Please provide a message'
      });
    }

    if (request.message.length > 5000) {
      return createResponse(400, {
        error: 'Message too long',
        message: 'Message cannot exceed 5000 characters'
      });
    }

    // Process chat flow
    const result = await processChatFlow(request);

    return createResponse(200, result);

  } catch (error) {
    console.error('Chat handler error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
};

/**
 * Process complete chat flow
 */
async function processChatFlow(request) {
  const startTime = Date.now();
  const timestamp = new Date();
  const message = request.message.trim();
  const language = request.language || 'en';
  const sessionId = request.sessionId;

  console.log(`Processing chat: "${message.substring(0, 50)}..." (${language})`);

  // STEP 1: Session Management
  const session = await getOrCreateSession(sessionId, request.userInfo, language);
  const isNewSession = !sessionId;

  // STEP 2: Store User Message
  await storeUserMessage(session.sessionId, message, timestamp);

  // STEP 3: RAG Processing (Knowledge Base + Claude)
  const ragResult = await processRAG(message, language, session.sessionId);

  // STEP 4: Store Bot Response
  await storeBotMessage(
    session.sessionId,
    ragResult.response,
    ragResult.confidence,
    ragResult.sources,
    ragResult.processingTime
  );

  // STEP 5: Check Escalation
  const escalationResult = await checkAndHandleEscalation(
    session.sessionId,
    message,
    ragResult.response,
    ragResult.confidence,
    language
  );

  // STEP 6: Async Analytics Invocation (fire-and-forget)
  invokeAnalyticsAsync({
    sessionId: session.sessionId,
    userMessage: message,
    botResponse: ragResult.response,
    confidence: ragResult.confidence,
    sources: ragResult.sources,
    processingTime: Date.now() - startTime,
    timestamp: timestamp.toISOString(),
    isNewSession,
    language,
    escalationSuggested: escalationResult.isEscalated
  }).catch(err => console.error('Analytics invocation failed (non-blocking):', err));

  // STEP 7: Return Response to User
  return {
    message: escalationResult.isEscalated ? escalationResult.message : ragResult.response,
    sessionId: session.sessionId,
    sources: ragResult.sources,
    escalated: escalationResult.isEscalated,
    confidence: ragResult.confidence
  };
}

//=============================================================================
// SESSION MANAGEMENT (from chat-session-manager)
//=============================================================================

async function getOrCreateSession(sessionId, userInfo, language) {
  // Check if session exists
  if (sessionId) {
    try {
      const result = await dynamodb.send(new GetCommand({
        TableName: DATA_TABLE,
        Key: {
          PK: `SESSION#${sessionId}`,
          SK: 'METADATA'
        }
      }));

      if (result.Item) {
        const existingSession = result.Item;
        console.log(`Found existing session: ${sessionId}`);
        return {
          sessionId: existingSession.sessionId,
          startTime: existingSession.startTime,
          language: existingSession.language || 'en',
          escalated: existingSession.escalated,
          messageCount: existingSession.messageCount,
          lastActivity: existingSession.lastActivity,
          userInfo: existingSession.userInfo,
          ttl: existingSession.ttl
        };
      }
    } catch (error) {
      console.log('Session not found, creating new one');
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
    ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
  };

  await dynamodb.send(new PutCommand({
    TableName: DATA_TABLE,
    Item: {
      PK: `SESSION#${newSessionId}`,
      SK: 'METADATA',
      EntityType: 'SESSION',
      timestamp: newSession.startTime,
      ...newSession
    }
  }));

  console.log(`Created new session: ${newSessionId}`);
  return newSession;
}

async function storeUserMessage(sessionId, content, timestamp) {
  const timestampStr = timestamp.toISOString();
  const userMessage = {
    messageId: `msg-${Date.now()}-user`,
    sessionId,
    content,
    sender: 'user',
    timestamp: timestampStr,
    processingTime: 0
  };

  await dynamodb.send(new PutCommand({
    TableName: DATA_TABLE,
    Item: {
      PK: `SESSION#${sessionId}`,
      SK: `MESSAGE#${timestampStr}#USER`,
      EntityType: 'MESSAGE',
      timestamp: timestampStr,
      ...userMessage,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    }
  }));

  console.log(`Stored user message: ${userMessage.messageId}`);
  return userMessage;
}

//=============================================================================
// RAG PROCESSING (from rag-processor)
//=============================================================================

function preprocessQuery(query, language) {
  let preprocessed = query;

  // Expand common diabetes abbreviations for better semantic matching
  preprocessed = preprocessed
    .replace(/\bT1D\b/gi, 'Type 1 diabetes')
    .replace(/\bT2D\b/gi, 'Type 2 diabetes')
    .replace(/\bDM\b/gi, 'diabetes mellitus')
    .replace(/\bBG\b/gi, 'blood glucose')
    .replace(/\bA1C\b/gi, 'hemoglobin A1C')
    .replace(/\bCGM\b/gi, 'continuous glucose monitor')
    .replace(/\bFBG\b/gi, 'fasting blood glucose')
    .replace(/\bPPG\b/gi, 'postprandial glucose');

  // Add contextual prefix to improve retrieval relevance
  const prefix = language === 'es' ? 'información sobre diabetes:' : 'diabetes information:';
  preprocessed = `${prefix} ${preprocessed}`;

  return preprocessed;
}

async function processRAG(query, language, sessionId) {
  const startTime = Date.now();

  // STEP 1: Retrieve from Knowledge Base
  console.log('Retrieving from Knowledge Base...');
  const preprocessedQuery = preprocessQuery(query, language);
  console.log(`Preprocessed query: "${preprocessedQuery}"`);

  const retrieveCommand = new RetrieveCommand({
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    retrievalQuery: { text: preprocessedQuery },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: MAX_RETRIEVAL_RESULTS
      }
    }
  });

  const retrieveResponse = await bedrockAgent.send(retrieveCommand);
  console.log(`Retrieved ${retrieveResponse.retrievalResults?.length || 0} documents`);

  // STEP 2: Extract and Filter Sources
  const sources = [];
  const retrievalResults = retrieveResponse.retrievalResults || [];

  for (const result of retrievalResults) {
    if (result.content?.text && result.location?.s3Location?.uri) {
      const relevanceScore = result.score || 0;
      sources.push({
        url: result.location.s3Location.uri,
        title: extractTitleFromUri(result.location.s3Location.uri),
        excerpt: result.content.text.length > 200
          ? result.content.text.substring(0, 200) + '...'
          : result.content.text,
        relevanceScore: relevanceScore,
        fullContent: result.content.text
      });
    }
  }

  sources.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Filter by minimum relevance
  const filteredSources = sources.filter(s => s.relevanceScore >= MIN_RELEVANCE_SCORE);
  console.log(`Filtered to ${filteredSources.length} sources above ${MIN_RELEVANCE_SCORE} relevance`);

  // STEP 3: Calculate Confidence
  let topScore = 0;
  let totalRelevanceScore = 0;
  let validSourceCount = 0;

  for (const source of filteredSources) {
    if (source.relevanceScore > 0) {
      totalRelevanceScore += source.relevanceScore;
      validSourceCount++;
      topScore = Math.max(topScore, source.relevanceScore);
    }
  }

  const avgConfidence = validSourceCount > 0 ? totalRelevanceScore / validSourceCount : 0;

  // HYBRID CONFIDENCE STRATEGY:
  // - If we have a highly confident source (>= 0.85), use top score
  //   Rationale: Claude can form accurate answers from one excellent source
  // - Otherwise, use average to ensure overall context quality
  //   Rationale: Marginal sources (0.75-0.85) need support from other good sources
  let confidence;
  let confidenceMethod;

  if (topScore >= HIGH_CONFIDENCE_THRESHOLD) {
    // Strong single source - trust it
    confidence = topScore;
    confidenceMethod = 'top_score';
    console.log(`Using top score strategy: ${topScore.toFixed(3)} >= ${HIGH_CONFIDENCE_THRESHOLD} threshold`);
  } else {
    // No standout source - average quality matters
    confidence = avgConfidence;
    confidenceMethod = 'average';
    console.log(`Using average score strategy: top score ${topScore.toFixed(3)} < ${HIGH_CONFIDENCE_THRESHOLD} threshold`);

    // Additional quality check: If we have very few high-quality sources (< 2),
    // apply a penalty to reflect uncertainty from limited context
    const MIN_QUALITY_SOURCES = 2;
    if (validSourceCount > 0 && validSourceCount < MIN_QUALITY_SOURCES) {
      const sourcePenalty = validSourceCount / MIN_QUALITY_SOURCES;
      const originalConfidence = confidence;
      confidence = avgConfidence * sourcePenalty;
      console.log(`Applied source count penalty: ${validSourceCount}/${MIN_QUALITY_SOURCES} sources → confidence ${originalConfidence.toFixed(3)} → ${confidence.toFixed(3)}`);
    }
  }

  // Log detailed confidence analysis
  console.log(`=== CONFIDENCE ANALYSIS ===`);
  console.log(`Total Sources Retrieved: ${sources.length}`);
  console.log(`Sources Above ${MIN_RELEVANCE_SCORE} Threshold: ${filteredSources.length}`);
  console.log(`Valid Sources (score > 0): ${validSourceCount}`);
  console.log(`Top Score: ${topScore.toFixed(3)}, Avg Score: ${avgConfidence.toFixed(3)}`);
  console.log(`Confidence Method: ${confidenceMethod}`);
  console.log(`Final Confidence: ${confidence.toFixed(3)} (threshold: ${CONFIDENCE_THRESHOLD})`);
  console.log(`Will Escalate: ${confidence < CONFIDENCE_THRESHOLD ? 'YES' : 'NO'}`);
  if (validSourceCount > 0) {
    console.log(`Top ${Math.min(3, filteredSources.length)} Sources:`);
    filteredSources.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.relevanceScore.toFixed(3)}] ${s.title}`);
    });
  } else {
    console.log(`WARNING: No valid sources found for query`);
  }

  // STEP 4: Generate Response with Claude
  let answer;
  if (filteredSources.length === 0) {
    console.log('No high-quality sources found - using fallback response');
    answer = language === 'es'
      ? 'Lo siento, no encontré información confiable para responder a tu pregunta. Por favor, reformula tu pregunta o contacta a un profesional de la salud.'
      : 'I apologize, but I could not find reliable information to answer your question. Please rephrase your question or consult with a healthcare professional.';
  } else {
    console.log('Generating response with Claude...');

    const context = filteredSources.map((source, idx) =>
      `Source ${idx + 1} (Relevance: ${source.relevanceScore.toFixed(2)}):\n${source.fullContent}`
    ).join('\n\n---\n\n');

    const prompt = language === 'es'
      ? `Eres un asistente médico especializado en diabetes. Responde la siguiente pregunta usando SOLO la información proporcionada. Si la información no es suficiente, indícalo claramente.

Contexto de fuentes verificadas:
${context}

Pregunta: ${query}

Proporciona una respuesta precisa, clara y basada únicamente en las fuentes proporcionadas. No incluyas citas de fuentes o referencias como [Fuente 1] en tu respuesta.`
      : `You are a medical assistant specialized in diabetes. Answer the following question using ONLY the provided information. If the information is insufficient, clearly state that.

Context from verified sources:
${context}

Question: ${query}

Provide an accurate, clear response based solely on the provided sources. Do not include source citations or references like [Source 1] in your response.`;

    const invokeCommand = new InvokeModelWithResponseStreamCommand({
      modelId: GENERATION_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const generateResponse = await bedrockRuntime.send(invokeCommand);

    // Collect streamed response chunks
    answer = '';
    for await (const event of generateResponse.body) {
      if (event.chunk) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          answer += chunk.delta.text;
        }
      }
    }

    if (!answer) {
      answer = 'I apologize, but I could not generate a response to your question.';
    }

    console.log(`Generated response: ${answer.substring(0, 100)}...`);
  }

  const processingTime = Date.now() - startTime;

  // Remove fullContent before returning (for both arrays)
  sources.forEach(source => delete source.fullContent);
  filteredSources.forEach(source => delete source.fullContent);

  // Return only the high-quality sources that were actually used in the RAG prompt
  // These are the sources that contributed to the confidence calculation
  return {
    response: answer,
    confidence,
    sources: filteredSources, // Only sources >= MIN_RELEVANCE_SCORE that were sent to Claude
    totalSourcesRetrieved: sources.length, // Total chunks found (for debugging)
    processingTime
  };
}

function extractTitleFromUri(uri) {
  try {
    const filename = uri.split('/').pop() || 'Unknown Source';
    return filename
      .replace(/\.txt$/, '')
      .replace(/https?-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  } catch (error) {
    return 'Diabetes Information';
  }
}

//=============================================================================
// RESPONSE STORAGE & ESCALATION (from chat-response-handler)
//=============================================================================

async function storeBotMessage(sessionId, content, confidence, sources, processingTime) {
  const timestampStr = new Date().toISOString();
  const botMessage = {
    messageId: `msg-${Date.now()}-bot`,
    sessionId,
    content,
    sender: 'bot',
    timestamp: timestampStr,
    confidence,
    sources,
    processingTime
  };

  await dynamodb.send(new PutCommand({
    TableName: DATA_TABLE,
    Item: {
      PK: `SESSION#${sessionId}`,
      SK: `MESSAGE#${timestampStr}#BOT`,
      EntityType: 'MESSAGE',
      timestamp: timestampStr,
      ...botMessage,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    }
  }));

  console.log(`Stored bot message: ${botMessage.messageId}`);
  return botMessage;
}

async function checkAndHandleEscalation(sessionId, userMessage, botResponse, confidence, language) {
  const shouldEsc = shouldEscalate(confidence, userMessage);

  if (shouldEsc) {
    console.log('Escalation triggered');

    // Create escalation record synchronously
    await createEscalationRecord(sessionId, confidence, userMessage);

    // Return user-friendly escalation message
    const escalationMessage = language === 'es'
      ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
      : 'Let me connect you with someone who can help you with that.';

    return {
      isEscalated: true,
      message: escalationMessage
    };
  }

  return {
    isEscalated: false,
    message: botResponse
  };
}

function shouldEscalate(confidence, message) {
  // Escalate if confidence below threshold
  if (confidence < CONFIDENCE_THRESHOLD) {
    return true;
  }

  // Escalate if user explicitly requests human help
  const escalationPatterns = [
    // English
    /\btalk to (a |an )?person\b/i,
    /\bspeak to (a |an )?human\b/i,
    /\bhuman help\b/i,
    /\brepresentative\b/i,
    /\b(talk to|speak to|speak with|see|contact|need|find) (a |an )?(doctor|physician)\b/i,
    /\bmedical (advice|help|professional|guidance)\b/i,
    /\b(medical )?emergency\b/i,
    /\burgent (medical )?(help|care|attention|assistance)\b/i,
    /\b(talk to|speak to|see|need) (a |an )?(nurse|specialist|clinician)\b/i,

    // Spanish
    /\bhablar con (una )?persona\b/i,
    /\bhablar con (un )?humano\b/i,
    /\b(hablar con|ver|contactar|necesito|encontrar) (un |una )?(médico|doctor|doctora)\b/i,
    /\bemergencia( médica)?\b/i,
    /\bayuda urgente( médica)?\b/i,
    /\b(hablar con|ver|necesito) (un |una )?(enfermera|enfermero|especialista)\b/i
  ];

  return escalationPatterns.some(pattern => pattern.test(message));
}

async function createEscalationRecord(sessionId, confidence, questionText) {
  try {
    const escalationId = `esc-${crypto.randomUUID()}`;
    const reason = confidence < CONFIDENCE_THRESHOLD
      ? 'Low confidence response'
      : 'User requested human assistance';

    const escalationRecord = {
      escalationId,
      sessionId,
      reason,
      status: 'pending',
      timestamp: new Date().toISOString(),
      source: 'chat_escalation',
      questionText: questionText || null,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    };

    await dynamodb.send(new PutCommand({
      TableName: ESCALATION_TABLE,
      Item: escalationRecord
    }));

    console.log(`Created escalation record: ${escalationId} (${reason})`);
    return escalationRecord;
  } catch (error) {
    console.error('Failed to create escalation record (non-critical):', error);
    return null;
  }
}

//=============================================================================
// ASYNC ANALYTICS INVOCATION
//=============================================================================

async function invokeAnalyticsAsync(analyticsData) {
  try {
    const command = new InvokeCommand({
      FunctionName: ANALYTICS_PROCESSOR_ARN,
      InvocationType: 'Event', // Fire-and-forget
      Payload: JSON.stringify(analyticsData)
    });

    await lambdaClient.send(command);
    console.log('Analytics processor invoked asynchronously');
  } catch (error) {
    // Log but don't throw - analytics is non-blocking
    console.error('Failed to invoke analytics processor (non-blocking):', error);
  }
}

//=============================================================================
// RESPONSE FORMATTING
//=============================================================================

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}
