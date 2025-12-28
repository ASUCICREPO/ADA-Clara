/**
 * Context Service for ADA Clara Chatbot
 * Manages conversation context, session state, and user preferences
 * Task 7.3: Conversation Context Management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { 
  ConversationContext, 
  SessionState, 
  ConversationMemory, 
  UserPreferences,
  ChatMessage 
} from '../types/index.js';

export class ContextService {
  private dynamoClient: DynamoDBDocumentClient;
  private chatSessionsTable: string;
  private userPreferencesTable: string;

  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.chatSessionsTable = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
    this.userPreferencesTable = process.env.USER_PREFERENCES_TABLE || 'ada-clara-user-preferences';
  }

  /**
   * Get conversation context for a session
   */
  async getConversationContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const command = new GetCommand({
        TableName: this.chatSessionsTable,
        Key: { sessionId }
      });

      const result = await this.dynamoClient.send(command);
      
      if (!result.Item) {
        return null;
      }

      // Convert DynamoDB item to ConversationContext
      return {
        conversationId: result.Item.conversationId,
        sessionId: result.Item.sessionId,
        userId: result.Item.userId,
        startTime: result.Item.startTime,
        lastActivity: result.Item.lastActivity,
        messageCount: result.Item.messageCount || 0,
        currentTopic: result.Item.currentTopic,
        language: result.Item.language || 'en',
        conversationMemory: result.Item.conversationMemory || this.createEmptyMemory(),
        sessionState: result.Item.sessionState || this.createEmptySessionState(sessionId)
      };
    } catch (error) {
      console.error('Error getting conversation context:', error);
      return null;
    }
  }

  /**
   * Update conversation context
   */
  async updateConversationContext(context: ConversationContext): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.chatSessionsTable,
        Item: {
          ...context,
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
        }
      });

      await this.dynamoClient.send(command);
      console.log(`Updated conversation context for session: ${context.sessionId}`);
    } catch (error) {
      console.error('Error updating conversation context:', error);
      throw error;
    }
  }

  /**
   * Get session state
   */
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const context = await this.getConversationContext(sessionId);
    return context?.sessionState || null;
  }

  /**
   * Update session state
   */
  async updateSessionState(sessionId: string, sessionState: Partial<SessionState>): Promise<void> {
    try {
      const command = new UpdateCommand({
        TableName: this.chatSessionsTable,
        Key: { sessionId },
        UpdateExpression: 'SET sessionState = :sessionState, lastActivity = :lastActivity',
        ExpressionAttributeValues: {
          ':sessionState': sessionState,
          ':lastActivity': new Date().toISOString()
        }
      });

      await this.dynamoClient.send(command);
      console.log(`Updated session state for session: ${sessionId}`);
    } catch (error) {
      console.error('Error updating session state:', error);
      throw error;
    }
  }

  /**
   * Get conversation memory
   */
  async getConversationMemory(sessionId: string): Promise<ConversationMemory | null> {
    const context = await this.getConversationContext(sessionId);
    return context?.conversationMemory || null;
  }

  /**
   * Add message to conversation memory
   */
  async addToMemory(sessionId: string, message: ChatMessage): Promise<void> {
    try {
      const context = await this.getConversationContext(sessionId);
      if (!context) {
        console.warn(`No context found for session ${sessionId}, cannot add to memory`);
        return;
      }

      // Add message to memory
      const memory = context.conversationMemory;
      memory.recentMessages.push({
        messageId: `${sessionId}-${Date.now()}`,
        content: message.content,
        sender: message.sender,
        timestamp: message.timestamp,
        confidence: message.confidenceScore
      });

      // Limit memory size
      if (memory.recentMessages.length > memory.maxMessages) {
        memory.recentMessages = memory.recentMessages.slice(-memory.maxMessages);
      }

      // Extract and update topics (simplified implementation)
      if (message.sender === 'user') {
        await this.extractAndUpdateTopics(memory, message.content);
      }

      // Extract and update entities (simplified implementation)
      await this.extractAndUpdateEntities(memory, message.content);

      // Update context with new memory
      context.conversationMemory = memory;
      context.lastActivity = new Date().toISOString();
      context.messageCount += 1;

      await this.updateConversationContext(context);
    } catch (error) {
      console.error('Error adding to conversation memory:', error);
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(sessionId: string, userId?: string): Promise<UserPreferences | null> {
    try {
      // Try to get by userId first, then by sessionId
      const key = userId ? { userId } : { sessionId };
      
      const command = new GetCommand({
        TableName: this.userPreferencesTable,
        Key: key
      });

      const result = await this.dynamoClient.send(command);
      
      if (!result.Item) {
        // Return default preferences
        return this.createDefaultPreferences(sessionId, userId);
      }

      return result.Item as UserPreferences;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return this.createDefaultPreferences(sessionId, userId);
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(preferences: UserPreferences): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.userPreferencesTable,
        Item: {
          ...preferences,
          updatedAt: new Date().toISOString()
        }
      });

      await this.dynamoClient.send(command);
      console.log(`Updated user preferences for session: ${preferences.sessionId}`);
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Create new conversation context
   */
  async createConversationContext(
    sessionId: string, 
    userId?: string, 
    language: 'en' | 'es' = 'en'
  ): Promise<ConversationContext> {
    const now = new Date().toISOString();
    const conversationId = `conv-${sessionId}-${Date.now()}`;

    const context: ConversationContext = {
      conversationId,
      sessionId,
      userId,
      startTime: now,
      lastActivity: now,
      messageCount: 0,
      language,
      conversationMemory: this.createEmptyMemory(),
      sessionState: this.createEmptySessionState(sessionId)
    };

    await this.updateConversationContext(context);
    return context;
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
    try {
      const memory = await this.getConversationMemory(sessionId);
      if (!memory) {
        return [];
      }

      // Return recent messages as ChatMessage format
      return memory.recentMessages.slice(-limit).map(msg => ({
        messageId: msg.messageId,
        sessionId,
        conversationId: `conv-${sessionId}`,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp,
        language: 'en', // Default, should be from context
        confidenceScore: msg.confidence,
        escalationTrigger: false,
        isAnswered: msg.sender === 'bot'
      }));
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    // TTL will handle automatic cleanup, but this method can be used for manual cleanup
    console.log('Session cleanup handled by DynamoDB TTL');
  }

  /**
   * Create empty conversation memory
   */
  private createEmptyMemory(): ConversationMemory {
    return {
      recentMessages: [],
      topics: [],
      entities: [],
      questions: [],
      maxMessages: 20 // Configurable limit
    };
  }

  /**
   * Create empty session state
   */
  private createEmptySessionState(sessionId: string): SessionState {
    const now = new Date().toISOString();
    return {
      sessionId,
      isActive: true,
      startTime: now,
      lastActivity: now,
      preferences: this.createDefaultPreferences(sessionId),
      escalationStatus: 'none'
    };
  }

  /**
   * Create default user preferences
   */
  private createDefaultPreferences(sessionId: string, userId?: string): UserPreferences {
    const now = new Date().toISOString();
    return {
      userId,
      sessionId,
      language: 'en',
      communicationStyle: 'casual',
      topicInterests: [],
      escalationPreference: 'after_attempts',
      dataRetention: 'session_only',
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Extract and update topics from message content (simplified)
   */
  private async extractAndUpdateTopics(memory: ConversationMemory, content: string): Promise<void> {
    // Simplified topic extraction - in production, this would use NLP
    const diabetesTopics = [
      'type 1', 'type 2', 'insulin', 'blood sugar', 'glucose', 'diet', 'exercise',
      'medication', 'symptoms', 'diagnosis', 'treatment', 'complications'
    ];

    const now = new Date().toISOString();
    const contentLower = content.toLowerCase();

    for (const topic of diabetesTopics) {
      if (contentLower.includes(topic)) {
        const existingTopic = memory.topics.find(t => t.topic === topic);
        if (existingTopic) {
          existingTopic.lastMentioned = now;
          existingTopic.confidence = Math.min(existingTopic.confidence + 0.1, 1.0);
        } else {
          memory.topics.push({
            topic,
            confidence: 0.7,
            firstMentioned: now,
            lastMentioned: now
          });
        }
      }
    }

    // Limit topics to prevent memory bloat
    if (memory.topics.length > 10) {
      memory.topics = memory.topics
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);
    }
  }

  /**
   * Extract and update entities from message content (simplified)
   */
  private async extractAndUpdateEntities(memory: ConversationMemory, content: string): Promise<void> {
    // Simplified entity extraction - in production, this would use Comprehend
    const now = new Date().toISOString();
    
    // Simple pattern matching for common entities
    const patterns = [
      { pattern: /\b(metformin|insulin|glipizide|januvia)\b/gi, type: 'medication' as const },
      { pattern: /\b(diabetes|diabetic|hyperglycemia|hypoglycemia)\b/gi, type: 'condition' as const }
    ];

    for (const { pattern, type } of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const entity = match.toLowerCase();
          const existingEntity = memory.entities.find(e => e.entity === entity);
          if (!existingEntity) {
            memory.entities.push({
              entity,
              type,
              confidence: 0.8,
              firstMentioned: now
            });
          }
        }
      }
    }

    // Limit entities to prevent memory bloat
    if (memory.entities.length > 15) {
      memory.entities = memory.entities.slice(-15);
    }
  }
}