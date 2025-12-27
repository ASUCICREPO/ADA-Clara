import { DynamoDBService } from './dynamodb-service';
import { S3Service } from './s3-service';
import { 
  UserSession, 
  ChatMessage, 
  ProfessionalMember,
  UserPreferences,
  AnalyticsData,
  AuditLog,
  EscalationQueue,
  KnowledgeContent
} from '../types/index';

/**
 * Unified Data Service for ADA Clara Chatbot
 * Combines DynamoDB and S3 operations for complete data management
 */
export class DataService {
  private dynamoService: DynamoDBService;
  private s3Service: S3Service;

  constructor() {
    this.dynamoService = new DynamoDBService();
    this.s3Service = new S3Service();
  }

  // ===== CHAT SESSION MANAGEMENT =====

  /**
   * Create a new chat session with full context
   */
  async createChatSession(session: Omit<UserSession, 'ttl'>): Promise<UserSession> {
    // Store session in DynamoDB
    const createdSession = await this.dynamoService.createSession(session);
    
    // Log session creation for audit
    await this.logAuditEvent({
      eventId: `session-created-${session.sessionId}`,
      eventType: 'login',
      userId: session.userId,
      sessionId: session.sessionId,
      timestamp: new Date(),
      details: {
        action: 'session_created',
        language: session.language,
        userInfo: session.userInfo
      },
      severity: 'low'
    });

    return createdSession;
  }

  /**
   * Add message to session and update session metadata
   */
  async addChatMessage(message: Omit<ChatMessage, 'ttl'>): Promise<ChatMessage> {
    // Store message in DynamoDB
    const storedMessage = await this.dynamoService.addMessage(message);
    
    // Update session with new message count and last activity
    await this.dynamoService.updateSession(message.sessionId, {
      lastActivity: message.timestamp,
      messageCount: await this.getSessionMessageCount(message.sessionId)
    });

    return storedMessage;
  }

  /**
   * Get session with full message history
   */
  async getSessionWithMessages(sessionId: string): Promise<{
    session: UserSession | null;
    messages: ChatMessage[];
  }> {
    const [session, messages] = await Promise.all([
      this.dynamoService.getSession(sessionId),
      this.dynamoService.getSessionMessages(sessionId)
    ]);

    return { session, messages };
  }

  private async getSessionMessageCount(sessionId: string): Promise<number> {
    const messages = await this.dynamoService.getSessionMessages(sessionId);
    return messages.length;
  }

  // ===== CONTENT MANAGEMENT =====

  /**
   * Store scraped content with full metadata integration
   */
  async storeScrapedContent(
    url: string,
    rawContent: string,
    processedContent: string,
    metadata: {
      title: string;
      contentType: 'article' | 'faq' | 'resource' | 'event';
      language: 'en' | 'es';
      category: string;
      tags: string[];
    }
  ): Promise<KnowledgeContent> {
    const contentId = this.s3Service.generateContentId(url);
    const now = new Date();

    // Store raw content in S3
    await this.s3Service.storeRawContent(url, rawContent, {
      title: metadata.title,
      contentType: metadata.contentType,
      scrapedAt: now,
      language: metadata.language
    });

    // Create knowledge content record
    const knowledgeContent: KnowledgeContent = {
      contentId,
      url,
      title: metadata.title,
      content: processedContent,
      lastUpdated: now,
      contentType: metadata.contentType,
      language: metadata.language,
      metadata: {
        category: metadata.category,
        tags: metadata.tags,
        lastScraped: now,
        wordCount: processedContent.split(/\s+/).length,
        readingTime: Math.ceil(processedContent.split(/\s+/).length / 200)
      },
      createdAt: now
    };

    // Store metadata in both S3 and DynamoDB
    await Promise.all([
      this.s3Service.storeContentMetadata(knowledgeContent),
      this.dynamoService.storeKnowledgeContent(knowledgeContent)
    ]);

    // Log content ingestion
    await this.logAuditEvent({
      eventId: `content-ingested-${contentId}`,
      eventType: 'data_access',
      timestamp: now,
      details: {
        action: 'content_ingested',
        contentId,
        url,
        contentType: metadata.contentType,
        language: metadata.language,
        wordCount: knowledgeContent.metadata.wordCount
      },
      severity: 'low'
    });

    return knowledgeContent;
  }

  /**
   * Get content with full metadata
   */
  async getKnowledgeContent(contentId: string, contentType: string): Promise<{
    metadata: KnowledgeContent | null;
    rawContent: string | null;
  }> {
    // Get metadata from DynamoDB (faster) with S3 fallback
    let metadata = await this.dynamoService.getKnowledgeContentByType(contentType)
      .then(contents => contents.find(c => c.contentId === contentId) || null);
    
    if (!metadata) {
      metadata = await this.s3Service.getContentMetadata(contentId, contentType);
    }

    // Get raw content from S3 if metadata exists
    let rawContent: string | null = null;
    if (metadata) {
      // Try to find the raw content using the URL-based key pattern
      const urlBasedKey = this.s3Service.generateContentId(metadata.url);
      const possibleKeys = [
        `raw/${contentType}/${contentId}`,
        `raw/${contentType}/${urlBasedKey}`,
        `raw/${contentType}/${contentId}.html`,
        `raw/${contentType}/${urlBasedKey}.html`
      ];
      
      for (const key of possibleKeys) {
        const s3Content = await this.s3Service.getRawContent(key);
        if (s3Content?.content) {
          rawContent = s3Content.content;
          break;
        }
      }
    }

    return { metadata, rawContent };
  }

