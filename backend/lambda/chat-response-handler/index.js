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

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;

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

    // STEP 1: Store bot response
    await storeBotMessage(
      session.sessionId,
      ragResponse.response || 'I apologize, but I could not generate a response.',
      ragResponse.confidence || 0.5,
      ragResponse.sources || [],
      0 // Processing time handled by Step Functions
    );

    // STEP 2: Check for escalation
    const escalationSuggested = shouldEscalate(ragResponse.confidence || 0.5, userMessage.content);

    // STEP 3: Modify response if escalation needed
    let finalResponse = ragResponse.response;
    if (escalationSuggested) {
      // Replace generic escalation message with more helpful one
      if (ragResponse.response &&
          (ragResponse.response.includes('Sorry, I am unable to assist you with this request') ||
           ragResponse.response.includes('Lo siento, no puedo ayudarte con esta solicitud'))) {
        finalResponse = (session.language || 'en') === 'es'
          ? 'Permíteme conectarte con alguien que pueda ayudarte con eso.'
          : 'Let me connect you with someone who can help you with that.';
      }
      console.log(`Escalation suggested - modified response for user-friendly message`);
    }

    const processingTime = Date.now() - startTime;

    // STEP 4: Return structured data for Step Functions
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
        botResponse: ragResponse.response,
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
