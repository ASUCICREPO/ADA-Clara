import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand,
  BatchWriteCommand,
  BatchGetCommand
} from '@aws-sdk/lib-dynamodb';
import {
  UserSession,
  ChatMessage,
  UserPreferences,
  AnalyticsData,
  AuditLog,
  EscalationQueue,
  KnowledgeContent,
  ConversationData, // Simplified interface replacing ConversationRecord
  MessageRecord,
  QuestionRecord,
  DynamoDBKeyGenerator,
  TTLCalculator,
  DataValidator
} from '../types/index';

/**
 * DynamoDB Service for ADA Clara Chatbot
 * Handles all database operations using the DynamoDB Document Client
 */
export class DynamoDBService {
  private client: DynamoDBDocumentClient;
  
  // Table names from environment variables
  private readonly CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'ada-clara-audit-logs';
  private readonly USER_PREFERENCES_TABLE = process.env.USER_PREFERENCES_TABLE || 'ada-clara-user-preferences';
  private readonly ESCALATION_QUEUE_TABLE = process.env.ESCALATION_QUEUE_TABLE || 'ada-clara-escalation-queue';
  private readonly KNOWLEDGE_CONTENT_TABLE = process.env.KNOWLEDGE_CONTENT_TABLE || 'ada-clara-knowledge-content';
  
  // New tables for enhanced analytics
  // CONVERSATIONS_TABLE removed - using CHAT_SESSIONS_TABLE instead
  private readonly MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'ada-clara-messages';
  private readonly QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';

