/**
 * Chat Response Handler Lambda
 * Handles response processing and escalation (AFTER RAG processing)
 *
 * Responsibilities:
 * - Store bot response in DynamoDB
 * - Check escalation conditions
 * - Modify response if escalation needed
 * - Return structured data for Step Functions
 *
 * This Lambda is invoked by Step Functions after RAG processing completes.
 */

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const DATA_TABLE = process.env.DATA_TABLE; // Consolidated data table
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Response handler invoked:', JSON.stringify(event, null, 2));

  try {
    // Extract inputs from Step Functions
    const { session, userMessage, ragResponse } = event;

    // Validate inputs
    if (!session || !session.sessionId) {
      throw new Error('Session data is required');
    }

    if (!userMessage || !userMessage.content) {
      throw new Error('User message data is required');
    }

    if (!ragResponse) {
      throw new Error('RAG response data is required');
    }

    const timestamp = new Date();
    const startTime = Date.now();

    // STEP 1: Store bot response (using "message" field to match frontend schema)
    const botMessage = ragResponse.message || 'I apologize, but I could not generate a response.';
    await storeBotMessage(
      session.sessionId,
      botMessage,
      ragResponse.confidence || 0.5,
      ragResponse.sources || [],
      0 // Processing time handled by Step Functions
    );

    // STEP 2: Check for escalation
    const escalationSuggested = shouldEscalate(ragResponse.confidence || 0.5, userMessage.content);

    // STEP 3: Create escalation record immediately if needed (for near-real-time availability)
    if (escalationSuggested) {
      await createEscalationRecord(
        session.sessionId,
        ragResponse.confidence || 0.5,
        userMessage.content
      );
    }

    // STEP 4: Modify response if escalation needed
    let finalResponse = botMessage;
    if (escalationSuggested) {
      // Replace generic escalation message with more helpful one
      if (botMessage &&
          (botMessage.includes('Sorry, I am unable to assist you with this request') ||
           botMessage.includes('Lo siento, no puedo ayudarte con esta solicitud'))) {
        finalResponse = (session.language || 'en') === 'es'
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
      console.log(`Escalation suggested - modified response for user-friendly message`);
    }

    const processingTime = Date.now() - startTime;

    // STEP 5: Return structured data for Step Functions (using "message" to match frontend)
    return {
      userResponse: {
        message: finalResponse,
        sources: ragResponse.sources || [],
        sessionId: session.sessionId,
        escalated: escalationSuggested
      },
      analyticsData: {
        sessionId: session.sessionId,
        userMessage: userMessage.content,
        botResponse: botMessage,
        confidence: ragResponse.confidence,
        sources: ragResponse.sources,
        processingTime,
        timestamp: timestamp.toISOString(),
        isNewSession: event.isNewSession || false,
        language: session.language || 'en',
        escalationSuggested
      }
    };

  } catch (error) {
    console.error('Response handler error:', error);
    throw error; // Let Step Functions handle the error
  }
};

/**
 * Store bot response
 */
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

  // Store in consolidated data table with PK/SK pattern
  await dynamodb.send(new PutItemCommand({
    TableName: DATA_TABLE,
    Item: marshall({
      PK: `SESSION#${sessionId}`,
      SK: `MESSAGE#${timestampStr}#BOT`,
      EntityType: 'MESSAGE',
      timestamp: timestampStr,
      ...botMessage,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    }, { removeUndefinedValues: true })
  }));

  return botMessage;
}

/**
 * Create escalation record in DynamoDB
 * This is done synchronously in Response Handler for near-real-time availability
 */
async function createEscalationRecord(sessionId, confidence, questionText) {
  try {
    const escalationId = `esc-${crypto.randomUUID()}`;

    // Determine reason based on confidence or user request
    let reason;
    if (confidence < 0.75) {
      reason = 'Low confidence response';
    } else {
      reason = 'User requested human assistance';
    }

    const escalationRecord = {
      escalationId,
      sessionId,
      reason,
      status: 'pending',
      timestamp: new Date().toISOString(),
      source: 'chat_escalation',
      questionText: questionText || null,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    };

    await dynamodb.send(new PutItemCommand({
      TableName: ESCALATION_TABLE,
      Item: marshall(escalationRecord, { removeUndefinedValues: true })
    }));

    console.log(`✓ Escalation record created immediately: ${escalationId} (${reason})`);
    return escalationRecord;
  } catch (error) {
    // Log error but don't fail the request - escalation creation is important but not critical
    console.error('Failed to create escalation record:', error);
    // Could optionally add to analytics data for retry by Chat Data Processor
    return null;
  }
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
