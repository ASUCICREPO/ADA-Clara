/**
 * Chat Session Manager Lambda
 * Handles session setup and user message storage (BEFORE RAG processing)
 *
 * Responsibilities:
 * - Validate chat request structure
 * - Get or create session
 * - Store user message in DynamoDB
 * - Return session context for downstream processing
 *
 * This Lambda is invoked by Step Functions as the first step in the chat flow.
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Session manager invoked:', JSON.stringify(event, null, 2));

  try {
    // STEP 1: Validate request structure
    if (!event.message || typeof event.message !== 'string') {
      throw new Error('Message content is required and must be a string');
    }

    if (event.message.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    if (event.message.length > 5000) {
      throw new Error('Message content cannot exceed 5000 characters');
    }

    const timestamp = new Date();

    // STEP 2: Check if session exists
    let existingSession = null;
    let isNewSession = false;

    if (event.sessionId) {
      try {
        const result = await dynamodb.send(new GetItemCommand({
          TableName: SESSIONS_TABLE,
          Key: marshall({
            PK: `SESSION#${event.sessionId}`,
            SK: 'METADATA'
          })
        }));

        if (result.Item) {
          existingSession = unmarshall(result.Item);
          console.log(`Found existing session: ${event.sessionId}`);
        }
      } catch (error) {
        console.log('Session not found, will create new one');
      }
    }

    // STEP 3: Get or create session
    const session = await getOrCreateSession(event.sessionId, event.userInfo, existingSession);
    isNewSession = !existingSession;

    // STEP 4: Store user message
    const userMessage = await storeUserMessage(session.sessionId, event.message, timestamp);

    // STEP 5: Return session context for Step Functions
    return {
      session: {
        sessionId: session.sessionId,
        language: session.language,
        messageCount: session.messageCount,
        escalated: session.escalated,
        startTime: session.startTime
      },
      userMessage: {
        messageId: userMessage.messageId,
        content: userMessage.content,
        timestamp: userMessage.timestamp
      },
      isNewSession
    };

  } catch (error) {
    console.error('Session manager error:', error);
    throw error; // Let Step Functions handle the error
  }
};

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