  constructor(config?: { region?: string; endpoint?: string }) {
    const dynamoClient = new DynamoDBClient({
      region: config?.region || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
      ...(config?.endpoint ? { endpoint: config.endpoint } : {})
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        convertClassInstanceToMap: true,
        removeUndefinedValues: true
      }
    });
  }

  /**
   * Convert Date objects to ISO strings for DynamoDB storage
   * Also handles boolean to string conversion for GSI compatibility
   */
  private prepareDynamoDBItem(item: any): any {
    if (item === null || item === undefined) {
      return item;
    }
    
    if (item instanceof Date) {
      return item.toISOString();
    }
    
    if (typeof item === 'boolean') {
      return item.toString();
    }
    
    if (Array.isArray(item)) {
      return item.map(element => this.prepareDynamoDBItem(element));
    }
    
    if (typeof item === 'object') {
      const prepared: any = {};
      Object.keys(item).forEach(key => {
        prepared[key] = this.prepareDynamoDBItem(item[key]);
      });
      return prepared;
    }
    
    return item;
  }

  // ===== CHAT SESSIONS =====

  async createSession(session: Omit<UserSession, 'ttl'>): Promise<UserSession> {
    const validation = DataValidator.validateUserSession(session);
    if (!validation.isValid) {
      throw new Error(`Invalid session data: ${validation.errors.join(', ')}`);
    }

    const sessionWithTTL: UserSession = {
      ...session,
      ttl: TTLCalculator.sessionTTL()
    };

    const command = new PutCommand({
      TableName: this.CHAT_SESSIONS_TABLE,
      Item: {
        PK: DynamoDBKeyGenerator.sessionPK(session.sessionId),
        SK: DynamoDBKeyGenerator.sessionMetadataSK(),
        ...sessionWithTTL
      }
    });

    await this.client.send(command);
    return sessionWithTTL;
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const command = new GetCommand({
      TableName: this.CHAT_SESSIONS_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.sessionPK(sessionId),
        SK: DynamoDBKeyGenerator.sessionMetadataSK()
      }
    });

    const result = await this.client.send(command);
    if (!result.Item) return null;

    // Remove DynamoDB keys from response
    const { PK, SK, ...session } = result.Item;
    return session as UserSession;
  }

  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<void> {
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpression.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });

    const command = new UpdateCommand({
      TableName: this.CHAT_SESSIONS_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.sessionPK(sessionId),
        SK: DynamoDBKeyGenerator.sessionMetadataSK()
      },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    await this.client.send(command);
  }

  async addMessage(message: Omit<ChatMessage, 'ttl'>): Promise<ChatMessage> {
    const validation = DataValidator.validateChatMessage(message);
    if (!validation.isValid) {
      throw new Error(`Invalid message data: ${validation.errors.join(', ')}`);
    }

    const messageWithTTL: ChatMessage = {
      ...message,
      ttl: TTLCalculator.messageTTL()
    };

    const command = new PutCommand({
      TableName: this.CHAT_SESSIONS_TABLE,
      Item: {
        PK: DynamoDBKeyGenerator.sessionPK(message.sessionId),
        SK: DynamoDBKeyGenerator.messageSK(message.timestamp, message.messageId),
        ...messageWithTTL
      }
    });

    await this.client.send(command);
    return messageWithTTL;
  }

  async getSessionMessages(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    const command = new QueryCommand({
      TableName: this.CHAT_SESSIONS_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': DynamoDBKeyGenerator.sessionPK(sessionId),
        ':sk': 'MESSAGE#'
      },
      ScanIndexForward: true, // Sort by timestamp ascending
      Limit: limit
    });

    const result = await this.client.send(command);
    return (result.Items || []).map(item => {
      const { PK, SK, ...message } = item;
      return message as ChatMessage;
    });
  }

  // ===== USER PREFERENCES =====

  async setUserPreferences(preferences: UserPreferences): Promise<void> {
    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.userPreferencesPK(preferences.userId || preferences.sessionId),
      SK: DynamoDBKeyGenerator.userPreferencesSK(),
      ...preferences
    });

    const command = new PutCommand({
      TableName: this.USER_PREFERENCES_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const command = new GetCommand({
      TableName: this.USER_PREFERENCES_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.userPreferencesPK(userId),
        SK: DynamoDBKeyGenerator.userPreferencesSK()
      }
    });

    const result = await this.client.send(command);
    if (!result.Item) return null;

    const { PK, SK, ...preferences } = result.Item;
    return preferences as UserPreferences;
  }

  // ===== ANALYTICS =====

  async recordAnalytics(analytics: AnalyticsData): Promise<void> {
    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.analyticsPK(analytics.date, analytics.type),
      SK: DynamoDBKeyGenerator.analyticsSK(analytics.hour, analytics.metric),
      ...analytics
    });

    const command = new PutCommand({
      TableName: this.ANALYTICS_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getAnalytics(date: string, type: string, startHour?: number, endHour?: number): Promise<AnalyticsData[]> {
    let keyConditionExpression = 'PK = :pk';
    const expressionAttributeValues: Record<string, any> = {
      ':pk': DynamoDBKeyGenerator.analyticsPK(date, type)
    };

    if (startHour !== undefined && endHour !== undefined) {
      keyConditionExpression += ' AND SK BETWEEN :startSK AND :endSK';
      expressionAttributeValues[':startSK'] = startHour.toString().padStart(2, '0');
      expressionAttributeValues[':endSK'] = endHour.toString().padStart(2, '0');
    }

    const command = new QueryCommand({
      TableName: this.ANALYTICS_TABLE,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues
    });

    const result = await this.client.send(command);
    return (result.Items || []).map(item => {
      const { PK, SK, ...analytics } = item;
      return analytics as AnalyticsData;
    });
  }

  // ===== AUDIT LOGS =====

  async logAuditEvent(auditLog: Omit<AuditLog, 'ttl'>): Promise<void> {
    const auditLogWithTTL: AuditLog = {
      ...auditLog,
      ttl: TTLCalculator.auditTTL()
    };

    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.auditPK(auditLog.timestamp.toISOString().split('T')[0]),
      SK: DynamoDBKeyGenerator.auditSK(auditLog.timestamp, auditLog.eventType, auditLog.userId),
      ...auditLogWithTTL
    });

    const command = new PutCommand({
      TableName: this.AUDIT_LOGS_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getAuditLogs(date: string, eventType?: string): Promise<AuditLog[]> {
    let keyConditionExpression = 'PK = :pk';
    const expressionAttributeValues: Record<string, any> = {
      ':pk': DynamoDBKeyGenerator.auditPK(date)
    };

    if (eventType) {
      keyConditionExpression += ' AND begins_with(SK, :eventType)';
      expressionAttributeValues[':eventType'] = `${new Date().toISOString()}#${eventType}`;
    }

    const command = new QueryCommand({
      TableName: this.AUDIT_LOGS_TABLE,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false // Most recent first
    });

    const result = await this.client.send(command);
    return (result.Items || []).map(item => {
      const { PK, SK, ...auditLog } = item;
      return auditLog as AuditLog;
    });
  }

  // ===== ESCALATION QUEUE =====

  async addToEscalationQueue(escalation: Omit<EscalationQueue, 'ttl'>): Promise<void> {
    const escalationWithTTL: EscalationQueue = {
      ...escalation,
      ttl: TTLCalculator.escalationTTL()
    };

    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.escalationPK(escalation.status),
      SK: DynamoDBKeyGenerator.escalationSK(escalation.createdAt, escalation.sessionId),
      ...escalationWithTTL
    });

    const command = new PutCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getEscalationsByStatus(status: string): Promise<EscalationQueue[]> {
    const command = new QueryCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': DynamoDBKeyGenerator.escalationPK(status)
      },
      ScanIndexForward: true // Oldest first
    });

    const result = await this.client.send(command);
    return (result.Items || []).map(item => {
      const { PK, SK, ...escalation } = item;
      return escalation as EscalationQueue;
    });
  }

  async updateEscalationStatus(
    oldStatus: string, 
    sessionId: string, 
    createdAt: Date, 
    newStatus: string,
    updates?: Partial<EscalationQueue>
  ): Promise<void> {
    // Get the existing escalation
    const getCommand = new GetCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.escalationPK(oldStatus),
        SK: DynamoDBKeyGenerator.escalationSK(createdAt, sessionId)
      }
    });

    const result = await this.client.send(getCommand);
    if (!result.Item) {
      throw new Error('Escalation not found');
    }

    // Delete from old status
    const deleteCommand = new DeleteCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.escalationPK(oldStatus),
        SK: DynamoDBKeyGenerator.escalationSK(createdAt, sessionId)
      }
    });

    await this.client.send(deleteCommand);

    // Add to new status with updates
    const { PK, SK, ...escalation } = result.Item;
    const updatedEscalation = {
      ...escalation,
      status: newStatus,
      updatedAt: new Date(),
      ...updates
    } as EscalationQueue;

    const putCommand = new PutCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      Item: {
        PK: DynamoDBKeyGenerator.escalationPK(newStatus),
        SK: DynamoDBKeyGenerator.escalationSK(createdAt, sessionId),
        ...updatedEscalation
      }
    });

    await this.client.send(putCommand);
  }

  // ===== KNOWLEDGE CONTENT =====

  async storeKnowledgeContent(content: KnowledgeContent): Promise<void> {
    const command = new PutCommand({
      TableName: this.KNOWLEDGE_CONTENT_TABLE,
      Item: {
        PK: DynamoDBKeyGenerator.contentPK(content.contentType),
        SK: DynamoDBKeyGenerator.contentSK(content.url, content.lastUpdated),
        ...content
      }
    });

    await this.client.send(command);
  }

  async getKnowledgeContentByType(contentType: string, language?: string): Promise<KnowledgeContent[]> {
    const command = new QueryCommand({
      TableName: this.KNOWLEDGE_CONTENT_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': DynamoDBKeyGenerator.contentPK(contentType)
      }
    });

    const result = await this.client.send(command);
    let items = (result.Items || []).map(item => {
      const { PK, SK, ...content } = item;
      return content as KnowledgeContent;
    });

    // Filter by language if specified
    if (language) {
      items = items.filter(item => item.language === language);
    }

    return items;
  }

  // ===== ENHANCED ANALYTICS TABLES =====
  // CONVERSATIONS TABLE methods removed - using CHAT_SESSIONS_TABLE instead

  // ===== MESSAGES TABLE =====

  async getConversationsByDateRange(startDate: string, endDate: string, language?: 'en' | 'es'): Promise<ConversationData[]> {
    // REPLACEMENT: Use chat sessions instead of conversations table
    // This method now queries the CHAT_SESSIONS_TABLE instead of CONVERSATIONS_TABLE
    // to eliminate redundant conversation tracking while maintaining analytics functionality
    console.log(`[DynamoDB] Getting conversations by date range: ${startDate} to ${endDate}, language: ${language || 'all'}`);
    
    // Get all chat sessions and filter by date range
    // Only get session metadata records, not individual messages
    const allSessions = await this.scanItems(this.CHAT_SESSIONS_TABLE, {
      filterExpression: 'begins_with(PK, :pk) AND SK = :sk',
      expressionAttributeValues: {
        ':pk': 'SESSION#',
        ':sk': 'METADATA'
      }
    });

    console.log(`[DynamoDB] Found ${allSessions.length} total chat sessions`);

    // Filter by date range with comprehensive validation
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end date

    const validSessions = allSessions.filter(session => {
      // Validate session has required fields
      if (!session.sessionId) {
        console.log(`[DynamoDB] Skipping session - no sessionId: ${session.PK}`);
        return false;
      }
      
      if (!session.startTime) {
        console.log(`[DynamoDB] Skipping session ${session.sessionId} - no startTime`);
        return false;
      }
      
      // Validate startTime is a valid date
      const sessionDate = new Date(session.startTime);
      if (isNaN(sessionDate.getTime())) {
        console.log(`[DynamoDB] Skipping session ${session.sessionId} - invalid startTime: ${session.startTime}`);
        return false;
      }
      
      // Check date range
      const inDateRange = sessionDate >= start && sessionDate <= end;
      if (!inDateRange) {
        return false; // Don't log every out-of-range session to reduce noise
      }
      
      // Check language filter
      const matchesLanguage = !language || session.language === language;
      if (!matchesLanguage) {
        return false;
      }
      
      return true;
    });

    console.log(`[DynamoDB] Filtered to ${validSessions.length} valid sessions in date range`);

    // Convert UserSession format to ConversationRecord format for compatibility
    return validSessions.map(session => {
      // Ensure we have valid dates
      const startTime = session.startTime;
      const endTime = session.endTime || null;
      const date = new Date(startTime).toISOString().split('T')[0];
      
      return {
        conversationId: session.sessionId,
        userId: session.userId || `user-${session.sessionId}`,
        sessionId: session.sessionId,
        startTime: startTime,
        endTime: endTime,
        timestamp: startTime,
        date: date,
        language: session.language || 'en',
        messageCount: session.messageCount || 0,
        outcome: session.escalated ? 'escalated' : 'resolved',
        escalationReason: session.escalationReason || undefined,
        escalationTimestamp: session.escalationTimestamp || undefined,
        userInfo: session.userInfo || undefined
      } as ConversationData;
    });
  }

  // getConversationsByUser method removed - using chat sessions instead

  // updateConversationRecord method removed - using chat sessions instead

  // ===== MESSAGES TABLE =====

  async createMessageRecord(message: MessageRecord): Promise<void> {
    const validation = DataValidator.validateMessageRecord(message);
    if (!validation.isValid) {
      throw new Error(`Invalid message data: ${validation.errors.join(', ')}`);
    }

    const preparedItem = this.prepareDynamoDBItem({
      ...message,
      conversationId: message.conversationId,
      messageIndex: message.messageIndex
    });

    const command = new PutCommand({
      TableName: this.MESSAGES_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getMessagesByConversation(conversationId: string, limit?: number): Promise<MessageRecord[]> {
    const command = new QueryCommand({
      TableName: this.MESSAGES_TABLE,
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId
      },
      ScanIndexForward: true, // Chronological order
      Limit: limit
    });

    const result = await this.client.send(command);
    return (result.Items || []) as MessageRecord[];
  }

  async getMessagesByConfidenceRange(minConfidence: number, maxConfidence: number, messageType: 'user' | 'bot' = 'bot'): Promise<MessageRecord[]> {
    const command = new QueryCommand({
      TableName: this.MESSAGES_TABLE,
      IndexName: 'ConfidenceIndex',
      KeyConditionExpression: '#type = :type AND confidenceScore BETWEEN :minConf AND :maxConf',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':type': messageType,
        ':minConf': minConfidence,
        ':maxConf': maxConfidence
      }
    });

    const result = await this.client.send(command);
    return (result.Items || []) as MessageRecord[];
  }

  async getEscalationTriggerMessages(startDate: string, endDate: string): Promise<MessageRecord[]> {
    const command = new QueryCommand({
      TableName: this.MESSAGES_TABLE,
      IndexName: 'EscalationIndex',
      KeyConditionExpression: 'escalationTrigger = :trigger AND #timestamp BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':trigger': 'true', // DynamoDB stores boolean as string in GSI
        ':startDate': startDate,
        ':endDate': endDate
      }
    });

    const result = await this.client.send(command);
    return (result.Items || []) as MessageRecord[];
  }

  // ===== QUESTIONS TABLE =====

  async createOrUpdateQuestionRecord(question: QuestionRecord): Promise<void> {
    const validation = DataValidator.validateQuestionRecord(question);
    if (!validation.isValid) {
      throw new Error(`Invalid question data: ${validation.errors.join(', ')}`);
    }

    // Try to get existing record first
    const existingQuestion = await this.getQuestionRecord(question.questionHash, question.date);
    
    if (existingQuestion) {
      // Update existing record
      const updatedQuestion: QuestionRecord = {
        ...existingQuestion,
        count: existingQuestion.count + question.count,
        totalConfidenceScore: existingQuestion.totalConfidenceScore + question.totalConfidenceScore,
        answeredCount: existingQuestion.answeredCount + question.answeredCount,
        unansweredCount: existingQuestion.unansweredCount + question.unansweredCount,
        escalationCount: existingQuestion.escalationCount + question.escalationCount,
        lastAsked: question.lastAsked
      };
      
      // Recalculate average confidence
      updatedQuestion.averageConfidenceScore = updatedQuestion.totalConfidenceScore / updatedQuestion.count;

      const preparedItem = this.prepareDynamoDBItem({
        ...updatedQuestion,
        questionHash: updatedQuestion.questionHash,
        date: updatedQuestion.date
      });

      const command = new PutCommand({
        TableName: this.QUESTIONS_TABLE,
        Item: preparedItem
      });

      await this.client.send(command);
    } else {
      // Create new record
      const preparedItem = this.prepareDynamoDBItem({
        ...question,
        questionHash: question.questionHash,
        date: question.date
      });

      const command = new PutCommand({
        TableName: this.QUESTIONS_TABLE,
        Item: preparedItem
      });

      await this.client.send(command);
    }
  }

  async getQuestionRecord(questionHash: string, date: string): Promise<QuestionRecord | null> {
    const command = new GetCommand({
      TableName: this.QUESTIONS_TABLE,
      Key: {
        questionHash: questionHash,
        date: date
      }
    });

    const result = await this.client.send(command);
    if (!result.Item) return null;

    return result.Item as QuestionRecord;
  }

  async getQuestionsByCategory(category: string, limit?: number): Promise<QuestionRecord[]> {
    const command = new QueryCommand({
      TableName: this.QUESTIONS_TABLE,
      IndexName: 'CategoryIndex',
      KeyConditionExpression: 'category = :category',
      ExpressionAttributeValues: {
        ':category': category
      },
      ScanIndexForward: false, // Highest count first
      Limit: limit
    });

    const result = await this.client.send(command);
    return (result.Items || []) as QuestionRecord[];
  }

  async getUnansweredQuestionsByDate(date: string, limit?: number): Promise<QuestionRecord[]> {
    const command = new QueryCommand({
      TableName: this.QUESTIONS_TABLE,
      IndexName: 'UnansweredIndex',
      KeyConditionExpression: '#date = :date',
      ExpressionAttributeNames: {
        '#date': 'date'
      },
      ExpressionAttributeValues: {
        ':date': date
      },
      ScanIndexForward: false, // Highest unanswered count first
      Limit: limit
    });

    const result = await this.client.send(command);
    return (result.Items || []) as QuestionRecord[];
  }

  async getQuestionsByLanguage(language: 'en' | 'es', limit?: number): Promise<QuestionRecord[]> {
    const command = new QueryCommand({
      TableName: this.QUESTIONS_TABLE,
      IndexName: 'LanguageIndex',
      KeyConditionExpression: '#language = :language',
      ExpressionAttributeNames: {
        '#language': 'language'
      },
      ExpressionAttributeValues: {
        ':language': language
      },
      ScanIndexForward: false, // Most recent first
      Limit: limit
    });

    const result = await this.client.send(command);
    return (result.Items || []) as QuestionRecord[];
  }

  // ===== ANALYTICS AGGREGATION METHODS =====

  async getConversationAnalyticsByDateRange(
    startDate: string, 
    endDate: string, 
    language?: 'en' | 'es'
  ): Promise<{
    totalConversations: number;
    conversationsByDate: Array<{ date: string; count: number; languages: { en: number; es: number } }>;
    languageDistribution: { en: number; es: number };
    averageConfidenceScore: number;
    unansweredPercentage: number;
  }> {
    const conversations = await this.getConversationsByDateRange(startDate, endDate, language);
    
    // Group by date
    const conversationsByDate = new Map<string, { en: number; es: number }>();
    let totalEn = 0;
    let totalEs = 0;
    let totalConfidenceScore = 0;
    let unansweredCount = 0;
    
    conversations.forEach(conv => {
      const date = conv.date;
      if (!conversationsByDate.has(date)) {
        conversationsByDate.set(date, { en: 0, es: 0 });
      }
      
      const dateStats = conversationsByDate.get(date)!;
      dateStats[conv.language]++;
      
      if (conv.language === 'en') totalEn++;
      else totalEs++;
      
      totalConfidenceScore += 0; // Confidence scores no longer tracked at conversation level
      
      // Consider conversation unanswered if it was escalated
      if (conv.outcome === 'escalated') {
        unansweredCount++;
      }
    });
    
    const conversationsByDateArray = Array.from(conversationsByDate.entries()).map(([date, languages]) => ({
      date,
      count: languages.en + languages.es,
      languages
    }));
    
    return {
      totalConversations: conversations.length,
      conversationsByDate: conversationsByDateArray,
      languageDistribution: { en: totalEn, es: totalEs },
      averageConfidenceScore: 0, // Confidence scores no longer tracked at conversation level
      unansweredPercentage: conversations.length > 0 ? (unansweredCount / conversations.length) * 100 : 0
    };
  }

  /**
   * Get messages by date range for question extraction
   */
  async getMessagesByDateRange(startDate: string, endDate: string, messageType?: 'user' | 'bot'): Promise<MessageRecord[]> {
    const messages: MessageRecord[] = [];
    
    // Since we don't have a date-based GSI on messages, we'll need to scan
    // In production, consider adding a DateIndex GSI for better performance
    const command = new ScanCommand({
      TableName: this.MESSAGES_TABLE,
      FilterExpression: '#timestamp BETWEEN :startDate AND :endDate' + 
                       (messageType ? ' AND #type = :type' : ''),
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp',
        ...(messageType ? { '#type': 'type' } : {})
      },
      ExpressionAttributeValues: {
        ':startDate': startDate,
        ':endDate': endDate + 'T23:59:59.999Z', // Include full end date
        ...(messageType ? { ':type': messageType } : {})
      }
    });

    const result = await this.client.send(command);
    return (result.Items || []) as MessageRecord[];
  }

  // ===== UTILITY METHODS =====

  /**
   * Health check - verify connection to DynamoDB
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get a non-existent item to test connection
      const command = new GetCommand({
        TableName: this.CHAT_SESSIONS_TABLE,
        Key: {
          PK: 'HEALTH_CHECK',
          SK: 'TEST'
        }
      });
      
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('DynamoDB health check failed:', error);
      return false;
    }
  }

  /**
   * Batch write multiple items across tables
   */
  async batchWrite(items: Array<{ tableName: string; item: any }>): Promise<void> {
    const requestItems: Record<string, any[]> = {};

    items.forEach(({ tableName, item }) => {
      if (!requestItems[tableName]) {
        requestItems[tableName] = [];
      }
      requestItems[tableName].push({
        PutRequest: { Item: item }
      });
    });

    const command = new BatchWriteCommand({
      RequestItems: requestItems
    });

    await this.client.send(command);
  }

  // ===== GENERIC METHODS FOR BACKWARD COMPATIBILITY =====

  /**
   * Generic get item method for backward compatibility
   */
  async getItem(tableName: string, key: any): Promise<any> {
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    });

    const result = await this.client.send(command);
    return result.Item || null;
  }

  /**
   * Generic put item method for backward compatibility
   */
  async putItem(tableName: string, item: any): Promise<void> {
    const preparedItem = this.prepareDynamoDBItem(item);
    
    const command = new PutCommand({
      TableName: tableName,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  /**
   * Generic query items method for backward compatibility
   */
  async queryItems(tableName: string, keyConditionExpression: string, expressionAttributeValues?: any, options?: any): Promise<any[]> {
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...options
    });

    const result = await this.client.send(command);
    return result.Items || [];
  }

  /**
   * Generic scan items method for backward compatibility
   */
  async scanItems(tableName: string, options?: any): Promise<any[]> {
    const allItems: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const command = new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
        ...options
      });

      const result = await this.client.send(command);
      if (result.Items) {
        allItems.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems;
  }
}