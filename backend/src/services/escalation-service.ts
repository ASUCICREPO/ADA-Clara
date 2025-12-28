import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DataService } from './data-service';
import { ChatMessage, EscalationQueue } from '../types/index';

/**
 * Escalation Service for ADA Clara Chatbot
 * Handles escalation triggers, queue management, and notifications
 */
export class EscalationService {
  private sqsClient: SQSClient;
  private snsClient: SNSClient;
  private dataService: DataService;
  private escalationQueueUrl: string;
  private escalationTopicArn: string;

  constructor() {
    this.sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dataService = new DataService();
    this.escalationQueueUrl = process.env.ESCALATION_QUEUE_URL || '';
    this.escalationTopicArn = process.env.ESCALATION_TOPIC_ARN || '';
  }

  /**
   * Evaluate if a chat interaction should trigger escalation
   */
  async evaluateEscalationTriggers(
    sessionId: string,
    message: ChatMessage,
    response: {
      content: string;
      confidence: number;
      sources?: Array<{ title: string; url: string }>;
    }
  ): Promise<{
    shouldEscalate: boolean;
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  }> {
    console.log(`🔍 Evaluating escalation triggers for session: ${sessionId}`);

    // Get session context
    const { session, messages } = await this.dataService.getSessionWithMessages(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Escalation trigger conditions
    const triggers = await this.checkEscalationTriggers(message, response, messages);
    
    // Determine priority based on triggers
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
    let shouldEscalate = false;
    let reason = '';

    // Priority 1: Explicit escalation request
    if (triggers.explicitRequest) {
      shouldEscalate = true;
      priority = 'high';
      reason = 'User explicitly requested human assistance';
    }
    // Priority 2: Emergency/urgent keywords
    else if (triggers.emergencyKeywords) {
      shouldEscalate = true;
      priority = 'urgent';
      reason = 'Emergency keywords detected in user message';
    }
    // Priority 3: Low confidence responses
    else if (triggers.lowConfidence) {
      shouldEscalate = true;
      priority = 'medium';
      reason = `Low confidence response (${(response.confidence * 100).toFixed(1)}%)`;
    }
    // Priority 4: Repeated similar questions
    else if (triggers.repeatedQuestions) {
      shouldEscalate = true;
      priority = 'medium';
      reason = 'User asking similar questions repeatedly';
    }
    // Priority 5: Long conversation without resolution
    else if (triggers.longConversation) {
      shouldEscalate = true;
      priority = 'low';
      reason = `Extended conversation (${messages.length} messages) without resolution`;
    }
    // Priority 6: No relevant sources found
    else if (triggers.noRelevantSources) {
      shouldEscalate = true;
      priority = 'low';
      reason = 'No relevant knowledge sources found for user query';
    }

    console.log(`📊 Escalation evaluation result: ${shouldEscalate ? 'ESCALATE' : 'CONTINUE'} (${reason})`);

    return { shouldEscalate, reason, priority };
  }

  /**
   * Check specific escalation trigger conditions
   */
  private async checkEscalationTriggers(
    message: ChatMessage,
    response: { content: string; confidence: number; sources?: Array<{ title: string; url: string }> },
    conversationHistory: ChatMessage[]
  ): Promise<{
    explicitRequest: boolean;
    emergencyKeywords: boolean;
    lowConfidence: boolean;
    repeatedQuestions: boolean;
    longConversation: boolean;
    noRelevantSources: boolean;
  }> {
    const userMessage = message.content.toLowerCase();

    // 1. Explicit escalation request
    const escalationPhrases = [
      'speak to human', 'talk to person', 'human help', 'real person',
      'customer service', 'support agent', 'live chat', 'representative',
      'hablar con persona', 'ayuda humana', 'servicio al cliente',
      'not helpful', 'doesn\'t help', 'wrong answer', 'incorrect',
      'frustrated', 'angry', 'upset'
    ];
    const explicitRequest = escalationPhrases.some(phrase => userMessage.includes(phrase));

    // 2. Emergency/urgent keywords
    const emergencyKeywords = [
      'emergency', 'urgent', 'crisis', 'help me', 'dying', 'suicide',
      'overdose', 'poison', 'allergic reaction', 'chest pain',
      'can\'t breathe', 'unconscious', 'bleeding', 'severe pain',
      'emergencia', 'urgente', 'crisis', 'ayuda', 'dolor severo'
    ];
    const hasEmergencyKeywords = emergencyKeywords.some(keyword => userMessage.includes(keyword));

    // 3. Low confidence response (below 70%)
    const lowConfidence = response.confidence < 0.7;

    // 4. Repeated similar questions (check last 5 messages)
    const recentUserMessages = conversationHistory
      .filter(msg => msg.sender === 'user')
      .slice(-5)
      .map(msg => msg.content.toLowerCase());
    
    const repeatedQuestions = this.detectRepeatedQuestions(recentUserMessages);

    // 5. Long conversation (more than 15 messages)
    const longConversation = conversationHistory.length > 15;

    // 6. No relevant sources found
    const noRelevantSources = !response.sources || response.sources.length === 0;

    return {
      explicitRequest,
      emergencyKeywords: hasEmergencyKeywords,
      lowConfidence,
      repeatedQuestions,
      longConversation,
      noRelevantSources
    };
  }

  /**
   * Detect if user is asking similar questions repeatedly
   */
  private detectRepeatedQuestions(recentMessages: string[]): boolean {
    if (recentMessages.length < 3) return false;

    // Simple similarity check - look for common keywords
    const keywordSets = recentMessages.map(msg => 
      new Set(msg.split(' ').filter(word => word.length > 3))
    );

    // Check if recent messages have significant keyword overlap
    for (let i = 0; i < keywordSets.length - 1; i++) {
      for (let j = i + 1; j < keywordSets.length; j++) {
        const intersection = new Set(Array.from(keywordSets[i]).filter(x => keywordSets[j].has(x)));
        const union = new Set([...Array.from(keywordSets[i]), ...Array.from(keywordSets[j])]);
        const similarity = intersection.size / union.size;
        
        if (similarity > 0.6) { // 60% similarity threshold
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Create and queue escalation
   */
  async createEscalation(
    sessionId: string,
    reason: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<EscalationQueue> {
    console.log(`🚨 Creating escalation for session ${sessionId}: ${reason} (${priority})`);

    // Create escalation record in database
    const escalation = await this.dataService.createEscalation(sessionId, reason, priority);

    // Send to SQS queue for email processing
    await this.queueEscalationEmail(escalation);

    // Send immediate notification for urgent escalations
    if (priority === 'urgent') {
      await this.sendUrgentNotification(escalation);
    }

    // Record analytics
    await this.dataService.recordAnalytics('escalation', 'created', 1, {
      priority,
      reason,
      sessionId
    });

    console.log(`✅ Escalation created and queued: ${escalation.escalationId}`);

    return escalation;
  }

  /**
   * Queue escalation email via SQS
   */
  private async queueEscalationEmail(escalation: EscalationQueue): Promise<void> {
    if (!this.escalationQueueUrl) {
      console.warn('⚠️ Escalation queue URL not configured, skipping email queue');
      return;
    }

    const emailData = {
      escalationId: escalation.escalationId,
      sessionId: escalation.sessionId,
      userInfo: escalation.userInfo,
      reason: escalation.reason,
      priority: escalation.priority,
      conversationHistory: escalation.conversationHistory,
      timestamp: escalation.createdAt.toISOString()
    };

    const command = new SendMessageCommand({
      QueueUrl: this.escalationQueueUrl,
      MessageBody: JSON.stringify(emailData),
      MessageAttributes: {
        priority: {
          DataType: 'String',
          StringValue: escalation.priority
        },
        escalationId: {
          DataType: 'String',
          StringValue: escalation.escalationId
        }
      },
      // Use priority for message deduplication
      MessageGroupId: escalation.priority,
      MessageDeduplicationId: escalation.escalationId
    });

    await this.sqsClient.send(command);
    console.log(`📬 Escalation queued for email processing: ${escalation.escalationId}`);
  }

  /**
   * Send immediate urgent notification via SNS
   */
  private async sendUrgentNotification(escalation: EscalationQueue): Promise<void> {
    if (!this.escalationTopicArn) {
      console.warn('⚠️ Escalation topic ARN not configured, skipping urgent notification');
      return;
    }

    const message = `
🚨 URGENT ESCALATION ALERT

Escalation ID: ${escalation.escalationId}
Session ID: ${escalation.sessionId}
User: ${escalation.userInfo.name || 'Unknown'}
Contact: ${escalation.userInfo.email || escalation.userInfo.phone || 'No contact info'}
Reason: ${escalation.reason}

This escalation requires immediate attention. Please check your email for full details.

Time: ${escalation.createdAt.toLocaleString()}
    `;

    const command = new PublishCommand({
      TopicArn: this.escalationTopicArn,
      Message: message,
      Subject: '🚨 ADA Clara - URGENT Escalation Alert',
      MessageAttributes: {
        priority: {
          DataType: 'String',
          StringValue: 'urgent'
        },
        escalationId: {
          DataType: 'String',
          StringValue: escalation.escalationId
        }
      }
    });

    await this.snsClient.send(command);
    console.log(`🚨 Urgent notification sent via SNS: ${escalation.escalationId}`);
  }

  /**
   * Update escalation status
   */
  async updateEscalationStatus(
    escalationId: string,
    status: 'pending' | 'notified' | 'in_progress' | 'resolved' | 'failed',
    notes?: string
  ): Promise<void> {
    // Log status update
    await this.dataService.logAuditEvent({
      eventId: `escalation-status-${escalationId}-${status}`,
      eventType: 'escalation',
      timestamp: new Date(),
      details: {
        action: 'escalation_status_updated',
        escalationId,
        newStatus: status,
        notes,
        updatedBy: 'escalation-service'
      },
      severity: status === 'failed' ? 'high' : 'low'
    });

    console.log(`📝 Escalation status updated: ${escalationId} -> ${status}`);
  }

  /**
   * Get escalation statistics for monitoring
   */
  async getEscalationStats(days: number = 7): Promise<{
    totalEscalations: number;
    byPriority: Record<string, number>;
    byReason: Record<string, number>;
    averageResponseTime: number;
    escalationRate: number;
  }> {
    // This would query analytics data
    // For now, return placeholder data
    return {
      totalEscalations: 0,
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
      byReason: {},
      averageResponseTime: 0,
      escalationRate: 0
    };
  }

  /**
   * Health check for escalation service
   */
  async healthCheck(): Promise<{
    sqsConnected: boolean;
    snsConnected: boolean;
    queueConfigured: boolean;
    topicConfigured: boolean;
    overall: boolean;
  }> {
    const queueConfigured = !!this.escalationQueueUrl;
    const topicConfigured = !!this.escalationTopicArn;
    
    // Basic connectivity check would go here
    const sqsConnected = true; // Placeholder
    const snsConnected = true; // Placeholder
    
    const overall = sqsConnected && snsConnected && queueConfigured && topicConfigured;

    return {
      sqsConnected,
      snsConnected,
      queueConfigured,
      topicConfigured,
      overall
    };
  }
}