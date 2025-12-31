import { DataService } from './data-service';
import { 
  ChatMessage, 
  EscalationQueue, 
  EscalationRequest, 
  EscalationResponse, 
  EscalationStatus
} from '../types/index';

/**
 * Escalation Service for ADA Clara Chatbot
 * Handles escalation triggers and DynamoDB storage (NO EMAIL)
 * Aligned with architecture: Flagged chats → DynamoDB → Admin Dashboard
 */
export class EscalationService {
  private dataService: DataService;

  constructor() {
    this.dataService = new DataService();
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

    const triggers = await this.checkEscalationTriggers(sessionId, message, response, messages);
    
    let shouldEscalate = false;
    let reason = '';
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';

    // Priority 1: Emergency keywords (highest priority)
    if (triggers.emergencyKeywords) {
      shouldEscalate = true;
      priority = 'urgent';
      reason = 'Emergency keywords detected in user message';
    }
    // Priority 2: Explicit escalation request
    else if (triggers.explicitRequest) {
      shouldEscalate = true;
      priority = 'high';
      reason = 'User explicitly requested to speak with a person';
    }
    // Priority 3: Low confidence responses
    else if (triggers.lowConfidence) {
      shouldEscalate = true;
      priority = 'medium';
      reason = `Low confidence response (${Math.round(response.confidence * 100)}%)`;
    }
    // Priority 4: Repeated questions
    else if (triggers.repeatedQuestions) {
      shouldEscalate = true;
      priority = 'medium';
      reason = 'User asking similar questions repeatedly';
    }
    // Priority 5: Out of scope
    else if (triggers.outOfScope) {
      shouldEscalate = true;
      priority = 'low';
      reason = 'Question appears to be outside diabetes-related scope';
    }

    console.log(`🎯 Escalation evaluation result: ${shouldEscalate ? 'ESCALATE' : 'NO ESCALATION'} (${reason})`);

    return { shouldEscalate, reason, priority };
  }

  /**
   * Check various escalation trigger conditions
   */
  private async checkEscalationTriggers(
    sessionId: string,
    message: ChatMessage,
    response: { content: string; confidence: number },
    conversationHistory: ChatMessage[]
  ): Promise<{
    explicitRequest: boolean;
    emergencyKeywords: boolean;
    lowConfidence: boolean;
    repeatedQuestions: boolean;
    outOfScope: boolean;
  }> {
    const userMessage = message.content.toLowerCase();

    // 1. Explicit escalation request
    const escalationPhrases = [
      'speak to human', 'talk to person', 'human help', 'real person',
      'customer service', 'support agent', 'live chat', 'representative',
      'not helpful', 'doesn\'t understand', 'need help',
      'frustrated', 'angry', 'upset'
    ];
    const explicitRequest = escalationPhrases.some(phrase => userMessage.includes(phrase));

    // 2. Emergency/urgent keywords
    const emergencyKeywords = [
      'emergency', 'urgent', 'crisis', 'help me', 'dying',
      'severe pain', 'can\'t breathe', 'chest pain', 'stroke',
      'heart attack', 'unconscious', 'bleeding', 'overdose',
      'suicide', 'self harm', 'danger'
    ];
    const hasEmergencyKeywords = emergencyKeywords.some(keyword => userMessage.includes(keyword));

    // 3. Low confidence threshold
    const lowConfidence = response.confidence < 0.7;

    // 4. Repeated similar questions (check last 5 messages)
    const recentUserMessages = conversationHistory
      .filter(msg => msg.sender === 'user')
      .slice(-5)
      .map(msg => msg.content.toLowerCase());
    
    const repeatedQuestions = this.detectRepeatedQuestions(recentUserMessages, userMessage);

    // 5. Out of scope detection
    const diabetesKeywords = [
      'diabetes', 'blood sugar', 'glucose', 'insulin', 'carb', 'carbohydrate',
      'a1c', 'hemoglobin', 'type 1', 'type 2', 'gestational', 'prediabetes',
      'diabetic', 'hyperglycemia', 'hypoglycemia', 'ketones', 'dka'
    ];
    const hasDiabetesKeywords = diabetesKeywords.some(keyword => userMessage.includes(keyword));
    const outOfScope = !hasDiabetesKeywords && userMessage.length > 20; // Only flag longer messages

    return {
      explicitRequest,
      emergencyKeywords: hasEmergencyKeywords,
      lowConfidence,
      repeatedQuestions,
      outOfScope
    };
  }

  /**
   * Detect if user is asking similar questions repeatedly
   */
  private detectRepeatedQuestions(recentMessages: string[], currentMessage: string): boolean {
    if (recentMessages.length < 2) return false;

    // Simple similarity check - count common words
    const currentWords = currentMessage.split(' ').filter(word => word.length > 3);
    
    for (const prevMessage of recentMessages) {
      const prevWords = prevMessage.split(' ').filter(word => word.length > 3);
      const commonWords = currentWords.filter(word => prevWords.includes(word));
      
      // If more than 50% of words are common, consider it repeated
      if (commonWords.length > currentWords.length * 0.5 && commonWords.length > 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create escalation record in DynamoDB (NO EMAIL)
   * Flagged chats are stored for admin dashboard display
   */
  async createEscalation(
    sessionId: string,
    reason: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<EscalationQueue> {
    console.log(`🚨 Creating escalation for session ${sessionId}: ${reason} (${priority})`);

    // Create escalation record in DynamoDB for admin dashboard
    const escalation = await this.dataService.createEscalation(sessionId, reason, priority);

    // Record analytics
    await this.dataService.recordAnalytics('escalation', 'created', 1, {
      priority,
      reason,
      sessionId
    });

    console.log(`✅ Escalation stored in DynamoDB: ${escalation.escalationId}`);
    
    return escalation;
  }

  /**
   * Get escalation status from DynamoDB
   */
  async getEscalationStatus(escalationId: string): Promise<EscalationStatus | null> {
    try {
      return await this.dataService.getEscalationStatus(escalationId);
    } catch (error) {
      console.error(`❌ Failed to get escalation status for ${escalationId}:`, error);
      return null;
    }
  }

  /**
   * Update escalation status in DynamoDB
   */
  async updateEscalationStatus(
    escalationId: string, 
    status: EscalationStatus['status'],
    notes?: string
  ): Promise<void> {
    try {
      await this.dataService.updateEscalationStatus(escalationId, status, notes);
      console.log(`✅ Updated escalation ${escalationId} status to: ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update escalation status:`, error);
      throw error;
    }
  }

  /**
   * Get all escalations for admin dashboard
   */
  async getAllEscalations(
    status?: EscalationStatus['status'],
    limit: number = 50
  ): Promise<EscalationQueue[]> {
    try {
      return await this.dataService.getEscalations(status, limit);
    } catch (error) {
      console.error(`❌ Failed to get escalations:`, error);
      return [];
    }
  }

  /**
   * Track escalation status changes for analytics
   */
  private async trackEscalationStatus(escalationId: string, status: string): Promise<void> {
    await this.dataService.recordAnalytics('escalation', 'status_change', 1, {
      escalationId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}