  // ===== PROFESSIONAL MEMBER MANAGEMENT =====

  /**
   * Create or update professional member with audit logging
   */
  async manageProfessionalMember(member: ProfessionalMember): Promise<void> {
    // Check if member exists
    const existingMember = await this.dynamoService.getMember(member.email);
    const isUpdate = !!existingMember;

    // Store/update member
    if (isUpdate) {
      await this.dynamoService.updateMember(member.email, {
        ...member,
        updatedAt: new Date()
      });
    } else {
      await this.dynamoService.createMember(member);
    }

    // Log member management action
    await this.logAuditEvent({
      eventId: `member-${isUpdate ? 'updated' : 'created'}-${member.memberId}`,
      eventType: 'admin_action',
      timestamp: new Date(),
      details: {
        action: isUpdate ? 'member_updated' : 'member_created',
        memberId: member.memberId,
        email: member.email,
        membershipType: member.membershipType,
        status: member.status
      },
      severity: 'medium'
    });
  }

  // ===== ESCALATION MANAGEMENT =====

  /**
   * Create escalation with full context and notifications
   */
  async createEscalation(
    sessionId: string,
    reason: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<EscalationQueue> {
    // Get session and messages for context
    const { session, messages } = await this.getSessionWithMessages(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const escalation: Omit<EscalationQueue, 'ttl'> = {
      escalationId: `esc-${sessionId}-${Date.now()}`,
      sessionId,
      userId: session.userId,
      status: 'pending',
      priority,
      reason,
      userInfo: session.userInfo || {},
      conversationHistory: messages,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store escalation
    await this.dynamoService.addToEscalationQueue(escalation);

    // Update session to mark as escalated
    await this.dynamoService.updateSession(sessionId, {
      escalated: true,
      escalationReason: reason,
      escalationTimestamp: new Date()
    });

    // Log escalation creation
    await this.logAuditEvent({
      eventId: `escalation-created-${escalation.escalationId}`,
      eventType: 'escalation',
      userId: session.userId,
      sessionId,
      timestamp: new Date(),
      details: {
        action: 'escalation_created',
        escalationId: escalation.escalationId,
        reason,
        priority,
        messageCount: messages.length
      },
      severity: priority === 'urgent' ? 'high' : 'medium'
    });

    return escalation as EscalationQueue;
  }

  // ===== ANALYTICS AND REPORTING =====

  /**
   * Record analytics with automatic aggregation
   */
  async recordAnalytics(
    type: 'chat' | 'escalation' | 'performance' | 'user',
    metric: string,
    value: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const now = new Date();
    const analytics: AnalyticsData = {
      date: now.toISOString().split('T')[0],
      hour: now.getHours(),
      type,
      metric,
      value,
      metadata,
      createdAt: now
    };

    await this.dynamoService.recordAnalytics(analytics);
  }

  /**
   * Get comprehensive analytics for a date range
   */
  async getAnalyticsSummary(
    startDate: string,
    endDate: string,
    type?: string
  ): Promise<{
    totalSessions: number;
    totalMessages: number;
    escalationRate: number;
    languageDistribution: Record<string, number>;
    averageResponseTime: number;
  }> {
    // This would aggregate data from multiple analytics records
    // For now, return a basic structure
    return {
      totalSessions: 0,
      totalMessages: 0,
      escalationRate: 0,
      languageDistribution: { en: 0, es: 0 },
      averageResponseTime: 0
    };
  }

  // ===== AUDIT AND COMPLIANCE =====

  /**
   * Log audit event with automatic compliance handling
   */
  async logAuditEvent(auditLog: Omit<AuditLog, 'ttl'>): Promise<void> {
    await this.dynamoService.logAuditEvent(auditLog);
  }

  /**
   * Get audit trail for compliance reporting
   */
  async getAuditTrail(
    startDate: Date,
    endDate: Date,
    eventType?: string,
    userId?: string
  ): Promise<AuditLog[]> {
    const logs: AuditLog[] = [];
    
    // Get logs for each day in the range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayLogs = await this.dynamoService.getAuditLogs(dateStr, eventType);
      
      // Filter by userId if specified
      if (userId) {
        logs.push(...dayLogs.filter(log => log.userId === userId));
      } else {
        logs.push(...dayLogs);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return logs.sort((a, b) => {
      const aTime = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp.getTime();
      const bTime = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp.getTime();
      return bTime - aTime;
    });
  }

  // ===== HEALTH AND MONITORING =====

  /**
   * Comprehensive health check for all services
   */
  async healthCheck(): Promise<{
    dynamodb: boolean;
    s3: { contentBucket: boolean; vectorsBucket: boolean };
    overall: boolean;
  }> {
    const [dynamoHealth, s3Health] = await Promise.all([
      this.dynamoService.healthCheck(),
      this.s3Service.healthCheck()
    ]);

    const overall = dynamoHealth && s3Health.contentBucket && s3Health.vectorsBucket;

    return {
      dynamodb: dynamoHealth,
      s3: s3Health,
      overall
    };
  }

  /**
   * Get service configuration and status
   */
  getServiceInfo(): {
    buckets: { contentBucket: string; vectorsBucket: string };
    tables: string[];
  } {
    return {
      buckets: this.s3Service.getBucketNames(),
      tables: [
        'ada-clara-chat-sessions',
        'ada-clara-professional-members',
        'ada-clara-analytics',
        'ada-clara-audit-logs',
        'ada-clara-user-preferences',
        'ada-clara-escalation-queue',
        'ada-clara-knowledge-content'
      ]
    };
  }
}