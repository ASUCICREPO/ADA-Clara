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
  ProfessionalMember,
  UserPreferences,
  AnalyticsData,
  AuditLog,
  EscalationQueue,
  KnowledgeContent,
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
  private readonly PROFESSIONAL_MEMBERS_TABLE = process.env.PROFESSIONAL_MEMBERS_TABLE || 'ada-clara-professional-members';
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'ada-clara-audit-logs';
  private readonly USER_PREFERENCES_TABLE = process.env.USER_PREFERENCES_TABLE || 'ada-clara-user-preferences';
  private readonly ESCALATION_QUEUE_TABLE = process.env.ESCALATION_QUEUE_TABLE || 'ada-clara-escalation-queue';
  private readonly KNOWLEDGE_CONTENT_TABLE = process.env.KNOWLEDGE_CONTENT_TABLE || 'ada-clara-knowledge-content';

  constructor() {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
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
   */
  private prepareDynamoDBItem(item: any): any {
    if (item === null || item === undefined) {
      return item;
    }
    
    if (item instanceof Date) {
      return item.toISOString();
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

  // ===== PROFESSIONAL MEMBERS =====

  async createMember(member: ProfessionalMember): Promise<void> {
    const validation = DataValidator.validateProfessionalMember(member);
    if (!validation.isValid) {
      throw new Error(`Invalid member data: ${validation.errors.join(', ')}`);
    }

    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.memberPK(member.email),
      SK: DynamoDBKeyGenerator.memberSK(),
      ...member
    });

    const command = new PutCommand({
      TableName: this.PROFESSIONAL_MEMBERS_TABLE,
      Item: preparedItem
    });

    await this.client.send(command);
  }

  async getMember(email: string): Promise<ProfessionalMember | null> {
    const command = new GetCommand({
      TableName: this.PROFESSIONAL_MEMBERS_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.memberPK(email),
        SK: DynamoDBKeyGenerator.memberSK()
      }
    });

    const result = await this.client.send(command);
    if (!result.Item) return null;

    const { PK, SK, ...member } = result.Item;
    return member as ProfessionalMember;
  }

  async updateMember(email: string, updates: Partial<ProfessionalMember>): Promise<void> {
    const preparedUpdates = this.prepareDynamoDBItem(updates);
    
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(preparedUpdates).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpression.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });

    const command = new UpdateCommand({
      TableName: this.PROFESSIONAL_MEMBERS_TABLE,
      Key: {
        PK: DynamoDBKeyGenerator.memberPK(email),
        SK: DynamoDBKeyGenerator.memberSK()
      },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    await this.client.send(command);
  }

  // ===== USER PREFERENCES =====

  async setUserPreferences(preferences: UserPreferences): Promise<void> {
    const preparedItem = this.prepareDynamoDBItem({
      PK: DynamoDBKeyGenerator.userPreferencesPK(preferences.userId),
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

    const command = new PutCommand({
      TableName: this.ESCALATION_QUEUE_TABLE,
      Item: {
        PK: DynamoDBKeyGenerator.escalationPK(escalation.status),
        SK: DynamoDBKeyGenerator.escalationSK(escalation.createdAt, escalation.sessionId),
        ...escalationWithTTL
      }
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
}