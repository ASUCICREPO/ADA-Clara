// ADA Clara Chatbot - Core Data Models
// TypeScript interfaces for DynamoDB-based data storage
// Task 2.1: Complete TypeScript interfaces for all data models
// Requirements: 2.2, 3.4, 7.3

/**
 * Chat Request Interface - For incoming chat messages
 * Used by Lambda handler to process user messages
 */
export interface ChatRequest {
  sessionId: string;
  message: string;
  language?: 'en' | 'es';
  userId?: string;
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
}

/**
 * Chat Response Interface - For outgoing chat responses
 * Returned by Lambda handler after processing
 */
export interface ChatResponse {
  sessionId: string;
  response: string;
  confidence: number;
  language: 'en' | 'es';
  sources?: Array<{
    title: string;
    url: string;
    excerpt: string;
  }>;
  escalationSuggested: boolean;
  escalationReason?: string;
  timestamp: string;
  // TASK 11: Enhanced response metadata
  conversationMetadata?: {
    messageCount: number;
    averageConfidence: number;
    questionDetected: boolean;
    questionCategory?: string;
    escalationTriggers: string[];
  };
}

/**
 * Conversation Context Interface - For maintaining conversation state
 * Used to track conversation flow and context across messages
 */
export interface ConversationContext {
  conversationId: string;
  sessionId: string;
  userId?: string;
  startTime: string;
  lastActivity: string;
  messageCount: number;
  currentTopic?: string;
  language: 'en' | 'es';
  conversationMemory: ConversationMemory;
  sessionState: SessionState;
}

/**
 * Session State Interface - For tracking session-level information
 * Maintains state that persists across the entire session
 */
export interface SessionState {
  sessionId: string;
  isActive: boolean;
  startTime: string;
  lastActivity: string;
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
  preferences: UserPreferences;
  escalationStatus: 'none' | 'suggested' | 'initiated' | 'completed';
  escalationReason?: string;
}

/**
 * Conversation Memory Interface - For storing conversation history and context
 * Enables context-aware responses and follow-up question handling
 */
export interface ConversationMemory {
  recentMessages: Array<{
    messageId: string;
    content: string;
    sender: 'user' | 'bot';
    timestamp: string;
    confidence?: number;
  }>;
  topics: Array<{
    topic: string;
    confidence: number;
    firstMentioned: string;
    lastMentioned: string;
  }>;
  entities: Array<{
    entity: string;
    type: 'person' | 'condition' | 'medication' | 'location' | 'other';
    confidence: number;
    firstMentioned: string;
  }>;
  questions: Array<{
    question: string;
    category: string;
    answered: boolean;
    timestamp: string;
  }>;
  maxMessages: number; // Limit for memory size
}

/**
 * User Preferences Interface - For storing user-specific preferences
 * Persists across sessions for personalized experience
 */
export interface UserPreferences {
  userId?: string;
  sessionId: string;
  language: 'en' | 'es';
  communicationStyle: 'formal' | 'casual' | 'medical';
  topicInterests: string[];
  escalationPreference: 'immediate' | 'after_attempts' | 'never';
  dataRetention: 'session_only' | 'short_term' | 'long_term';
  notifications?: boolean;
  timezone?: string;
  accessibilitySettings?: {
    fontSize: 'small' | 'medium' | 'large';
    highContrast: boolean;
    screenReader: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Escalation Request Interface - For initiating escalations
 * Used when transferring conversations to human agents
 */
export interface EscalationRequest {
  sessionId: string;
  conversationId: string;
  userId?: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
  conversationHistory: Array<{
    content: string;
    sender: 'user' | 'bot';
    timestamp: string;
    confidence?: number;
  }>;
  escalationTriggers: string[];
  language: 'en' | 'es';
  timestamp: string;
}

/**
 * Escalation Response Interface - For escalation processing results
 * Returned after escalation is processed and email is sent
 */
export interface EscalationResponse {
  escalationId: string;
  status: 'success' | 'failed' | 'pending';
  emailSent: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
  supportTicketId?: string;
}

/**
 * Escalation Status Interface - For tracking escalation progress
 * Used to monitor escalation lifecycle and follow-up
 */
export interface EscalationStatus {
  escalationId: string;
  sessionId: string;
  status: 'initiated' | 'email_sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  assignedAgent?: string;
  supportTicketId?: string;
  resolutionNotes?: string;
  followUpRequired: boolean;
}

/**
 * Email Template Interface - For escalation email templates
 * Defines structure for HTML and text email templates
 */
export interface EmailTemplate {
  templateId: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  language: 'en' | 'es';
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Enhanced Conversation Record - For admin dashboard analytics
 * DynamoDB Table: Conversations
 * PK: conversationId
 * SK: timestamp
 */
export interface ConversationRecord {
  conversationId: string;
  userId: string;
  sessionId: string;
  startTime: string; // ISO 8601
  endTime?: string; // ISO 8601
  timestamp: string; // ISO 8601 for sort key
  date: string; // YYYY-MM-DD for GSI
  language: 'en' | 'es';
  messageCount: number;
  totalConfidenceScore: number;
  averageConfidenceScore: number;
  outcome: 'resolved' | 'escalated' | 'abandoned';
  escalationReason?: string;
  escalationTimestamp?: string; // ISO 8601
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
}

/**
 * Enhanced Message Record - Individual messages with analytics data
 * DynamoDB Table: Messages
 * PK: conversationId
 * SK: messageIndex
 */
export interface MessageRecord {
  conversationId: string;
  messageIndex: number;
  timestamp: string; // ISO 8601
  type: 'user' | 'bot';
  content: string;
  confidenceScore?: number; // For bot messages (0-1)
  escalationTrigger: boolean; // Will be stored as string in DynamoDB for GSI
  questionCategory?: string;
  isAnswered: boolean;
  language: 'en' | 'es';
  processingTime?: number; // Response time in ms
  sources?: Source[];
}

/**
 * Question Analysis Record - FAQ and unanswered question tracking
 * DynamoDB Table: Questions
 * PK: questionHash
 * SK: date (YYYY-MM-DD)
 */
export interface QuestionRecord {
  questionHash: string; // Hash of normalized question
  originalQuestion: string;
  normalizedQuestion: string;
  category: string;
  date: string; // YYYY-MM-DD
  count: number;
  totalConfidenceScore: number;
  averageConfidenceScore: number;
  answeredCount: number;
  unansweredCount: number;
  escalationCount: number;
  language: 'en' | 'es';
  lastAsked: string; // ISO 8601
}

/**
 * Enhanced Analytics Data - Extended metrics for dashboard
 */
export interface EnhancedAnalyticsData extends AnalyticsData {
  metricType: 'conversation' | 'question' | 'escalation' | 'performance';
  aggregationLevel: 'hourly' | 'daily' | 'weekly' | 'monthly';
  filters?: {
    language?: 'en' | 'es';
    category?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

/**
 * User Session - Real-time chat session management
 * DynamoDB Table: ChatSessions
 * PK: SESSION#{sessionId}
 * SK: METADATA
 */
export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  language: 'en' | 'es';
  userInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
  escalated: boolean;
  escalationReason?: string;
  escalationTimestamp?: Date;
  satisfaction?: number; // 1-5 rating
  messageCount: number;
  lastActivity: Date;
  // DynamoDB TTL field (expires after 30 days)
  ttl: number;
}

/**
 * Chat Message - Individual messages within sessions
 * DynamoDB Table: ChatSessions
 * PK: SESSION#{sessionId}
 * SK: MESSAGE#{timestamp}#{messageId}
 */
export interface ChatMessage {
  messageId: string;
  sessionId: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  language: 'en' | 'es';
  confidence?: number; // Bot response confidence (0-1)
  sources?: Source[];
  processingTime?: number; // Response generation time in ms
  // DynamoDB TTL field (expires after 90 days)
  ttl: number;
}

/**
 * Source Citation - References for bot responses
 */
export interface Source {
  url: string;
  title: string;
  excerpt: string;
  relevanceScore: number;
  contentType: 'article' | 'faq' | 'resource' | 'event';
}

/**
 * Professional Member - ADA professional membership data
 * DynamoDB Table: ProfessionalMembers
 * PK: MEMBER#{email}
 * SK: PROFILE
 */
export interface ProfessionalMember {
  memberId: string;
  email: string;
  name: string;
  membershipType: string;
  status: 'active' | 'expired' | 'suspended';
  expirationDate: Date;
  benefits: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User Preferences - Language and interaction preferences (REMOVED DUPLICATE)
 * This interface was merged with the earlier UserPreferences definition
 */

/**
 * Analytics Data - System metrics and performance data
 * DynamoDB Table: Analytics
 * PK: ANALYTICS#{date}#{type}
 * SK: {hour}#{metric}
 */
export interface AnalyticsData {
  date: string; // YYYY-MM-DD format
  hour: number; // 0-23
  type: 'chat' | 'escalation' | 'performance' | 'user';
  metric: string;
  value: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Aggregated Analytics - Daily/weekly/monthly summaries
 * DynamoDB Table: Analytics
 * PK: SUMMARY#{period}#{date}
 * SK: METRICS
 */
export interface AggregatedAnalytics {
  period: 'daily' | 'weekly' | 'monthly';
  date: string;
  totalSessions: number;
  averageAccuracy: number;
  escalationRate: number;
  languageDistribution: Record<string, number>;
  topQuestions: QuestionFrequency[];
  averageResponseTime: number;
  userSatisfactionAverage: number;
  createdAt: Date;
}

/**
 * Question Frequency - Most common user questions
 */
export interface QuestionFrequency {
  question: string;
  count: number;
  category: string;
  averageConfidence: number;
}

/**
 * Audit Log - Security and compliance tracking
 * DynamoDB Table: AuditLogs
 * PK: AUDIT#{date}
 * SK: {timestamp}#{eventType}#{userId}
 */
export interface AuditLog {
  eventId: string;
  eventType: 'login' | 'logout' | 'data_access' | 'escalation' | 'admin_action' | 'error';
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  // Audit logs kept for 7 years for compliance
  ttl: number;
}

/**
 * Escalation Queue - Pending escalations to human agents
 * DynamoDB Table: EscalationQueue
 * PK: ESCALATION#{status}
 * SK: {timestamp}#{sessionId}
 */
export interface EscalationQueue {
  escalationId: string;
  sessionId: string;
  userId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reason: string;
  userInfo: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
  conversationHistory: ChatMessage[];
  assignedAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  // TTL after 30 days
  ttl: number;
}

/**
 * Knowledge Content - Scraped and processed content from diabetes.org
 * DynamoDB Table: KnowledgeContent
 * PK: CONTENT#{contentType}
 * SK: {url}#{lastUpdated}
 */
export interface KnowledgeContent {
  contentId: string;
  url: string;
  title: string;
  content: string;
  lastUpdated: Date;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  language: 'en' | 'es';
  metadata: {
    category: string;
    tags: string[];
    lastScraped: Date;
    wordCount: number;
    readingTime: number; // estimated minutes
  };
  // Vector embedding stored separately in S3 Vectors
  vectorId?: string;
  createdAt: Date;
}

// Validation functions for data integrity
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Data validation utilities
 */
export class DataValidator {
  static validateUserSession(session: Partial<UserSession>): ValidationResult {
    const errors: string[] = [];
    
    if (!session.sessionId) errors.push('sessionId is required');
    if (!session.language || !['en', 'es'].includes(session.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (!session.startTime) errors.push('startTime is required');
    if (session.satisfaction && (session.satisfaction < 1 || session.satisfaction > 5)) {
      errors.push('satisfaction must be between 1 and 5');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateChatMessage(message: Partial<ChatMessage>): ValidationResult {
    const errors: string[] = [];
    
    if (!message.messageId) errors.push('messageId is required');
    if (!message.sessionId) errors.push('sessionId is required');
    if (!message.content || message.content.trim().length === 0) {
      errors.push('content is required and cannot be empty');
    }
    if (!message.sender || !['user', 'bot'].includes(message.sender)) {
      errors.push('sender must be "user" or "bot"');
    }
    if (!message.timestamp) errors.push('timestamp is required');
    if (message.confidence && (message.confidence < 0 || message.confidence > 1)) {
      errors.push('confidence must be between 0 and 1');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateProfessionalMember(member: Partial<ProfessionalMember>): ValidationResult {
    const errors: string[] = [];
    
    if (!member.memberId) errors.push('memberId is required');
    if (!member.email || !this.isValidEmail(member.email)) {
      errors.push('valid email is required');
    }
    if (!member.name || member.name.trim().length === 0) {
      errors.push('name is required');
    }
    if (!member.status || !['active', 'expired', 'suspended'].includes(member.status)) {
      errors.push('status must be "active", "expired", or "suspended"');
    }
    if (!member.expirationDate) errors.push('expirationDate is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateConversationRecord(conversation: Partial<ConversationRecord>): ValidationResult {
    const errors: string[] = [];
    
    if (!conversation.conversationId) errors.push('conversationId is required');
    if (!conversation.userId) errors.push('userId is required');
    if (!conversation.sessionId) errors.push('sessionId is required');
    if (!conversation.startTime) errors.push('startTime is required');
    if (!conversation.language || !['en', 'es'].includes(conversation.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (!conversation.outcome || !['resolved', 'escalated', 'abandoned'].includes(conversation.outcome)) {
      errors.push('outcome must be "resolved", "escalated", or "abandoned"');
    }
    if (conversation.averageConfidenceScore && (conversation.averageConfidenceScore < 0 || conversation.averageConfidenceScore > 1)) {
      errors.push('averageConfidenceScore must be between 0 and 1');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateMessageRecord(message: Partial<MessageRecord>): ValidationResult {
    const errors: string[] = [];
    
    if (!message.conversationId) errors.push('conversationId is required');
    if (message.messageIndex === undefined || message.messageIndex < 0) {
      errors.push('messageIndex is required and must be >= 0');
    }
    if (!message.timestamp) errors.push('timestamp is required');
    if (!message.type || !['user', 'bot'].includes(message.type)) {
      errors.push('type must be "user" or "bot"');
    }
    if (!message.content || message.content.trim().length === 0) {
      errors.push('content is required and cannot be empty');
    }
    if (!message.language || !['en', 'es'].includes(message.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (message.confidenceScore && (message.confidenceScore < 0 || message.confidenceScore > 1)) {
      errors.push('confidenceScore must be between 0 and 1');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateQuestionRecord(question: Partial<QuestionRecord>): ValidationResult {
    const errors: string[] = [];
    
    if (!question.questionHash) errors.push('questionHash is required');
    if (!question.originalQuestion || question.originalQuestion.trim().length === 0) {
      errors.push('originalQuestion is required and cannot be empty');
    }
    if (!question.normalizedQuestion || question.normalizedQuestion.trim().length === 0) {
      errors.push('normalizedQuestion is required and cannot be empty');
    }
    if (!question.category) errors.push('category is required');
    if (!question.date) errors.push('date is required');
    if (!question.language || !['en', 'es'].includes(question.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (question.count !== undefined && question.count < 0) {
      errors.push('count must be >= 0');
    }
    if (question.averageConfidenceScore && (question.averageConfidenceScore < 0 || question.averageConfidenceScore > 1)) {
      errors.push('averageConfidenceScore must be between 0 and 1');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// DynamoDB key generation utilities
export class DynamoDBKeyGenerator {
  static sessionPK(sessionId: string): string {
    return `SESSION#${sessionId}`;
  }

  static sessionMetadataSK(): string {
    return 'METADATA';
  }

  static messageSK(timestamp: Date, messageId: string): string {
    return `MESSAGE#${timestamp.toISOString()}#${messageId}`;
  }

  static memberPK(email: string): string {
    return `MEMBER#${email}`;
  }

  static memberSK(): string {
    return 'PROFILE';
  }

  static userPreferencesPK(userId: string): string {
    return `USER#${userId}`;
  }

  static userPreferencesSK(): string {
    return 'PREFERENCES';
  }

  static analyticsPK(date: string, type: string): string {
    return `ANALYTICS#${date}#${type}`;
  }

  static analyticsSK(hour: number, metric: string): string {
    return `${hour.toString().padStart(2, '0')}#${metric}`;
  }

  static auditPK(date: string): string {
    return `AUDIT#${date}`;
  }

  static auditSK(timestamp: Date, eventType: string, userId?: string): string {
    const userPart = userId ? `#${userId}` : '';
    return `${timestamp.toISOString()}#${eventType}${userPart}`;
  }

  static escalationPK(status: string): string {
    return `ESCALATION#${status}`;
  }

  static escalationSK(timestamp: Date, sessionId: string): string {
    return `${timestamp.toISOString()}#${sessionId}`;
  }

  static contentPK(contentType: string): string {
    return `CONTENT#${contentType}`;
  }

  static contentSK(url: string, lastUpdated: Date): string {
    return `${url}#${lastUpdated.toISOString()}`;
  }

  // New key generators for enhanced analytics tables

  static conversationPK(conversationId: string): string {
    return conversationId;
  }

  static conversationSK(timestamp: string): string {
    return timestamp;
  }

  static messagePK(conversationId: string): string {
    return conversationId;
  }

  static messageSKFromIndex(messageIndex: number): number {
    return messageIndex;
  }

  static questionPK(questionHash: string): string {
    return questionHash;
  }

  static questionSK(date: string): string {
    return date; // YYYY-MM-DD format
  }

  // Utility functions for date formatting
  static formatDate(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  static formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  // Hash generation for questions
  static generateQuestionHash(normalizedQuestion: string): string {
    // Simple hash function for question deduplication
    let hash = 0;
    for (let i = 0; i < normalizedQuestion.length; i++) {
      const char = normalizedQuestion.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Question normalization for consistent hashing
  static normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

// TTL calculation utilities (DynamoDB TTL uses Unix timestamp)
export class TTLCalculator {
  static sessionTTL(): number {
    // 30 days from now
    return Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  }

  static messageTTL(): number {
    // 90 days from now
    return Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
  }

  static auditTTL(): number {
    // 7 years from now (compliance requirement)
    return Math.floor(Date.now() / 1000) + (7 * 365 * 24 * 60 * 60);
  }

  static escalationTTL(): number {
    // 30 days from now
    return Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  }
}

// ===== ENHANCED ANALYTICS INTERFACES =====

/**
 * Conversation Analytics - Dashboard metrics for conversations
 */
export interface ConversationAnalytics {
  totalConversations: number;
  conversationsByDate: Array<{
    date: string;
    count: number;
    languages: { en: number; es: number };
  }>;
  languageDistribution: { en: number; es: number };
  unansweredPercentage: number;
  averageConfidenceScore: number;
}

/**
 * Conversation Details - Complete conversation information
 */
export interface ConversationDetails {
  conversationId: string;
  userId: string;
  startTime: string;
  endTime: string;
  language: 'en' | 'es';
  messageCount: number;
  messages: Array<{
    timestamp: string;
    type: 'user' | 'bot';
    content: string;
    confidenceScore?: number;
    escalationTrigger?: boolean;
  }>;
  outcome: 'resolved' | 'escalated' | 'abandoned';
  escalationReason?: string;
}

/**
 * FAQ Analysis - Frequently asked questions metrics
 */
export interface FAQAnalysis {
  topQuestions: Array<{
    question: string;
    count: number;
    category: string;
    averageConfidence: number;
  }>;
  questionsByCategory: Record<string, number>;
  totalQuestionsAnalyzed: number;
}

/**
 * Unanswered Analysis - Knowledge gap identification
 */
export interface UnansweredAnalysis {
  topUnansweredQuestions: Array<{
    question: string;
    count: number;
    category: string;
    averageConfidence: number;
    escalationRate: number;
    trend?: 'increasing' | 'decreasing' | 'stable';
    firstSeen?: string;
    lastSeen?: string;
  }>;
  knowledgeGaps: Array<{
    category: string;
    unansweredCount: number;
    totalCount: number;
    gapPercentage: number;
    trend?: 'improving' | 'worsening' | 'stable';
    weeklyChange?: number;
  }>;
  improvementOpportunities: Array<{
    topic: string;
    priority: 'high' | 'medium' | 'low';
    impact: number;
    urgency: number;
    effort: 'low' | 'medium' | 'high';
    roi: number; // Return on investment score
  }>;
  trendAnalysis: {
    totalUnansweredTrend: 'improving' | 'worsening' | 'stable';
    weeklyChangePercentage: number;
    problematicCategories: Array<{
      category: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      weeklyIncrease: number;
    }>;
  };
}

/**
 * Enhanced Unanswered Question Tracking Types (Requirements 5.1, 5.2, 5.4, 5.5)
 */

// Enhanced unanswered question record (Requirement 5.1)
export interface UnansweredQuestion {
  id: string;
  question: string;
  normalizedQuestion: string;
  category: string;
  timestamp: number;
  conversationId: string;
  userId: string;
  confidence: number;
  responseContent: string | null;
  language: string;
}

// Knowledge gap analysis (Requirement 5.2)
export interface KnowledgeGap {
  category: string;
  frequency: number;
  avgConfidence: number;
  sampleQuestions: string[];
  subcategories: Array<{
    subcategory: string;
    count: number;
  }>;
  trends: Array<{
    date: string;
    count: number;
  }>;
  severity: number; // 0-1 scale
  recommendedActions: string[];
}

export interface KnowledgeGapAnalysis {
  analysisDate: Date;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  totalUnansweredQuestions: number;
  knowledgeGaps: KnowledgeGap[];
  summary: {
    criticalGaps: number;
    moderateGaps: number;
    minorGaps: number;
    topCategories: string[];
  };
}

// Improvement opportunity prioritization (Requirement 5.4)
export interface ImprovementOpportunity {
  id: string;
  category: string;
  description: string;
  priorityScore: number;
  frequency: number;
  severity: number;
  trendScore: number;
  effortLevel: 'low' | 'medium' | 'high';
  impactPotential: number;
  recommendedActions: string[];
  sampleQuestions: string[];
  estimatedImpact: {
    questionsAddressed: number;
    userSatisfactionImprovement: number;
    confidenceScoreImprovement: number;
  };
  timeline: string;
  resources: string[];
}

// Trend analysis for problematic questions (Requirement 5.5)
export interface TrendDataPoint {
  period: string;
  count: number;
  avgConfidence: number;
  change: number; // Percentage change from previous period
}

export interface CategoryTrend {
  category: string;
  totalCount: number;
  avgChange: number; // Average percentage change per period
  isIncreasing: boolean;
  isVolatile: boolean;
  trendData: TrendDataPoint[];
  seasonality: {
    detected: boolean;
    pattern: Array<[number, number]>; // [month, average_count]
  } | null;
  forecast: {
    method: string;
    confidence: 'low' | 'medium' | 'high';
    forecast: Array<{
      period: string;
      predictedCount: number;
    }>;
  } | null;
}

export interface ProblematicQuestionTrends {
  analysisDate: Date;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  granularity: 'daily' | 'weekly' | 'monthly';
  totalQuestions: number;
  categoryTrends: CategoryTrend[];
  overallTrend: {
    totalChange: number; // Overall percentage change
    peakPeriods: string[]; // Periods with highest question counts
    improvingCategories: string[];
    worseningCategories: string[];
  };
}

/**
 * Enhanced Unanswered Question Tracking
 */
export interface UnansweredQuestionTracking {
  questionId: string;
  originalQuestion: string;
  normalizedQuestion: string;
  category: string;
  language: 'en' | 'es';
  confidenceScore: number;
  escalated: boolean;
  timestamp: string;
  userId?: string;
  sessionId?: string;
  context?: string;
  attemptedAnswers?: Array<{
    answer: string;
    confidence: number;
    source: string;
  }>;
}

/**
 * Single Category Knowledge Gap Analysis
 */
export interface CategoryKnowledgeGapAnalysis {
  category: string;
  totalQuestions: number;
  unansweredQuestions: number;
  gapPercentage: number;
  trend: 'improving' | 'worsening' | 'stable';
  weeklyData: Array<{
    week: string;
    total: number;
    unanswered: number;
    percentage: number;
  }>;
  topProblematicQuestions: Array<{
    question: string;
    frequency: number;
    averageConfidence: number;
  }>;
}

/**
 * Real-time Metrics - Live dashboard data
 */
export interface RealTimeMetrics {
  timestamp: string;
  activeConnections: number;
  messagesLastHour: number;
  escalationsToday: number;
  systemLoad: number;
  responseTime: number;
  // Enhanced real-time metrics (Task 7)
  liveConversations: {
    active: number;
    total: number;
    byLanguage: Record<string, number>;
    averageDuration: number;
    newInLastMinute: number;
  };
  activeUsers: {
    total: number;
    unique: number;
    returning: number;
    byRegion: Record<string, number>;
    peakConcurrent: number;
  };
  realTimeEscalations: {
    pending: number;
    inProgress: number;
    resolved: number;
    averageWaitTime: number;
    criticalCount: number;
  };
  escalations: {
    pending: number;
    inProgress: number;
    resolved: number;
    averageWaitTime: number;
    criticalCount: number;
  };
  systemPerformance: {
    responseTime: {
      p50: number;
      p95: number;
      p99: number;
    };
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: number;
    errorRate: number;
    throughput: number;
    lambdaMetrics: {
      chatProcessor: {
        invocations: number;
        errors: number;
        duration: number;
        throttles: number;
      };
      adminAnalytics: {
        invocations: number;
        errors: number;
        duration: number;
        throttles: number;
      };
      escalationProcessor: {
        invocations: number;
        errors: number;
        duration: number;
        throttles: number;
      };
    };
    dynamoDbMetrics: {
      readCapacityUtilization: number;
      writeCapacityUtilization: number;
      throttledRequests: number;
      successfulRequests: number;
    };
  };
  alerts: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
    resolved: boolean;
  }>;
}

/**
 * Enhanced Dashboard Data - Complete dashboard metrics
 */
export interface EnhancedDashboardData {
  conversationAnalytics: ConversationAnalytics;
  questionAnalytics: FAQAnalysis; // Renamed for consistency with test expectations
  escalationAnalytics: UnansweredAnalysis; // Renamed for consistency with test expectations
  realTimeMetrics: RealTimeMetrics;
  timestamp: string;
}

/**
 * Enhanced Question Ranking Result
 */
export interface EnhancedQuestionRankingResult {
  rankedQuestions: Array<{
    question: string;
    rank: number;
    score: number;
    frequency: number;
    averageConfidence: number;
    category: string;
    impactScore: number;
    rankingFactors: {
      frequencyScore: number;
      confidenceScore: number;
      impactScore: number;
      combinedScore: number;
    };
  }>;
  rankingMethod: string;
  totalQuestionsRanked: number;
  rankingMetadata: {
    method: string;
    totalQuestions: number;
    dateRange: { start: string; end: string };
    language?: string;
  };
}

// ============================================================================
// TASK 8: Advanced Filtering and Search Implementation
// ============================================================================

/**
 * Advanced Filter Options - Multi-parameter filtering with logical AND operations
 * Requirement 7.1, 7.3
 */
export interface AdvancedFilterOptions {
  // Date range filtering
  startDate?: string; // ISO 8601 date
  endDate?: string; // ISO 8601 date
  
  // Conversation filtering
  language?: 'en' | 'es';
  outcome?: 'resolved' | 'escalated' | 'abandoned';
  confidenceThreshold?: number; // 0-1
  messageCountMin?: number;
  messageCountMax?: number;
  
  // User filtering
  userId?: string;
  userZipCode?: string;
  
  // Escalation filtering
  escalationPriority?: 'low' | 'medium' | 'high' | 'critical';
  escalationStatus?: 'pending' | 'in_progress' | 'resolved';
  escalationReason?: string;
  
  // Question filtering
  questionCategory?: string;
  isAnswered?: boolean;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'timestamp' | 'confidenceScore' | 'messageCount' | 'outcome';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Text-based Search Options - Full-text search for conversations and questions
 * Requirement 7.2
 */
export interface SearchOptions {
  // Search query
  query: string;
  
  // Search scope
  searchIn: ('conversations' | 'questions' | 'messages')[];
  
  // Search filters
  filters?: AdvancedFilterOptions;
  
  // Search configuration
  fuzzyMatch?: boolean; // Enable fuzzy matching
  caseSensitive?: boolean;
  wholeWords?: boolean;
  
  // Result configuration
  maxResults?: number;
  includeHighlights?: boolean; // Include search term highlights
  
  // Relevance scoring
  minRelevanceScore?: number; // 0-1
}

/**
 * Search Result - Individual search result with relevance scoring
 */
export interface SearchResult {
  id: string;
  type: 'conversation' | 'question' | 'message';
  relevanceScore: number; // 0-1
  title: string;
  content: string;
  highlights?: string[]; // Highlighted search terms
  metadata: {
    timestamp: string;
    language?: string;
    category?: string;
    conversationId?: string;
    userId?: string;
  };
}

/**
 * Search Results Response - Complete search results with metadata
 */
export interface SearchResultsResponse {
  results: SearchResult[];
  totalCount: number;
  searchQuery: string;
  searchOptions: SearchOptions;
  executionTime: number; // milliseconds
  suggestions?: string[]; // Alternative search suggestions
}

/**
 * Filter State Management - Track applied filters for API responses
 * Requirement 7.3
 */
export interface FilterState {
  filterId: string; // Unique identifier for this filter combination
  appliedFilters: AdvancedFilterOptions;
  searchOptions?: SearchOptions;
  createdAt: string; // ISO 8601
  lastUsed: string; // ISO 8601
  resultCount: number;
  executionTime: number; // milliseconds
}

/**
 * Filtered Response - API response with filter state information
 */
export interface FilteredResponse<T> {
  data: T[];
  filterState: FilterState;
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  appliedFilters: AdvancedFilterOptions;
  searchQuery?: string;
}

/**
 * Data Export Options - Export functionality with applied filters
 * Requirement 7.5
 */
export interface DataExportOptions {
  // Export format
  format: 'json' | 'csv' | 'xlsx';
  
  // Data selection
  dataTypes: ('conversations' | 'messages' | 'questions' | 'escalations')[];
  
  // Applied filters
  filters?: AdvancedFilterOptions;
  searchOptions?: SearchOptions;
  
  // Export configuration
  includeMetadata?: boolean;
  includeHeaders?: boolean; // For CSV/XLSX
  compressOutput?: boolean;
  
  // File options
  filename?: string;
  maxRecords?: number;
}

/**
 * Export Result - Information about completed export
 */
export interface ExportResult {
  exportId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: string;
  filename: string;
  recordCount: number;
  fileSize: number; // bytes
  downloadUrl?: string; // S3 presigned URL
  createdAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  expiresAt?: string; // ISO 8601
  error?: string;
}

/**
 * Advanced Analytics Query - Complex query with filtering and aggregation
 */
export interface AdvancedAnalyticsQuery {
  // Query identification
  queryId: string;
  queryName?: string;
  
  // Data selection
  metrics: string[]; // Metric names to calculate
  dimensions: string[]; // Grouping dimensions
  
  // Filtering
  filters: AdvancedFilterOptions;
  
  // Time aggregation
  timeGranularity?: 'hour' | 'day' | 'week' | 'month';
  
  // Result configuration
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Query Result - Result of advanced analytics query
 */
export interface QueryResult {
  queryId: string;
  executedAt: string; // ISO 8601
  executionTime: number; // milliseconds
  resultCount: number;
  data: Array<{
    dimensions: Record<string, any>;
    metrics: Record<string, number>;
    timestamp?: string;
  }>;
  filters: AdvancedFilterOptions;
  metadata: {
    totalRecordsScanned: number;
    cacheHit: boolean;
    dataFreshness: string; // ISO 8601 of oldest data
  };
}

// ============================================================================
// TASK 10: Enhanced Lambda Function Types
// ============================================================================

/**
 * Cache Entry - Individual cache entry with TTL and metadata
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

/**
 * Cache Options - Configuration for cache operations
 */
export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  persistToDynamoDB?: boolean;
  compressionEnabled?: boolean;
}

/**
 * Cache Statistics - Performance metrics for cache service
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  memoryUsage: number;
}

/**
 * Validation Result - Result of parameter validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

/**
 * Validation Rule - Configuration for field validation
 */
export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enumValues?: string[];
  customValidator?: (value: any) => boolean;
  sanitizer?: (value: any) => any;
}

/**
 * Performance Metrics - Lambda function performance tracking
 */
export interface PerformanceMetrics {
  requestId: string;
  endpoint: string;
  method: string;
  startTime: number;
  endTime: number;
  duration: number;
  cacheHit: boolean;
  memoryUsed: number;
  errors?: string[];
}

/**
 * Circuit Breaker State - Circuit breaker pattern implementation
 */
export interface CircuitBreakerState {
  serviceName: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  successCount?: number;
}

/**
 * Retry Configuration - Exponential backoff retry settings
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Error Context - Enhanced error information for debugging
 */
export interface ErrorContext {
  requestId: string;
  endpoint: string;
  method: string;
  parameters: any;
  timestamp: string;
  userId?: string;
  stackTrace?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * Health Check Result - Service health status
 */
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastChecked: string;
  details?: Record<string, any>;
  error?: string;
}

/**
 * Lambda Response - Standardized API response format
 */
export interface LambdaResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  requestId?: string;
  performance?: {
    duration: number;
    cacheHit: boolean;
    memoryUsed: number;
  };
}

/**
 * Middleware Context - Context passed through middleware chain
 */
export interface MiddlewareContext {
  requestId: string;
  startTime: number;
  endpoint: string;
  method: string;
  parameters: any;
  validatedParams?: any;
  cacheKey?: string;
  performanceMetrics: PerformanceMetrics;
}

// ============================================================================
// TASK 2.1: Additional Core Data Models for ADA Clara Chatbot
// Requirements: 2.2, 3.4, 7.3
// ============================================================================

/**
 * Diabetes Risk Assessment - Risk evaluation questionnaire and results
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export interface DiabetesRiskAssessment {
  assessmentId: string;
  userId?: string;
  sessionId: string;
  startTime: Date;
  completedTime?: Date;
  language: 'en' | 'es';
  
  // Risk factors questionnaire responses
  responses: {
    age?: number;
    gender?: 'male' | 'female' | 'other';
    weight?: number;
    height?: number;
    familyHistory?: boolean;
    physicalActivity?: 'none' | 'low' | 'moderate' | 'high';
    bloodPressure?: boolean;
    gestationalDiabetes?: boolean;
    prediabetes?: boolean;
    ethnicity?: string;
  };
  
  // Calculated results
  riskScore: number; // 0-100 scale
  riskLevel: 'low' | 'moderate' | 'high' | 'very-high';
  recommendations: string[];
  
  // Follow-up information
  contactInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
    followUpRequested: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event Information - Diabetes-related events and programs
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export interface EventInformation {
  eventId: string;
  title: string;
  description: string;
  eventType: 'education' | 'support' | 'fundraising' | 'conference' | 'webinar';
  
  // Event details
  startDate: Date;
  endDate?: Date;
  location?: {
    venue?: string;
    address?: string;
    city: string;
    state: string;
    zipCode: string;
    isVirtual: boolean;
  };
  
  // Registration information
  registration: {
    required: boolean;
    url?: string;
    deadline?: Date;
    capacity?: number;
    currentRegistrations?: number;
    cost?: number;
    contactInfo?: {
      email?: string;
      phone?: string;
    };
  };
  
  // Content metadata
  targetAudience: string[];
  language: 'en' | 'es' | 'both';
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
  lastScraped: Date;
}

/**
 * Language Detection Result - Language identification for user messages
 * Requirements: 1.2, 1.3, 1.5
 */
export interface LanguageDetectionResult {
  detectedLanguage: 'en' | 'es' | 'unknown';
  confidence: number; // 0-1
  alternativeLanguages?: Array<{
    language: 'en' | 'es';
    confidence: number;
  }>;
  method: 'amazon-comprehend' | 'heuristic' | 'user-specified';
}

/**
 * RAG Response - Response from Retrieval-Augmented Generation system
 * Requirements: 2.4, 2.5, 1.4
 */
export interface RAGResponse {
  responseId: string;
  query: string;
  response: string;
  language: 'en' | 'es';
  confidence: number; // 0-1
  
  // Retrieved context
  sources: Source[];
  retrievalMetrics: {
    documentsRetrieved: number;
    averageRelevanceScore: number;
    searchLatency: number; // milliseconds
  };
  
  // Generation metrics
  generationMetrics: {
    modelUsed: string;
    tokensGenerated: number;
    generationLatency: number; // milliseconds
  };
  
  // Quality assessment
  qualityMetrics: {
    coherence: number; // 0-1
    relevance: number; // 0-1
    factualAccuracy: number; // 0-1
    completeness: number; // 0-1
  };
  
  timestamp: Date;
}

/**
 * Escalation Context - Information passed to Dialpad during escalation
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export interface EscalationContext {
  escalationId: string;
  sessionId: string;
  userId?: string;
  
  // Escalation trigger information
  trigger: {
    type: 'low-confidence' | 'user-request' | 'complex-query' | 'system-error';
    confidence?: number;
    reason: string;
    timestamp: Date;
  };
  
  // User information for Dialpad
  userInfo: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
    language: 'en' | 'es';
  };
  
  // Conversation context
  conversationSummary: string;
  messageHistory: ChatMessage[];
  lastBotResponse?: string;
  
  // System context
  systemContext: {
    currentTime: Date;
    userAgent?: string;
    sessionDuration: number; // milliseconds
    messageCount: number;
  };
  
  // Dialpad integration
  dialpadTicketId?: string;
  escalationStatus: 'pending' | 'transferred' | 'completed' | 'failed';
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * System Configuration - Runtime configuration for ADA Clara
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export interface SystemConfiguration {
  configId: string;
  environment: 'dev' | 'staging' | 'prod';
  
  // RAG system configuration
  ragConfig: {
    embeddingModel: string;
    generativeModel: string;
    maxRetrievedDocuments: number;
    confidenceThreshold: number;
    responseMaxTokens: number;
  };
  
  // Escalation configuration
  escalationConfig: {
    confidenceThreshold: number;
    maxResponseTime: number; // milliseconds
    dialpadIntegration: {
      enabled: boolean;
      apiEndpoint?: string;
      timeout: number;
    };
  };
  
  // Language configuration
  languageConfig: {
    supportedLanguages: ('en' | 'es')[];
    defaultLanguage: 'en' | 'es';
    detectionThreshold: number;
  };
  
  // Security configuration
  securityConfig: {
    encryptionEnabled: boolean;
    auditLoggingEnabled: boolean;
    dataRetentionDays: number;
    hipaaCompliant: boolean;
  };
  
  // Performance configuration
  performanceConfig: {
    cacheEnabled: boolean;
    cacheTTL: number; // seconds
    maxConcurrentSessions: number;
    responseTimeoutMs: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
  version: string;
}

/**
 * Content Scraping Job - Web scraping job status and results
 * Requirements: 2.1, 2.2, 2.3
 */
export interface ContentScrapingJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  
  // Job configuration
  config: {
    targetUrl: string;
    maxPages?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    respectRobotsTxt: boolean;
  };
  
  // Job progress
  progress: {
    pagesScraped: number;
    pagesProcessed: number;
    documentsCreated: number;
    vectorsGenerated: number;
    errors: number;
  };
  
  // Job results
  results?: {
    totalContent: number;
    newContent: number;
    updatedContent: number;
    deletedContent: number;
    processingTime: number; // milliseconds
  };
  
  // Error information
  errors?: Array<{
    url: string;
    error: string;
    timestamp: Date;
  }>;
  
  startTime: Date;
  endTime?: Date;
  nextScheduledRun?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ENHANCED VALIDATION FUNCTIONS - Task 2.1 Requirement
// ============================================================================

/**
 * Enhanced Data Validation Utilities
 * Comprehensive validation for all ADA Clara data models
 */
export class EnhancedDataValidator extends DataValidator {
  
  /**
   * Validate Diabetes Risk Assessment
   */
  static validateDiabetesRiskAssessment(assessment: Partial<DiabetesRiskAssessment>): ValidationResult {
    const errors: string[] = [];
    
    if (!assessment.assessmentId) errors.push('assessmentId is required');
    if (!assessment.sessionId) errors.push('sessionId is required');
    if (!assessment.language || !['en', 'es'].includes(assessment.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (!assessment.startTime) errors.push('startTime is required');
    
    // Validate responses
    if (assessment.responses) {
      const { responses } = assessment;
      if (responses.age !== undefined && (responses.age < 0 || responses.age > 120)) {
        errors.push('age must be between 0 and 120');
      }
      if (responses.weight !== undefined && (responses.weight < 0 || responses.weight > 1000)) {
        errors.push('weight must be between 0 and 1000');
      }
      if (responses.height !== undefined && (responses.height < 0 || responses.height > 300)) {
        errors.push('height must be between 0 and 300');
      }
    }
    
    // Validate risk score
    if (assessment.riskScore !== undefined && (assessment.riskScore < 0 || assessment.riskScore > 100)) {
      errors.push('riskScore must be between 0 and 100');
    }
    
    // Validate risk level
    if (assessment.riskLevel && !['low', 'moderate', 'high', 'very-high'].includes(assessment.riskLevel)) {
      errors.push('riskLevel must be one of: low, moderate, high, very-high');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate Event Information
   */
  static validateEventInformation(event: Partial<EventInformation>): ValidationResult {
    const errors: string[] = [];
    
    if (!event.eventId) errors.push('eventId is required');
    if (!event.title || event.title.trim().length === 0) {
      errors.push('title is required and cannot be empty');
    }
    if (!event.description || event.description.trim().length === 0) {
      errors.push('description is required and cannot be empty');
    }
    if (!event.eventType || !['education', 'support', 'fundraising', 'conference', 'webinar'].includes(event.eventType)) {
      errors.push('eventType must be one of: education, support, fundraising, conference, webinar');
    }
    if (!event.startDate) errors.push('startDate is required');
    if (!event.language || !['en', 'es', 'both'].includes(event.language)) {
      errors.push('language must be "en", "es", or "both"');
    }
    
    // Validate location if provided
    if (event.location) {
      const { location } = event;
      if (!location.city || location.city.trim().length === 0) {
        errors.push('location.city is required when location is provided');
      }
      if (!location.state || location.state.trim().length === 0) {
        errors.push('location.state is required when location is provided');
      }
      if (!location.zipCode || location.zipCode.trim().length === 0) {
        errors.push('location.zipCode is required when location is provided');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate RAG Response
   */
  static validateRAGResponse(response: Partial<RAGResponse>): ValidationResult {
    const errors: string[] = [];
    
    if (!response.responseId) errors.push('responseId is required');
    if (!response.query || response.query.trim().length === 0) {
      errors.push('query is required and cannot be empty');
    }
    if (!response.response || response.response.trim().length === 0) {
      errors.push('response is required and cannot be empty');
    }
    if (!response.language || !['en', 'es'].includes(response.language)) {
      errors.push('language must be "en" or "es"');
    }
    if (response.confidence === undefined || response.confidence < 0 || response.confidence > 1) {
      errors.push('confidence is required and must be between 0 and 1');
    }
    if (!response.timestamp) errors.push('timestamp is required');
    
    // Validate sources array
    if (response.sources && Array.isArray(response.sources)) {
      response.sources.forEach((source, index) => {
        if (!source.url) errors.push(`sources[${index}].url is required`);
        if (!source.title) errors.push(`sources[${index}].title is required`);
        if (source.relevanceScore < 0 || source.relevanceScore > 1) {
          errors.push(`sources[${index}].relevanceScore must be between 0 and 1`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate Escalation Context
   */
  static validateEscalationContext(context: Partial<EscalationContext>): ValidationResult {
    const errors: string[] = [];
    
    if (!context.escalationId) errors.push('escalationId is required');
    if (!context.sessionId) errors.push('sessionId is required');
    
    // Validate trigger
    if (!context.trigger) {
      errors.push('trigger is required');
    } else {
      const { trigger } = context;
      if (!trigger.type || !['low-confidence', 'user-request', 'complex-query', 'system-error'].includes(trigger.type)) {
        errors.push('trigger.type must be one of: low-confidence, user-request, complex-query, system-error');
      }
      if (!trigger.reason || trigger.reason.trim().length === 0) {
        errors.push('trigger.reason is required and cannot be empty');
      }
      if (!trigger.timestamp) errors.push('trigger.timestamp is required');
    }
    
    // Validate user info
    if (!context.userInfo) {
      errors.push('userInfo is required');
    } else {
      const { userInfo } = context;
      if (!userInfo.language || !['en', 'es'].includes(userInfo.language)) {
        errors.push('userInfo.language must be "en" or "es"');
      }
      if (userInfo.email && !EnhancedDataValidator.isValidEmail(userInfo.email)) {
        errors.push('userInfo.email must be a valid email address');
      }
    }
    
    // Validate escalation status
    if (!context.escalationStatus || !['pending', 'transferred', 'completed', 'failed'].includes(context.escalationStatus)) {
      errors.push('escalationStatus must be one of: pending, transferred, completed, failed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate System Configuration
   */
  static validateSystemConfiguration(config: Partial<SystemConfiguration>): ValidationResult {
    const errors: string[] = [];
    
    if (!config.configId) errors.push('configId is required');
    if (!config.environment || !['dev', 'staging', 'prod'].includes(config.environment)) {
      errors.push('environment must be one of: dev, staging, prod');
    }
    if (!config.version) errors.push('version is required');
    
    // Validate RAG config
    if (config.ragConfig) {
      const { ragConfig } = config;
      if (!ragConfig.embeddingModel) errors.push('ragConfig.embeddingModel is required');
      if (!ragConfig.generativeModel) errors.push('ragConfig.generativeModel is required');
      if (ragConfig.confidenceThreshold < 0 || ragConfig.confidenceThreshold > 1) {
        errors.push('ragConfig.confidenceThreshold must be between 0 and 1');
      }
    }
    
    // Validate escalation config
    if (config.escalationConfig) {
      const { escalationConfig } = config;
      if (escalationConfig.confidenceThreshold < 0 || escalationConfig.confidenceThreshold > 1) {
        errors.push('escalationConfig.confidenceThreshold must be between 0 and 1');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate Content Scraping Job
   */
  static validateContentScrapingJob(job: Partial<ContentScrapingJob>): ValidationResult {
    const errors: string[] = [];
    
    if (!job.jobId) errors.push('jobId is required');
    if (!job.status || !['pending', 'running', 'completed', 'failed'].includes(job.status)) {
      errors.push('status must be one of: pending, running, completed, failed');
    }
    if (!job.startTime) errors.push('startTime is required');
    
    // Validate config
    if (!job.config) {
      errors.push('config is required');
    } else {
      const { config } = job;
      if (!config.targetUrl) errors.push('config.targetUrl is required');
      if (!this.isValidUrl(config.targetUrl)) {
        errors.push('config.targetUrl must be a valid URL');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// ============================================================================
// UTILITY FUNCTIONS FOR DATA MODEL OPERATIONS
// ============================================================================

/**
 * Data Model Utilities - Helper functions for working with ADA Clara data models
 */
export class DataModelUtils {
  
  /**
   * Generate unique IDs for various entities
   */
  static generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }
  
  /**
   * Calculate risk score from assessment responses
   */
  static calculateRiskScore(responses: DiabetesRiskAssessment['responses']): number {
    let score = 0;
    
    // Age factor (0-25 points)
    if (responses.age) {
      if (responses.age >= 45) score += 25;
      else if (responses.age >= 35) score += 15;
      else if (responses.age >= 25) score += 5;
    }
    
    // Family history (0-15 points)
    if (responses.familyHistory) score += 15;
    
    // Physical activity (0-20 points)
    if (responses.physicalActivity === 'none') score += 20;
    else if (responses.physicalActivity === 'low') score += 10;
    
    // Blood pressure (0-15 points)
    if (responses.bloodPressure) score += 15;
    
    // Previous conditions (0-25 points)
    if (responses.gestationalDiabetes) score += 15;
    if (responses.prediabetes) score += 25;
    
    return Math.min(score, 100); // Cap at 100
  }
  
  /**
   * Determine risk level from score
   */
  static determineRiskLevel(score: number): DiabetesRiskAssessment['riskLevel'] {
    if (score >= 75) return 'very-high';
    if (score >= 50) return 'high';
    if (score >= 25) return 'moderate';
    return 'low';
  }
  
  /**
   * Generate risk recommendations based on level
   */
  static generateRiskRecommendations(riskLevel: DiabetesRiskAssessment['riskLevel'], language: 'en' | 'es'): string[] {
    const recommendations: Record<string, Record<string, string[]>> = {
      'low': {
        'en': [
          'Maintain a healthy diet and regular exercise',
          'Continue regular health checkups',
          'Monitor your weight and blood pressure'
        ],
        'es': [
          'Mantén una dieta saludable y ejercicio regular',
          'Continúa con chequeos médicos regulares',
          'Monitorea tu peso y presión arterial'
        ]
      },
      'moderate': {
        'en': [
          'Schedule a diabetes screening with your healthcare provider',
          'Focus on weight management and physical activity',
          'Consider lifestyle modifications to reduce risk'
        ],
        'es': [
          'Programa un examen de diabetes con tu proveedor de salud',
          'Enfócate en el manejo del peso y actividad física',
          'Considera modificaciones del estilo de vida para reducir el riesgo'
        ]
      },
      'high': {
        'en': [
          'Schedule an immediate appointment with your healthcare provider',
          'Discuss diabetes prevention strategies',
          'Consider joining a diabetes prevention program'
        ],
        'es': [
          'Programa una cita inmediata con tu proveedor de salud',
          'Discute estrategias de prevención de diabetes',
          'Considera unirte a un programa de prevención de diabetes'
        ]
      },
      'very-high': {
        'en': [
          'Seek immediate medical evaluation',
          'Discuss comprehensive diabetes testing',
          'Implement immediate lifestyle changes with medical supervision'
        ],
        'es': [
          'Busca evaluación médica inmediata',
          'Discute pruebas integrales de diabetes',
          'Implementa cambios inmediatos del estilo de vida con supervisión médica'
        ]
      }
    };
    
    return recommendations[riskLevel]?.[language] || recommendations[riskLevel]['en'] || [];
  }
  
  /**
   * Format user information for Dialpad escalation
   */
  static formatUserInfoForDialpad(userInfo: EscalationContext['userInfo']): Record<string, any> {
    return {
      name: userInfo.name || 'Anonymous User',
      email: userInfo.email || '',
      phone: userInfo.phone || '',
      zipCode: userInfo.zipCode || '',
      language: userInfo.language,
      preferredLanguage: userInfo.language === 'es' ? 'Spanish' : 'English'
    };
  }
  
  /**
   * Calculate conversation summary statistics
   */
  static calculateConversationStats(messages: ChatMessage[]): {
    duration: number;
    messageCount: number;
    averageConfidence: number;
    escalationTriggers: number;
  } {
    if (messages.length === 0) {
      return { duration: 0, messageCount: 0, averageConfidence: 0, escalationTriggers: 0 };
    }
    
    const sortedMessages = messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const firstMessage = sortedMessages[0];
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    
    const duration = lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime();
    const botMessages = messages.filter(m => m.sender === 'bot' && m.confidence !== undefined);
    const averageConfidence = botMessages.length > 0 
      ? botMessages.reduce((sum, m) => sum + (m.confidence || 0), 0) / botMessages.length 
      : 0;
    
    // Count escalation triggers (messages with low confidence)
    const escalationTriggers = botMessages.filter(m => (m.confidence || 0) < 0.7).length;
    
    return {
      duration,
      messageCount: messages.length,
      averageConfidence,
      escalationTriggers
    };
  }
}

// ============================================================================
// WEEKLY CRAWLER SCHEDULING - CONTENT DETECTION TYPES
// ============================================================================

/**
 * Content Detection Service Interfaces
 * For weekly crawler scheduling with intelligent content change detection
 */

/**
 * Content Change Detection Result
 */
export interface ChangeDetectionResult {
  hasChanged: boolean;
  changeType: 'new' | 'modified' | 'unchanged' | 'deleted';
  previousHash?: string;
  currentHash: string;
  lastModified?: Date;
  contentDiff?: ContentDifference;
}

/**
 * Content Record for tracking crawled content
 */
export interface ContentRecord {
  url: string;
  contentHash: string;
  lastCrawled: Date;
  lastModified?: Date;
  wordCount: number;
  chunkCount: number;
  vectorIds: string[];
  metadata: Record<string, string>;
}

/**
 * Content Difference Analysis
 */
export interface ContentDifference {
  addedSections: string[];
  removedSections: string[];
  modifiedSections: Array<{
    section: string;
    oldContent: string;
    newContent: string;
  }>;
  significanceScore: number; // 0-1 scale
}

/**
 * Content Tracking Record (DynamoDB format)
 */
export interface ContentTrackingRecord {
  // Primary Key
  PK: string; // 'CONTENT#{url_hash}'
  SK: string; // 'METADATA'
  
  // Content Information
  url: string;
  contentHash: string;
  lastCrawled: string; // ISO timestamp
  lastModified?: string; // ISO timestamp from HTTP headers
  
  // Processing Information
  wordCount: number;
  chunkCount: number;
  vectorIds: string[]; // S3 Vectors IDs for cleanup
  
  // Status Tracking
  status: 'active' | 'deleted' | 'error';
  errorCount: number;
  lastError?: string;
  
  // Metadata
  title?: string;
  section?: string;
  contentType: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  ttl?: number; // For cleanup of old records
}

/**
 * Content Detection Service Interface
 */
export interface ContentDetectionService {
  detectChanges(url: string, newContent: string): Promise<ChangeDetectionResult>;
  updateContentRecord(url: string, content: ContentRecord): Promise<void>;
  getLastCrawlTimestamp(url: string): Promise<Date | null>;
  markContentProcessed(url: string, contentHash: string): Promise<void>;
}

/**
 * Content Normalization Options
 */
export interface ContentNormalizationOptions {
  removeWhitespace: boolean;
  removeHtmlTags: boolean;
  removeTimestamps: boolean;
  removeAds: boolean;
  normalizeUrls: boolean;
  lowercaseText: boolean;
}

/**
 * Hash Generation Options
 */
export interface HashGenerationOptions {
  algorithm: 'sha256' | 'md5' | 'sha1';
  encoding: 'hex' | 'base64';
  normalization: ContentNormalizationOptions;
}

// ===== WEEKLY CRAWLER SCHEDULING TYPES =====

/**
 * Scheduled Crawl Event - EventBridge triggered crawl
 */
export interface ScheduledCrawlEvent {
  source: 'eventbridge';
  action: 'scheduled-crawl';
  scheduleId: string;
  targetUrls: string[];
  executionId: string;
  retryAttempt?: number;
}

/**
 * Manual Crawl Event - User triggered crawl
 */
export interface ManualCrawlEvent {
  source: 'manual';
  action: 'manual-crawl';
  targetUrls: string[];
  forceRefresh?: boolean; // Skip change detection
  userId?: string;
}

/**
 * Crawler Execution Result
 */
export interface CrawlerExecutionResult {
  executionId: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalUrls: number;
  processedUrls: number;
  skippedUrls: number;
  failedUrls: number;
  newContent: number;
  modifiedContent: number;
  unchangedContent: number;
  vectorsCreated: number;
  vectorsUpdated: number;
  errors: CrawlerError[];
  performance: {
    averageProcessingTime: number;
    throughput: number;
    changeDetectionTime: number;
    embeddingGenerationTime: number;
    vectorStorageTime: number;
  };
  contentChanges: ContentChangesSummary[];
}

/**
 * Content Changes Summary
 */
export interface ContentChangesSummary {
  url: string;
  changeType: 'new' | 'modified' | 'unchanged' | 'deleted';
  previousHash?: string;
  currentHash: string;
  significanceScore?: number;
  processingDecision: 'processed' | 'skipped' | 'failed' | 'blocked' | 'rate_limited' | 'compliance_blocked';
  vectorIds?: string[];
}

/**
 * Crawler Error - Enhanced error tracking
 */
export interface CrawlerError {
  url: string;
  errorType: 'network' | 'parsing' | 'storage' | 'security' | 'rate_limit' | 'compliance';
  errorMessage: string;
  timestamp: string;
  retryAttempt: number;
  recoverable: boolean;
}
export interface CrawlerConfiguration {
  targetUrls: string[];
  changeDetectionEnabled: boolean;
  forceRefresh: boolean;
  maxRetries: number;
  timeoutSeconds: number;
  rateLimitDelay: number;
  batchSize: number;
  parallelProcessing: boolean;
  skipUnchangedContent: boolean;
}

/**
 * Execution Metrics
 */
export interface ExecutionMetrics {
  executionId: string;
  timestamp: string;
  metricType: 'performance' | 'throughput' | 'error' | 'content';
  metricName: string;
  value: number;
  unit: string;
  dimensions: Record<string, string>;
}

/**
 * Schedule Configuration
 */
export interface ScheduleConfig {
  frequency: 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek: number; // 0-6, Sunday = 0
  hour: number; // 0-23, UTC
  targetUrls: string[];
  retryAttempts: number;
  timeoutMinutes: number;
}

/**
 * Execution Record for tracking
 */
export interface ExecutionRecord {
  executionId: string;
  scheduleId?: string;
  triggerType: 'scheduled' | 'manual';
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  result?: CrawlerExecutionResult;
}

// ============================================================================
// SECURITY VALIDATION AND COMPLIANCE TYPES - TASK 6
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
// ============================================================================

/**
 * URL Validation Result - Security validation for crawler URLs
 * Requirement 6.2: URL domain whitelist validation
 */
export interface URLValidationResult {
  isValid: boolean;
  domain: string;
  protocol: string;
  path: string;
  reason?: string;
  securityFlags: {
    isHttps: boolean;
    isDomainWhitelisted: boolean;
    hasValidPath: boolean;
    isSuspiciousPattern: boolean;
  };
}

/**
 * Rate Limit Result - Rate limiting compliance
 * Requirement 6.4: Rate limiting to respect robots.txt and terms of service
 */
export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  currentWindow: {
    requests: number;
    windowStart: Date;
    windowEnd: Date;
  };
}

/**
 * Audit Log Entry - Security audit and compliance logging
 * Requirement 6.5: Audit logging for all crawler activities
 */
export interface AuditLogEntry {
  timestamp: string;
  executionId: string;
  action: string;
  resource: string;
  userId?: string;
  sourceIp?: string;
  userAgent?: string;
  result: 'success' | 'failure' | 'blocked';
  details: Record<string, any>;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Encryption Validation Result - Content encryption compliance
 * Requirement 6.3: Encryption validation for stored content and metadata
 */
export interface EncryptionValidationResult {
  isValid: boolean;
  encryptionType: string;
  keyId?: string;
  algorithm?: string;
  compliance: {
    meetsRequirements: boolean;
    issues: string[];
  };
}

/**
 * Security Validation Configuration
 * Comprehensive security settings for crawler compliance
 */
export interface SecurityValidationConfig {
  // URL validation
  allowedDomains: string[];
  allowedProtocols: string[];
  blockedPaths: string[];
  maxUrlLength: number;
  
  // Rate limiting
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
  
  // Audit logging
  auditTableName: string;
  auditRetentionDays: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Encryption
  requiredEncryption: 'SSE-S3' | 'SSE-KMS' | 'SSE-C';
  allowedKmsKeys?: string[];
}

/**
 * Robots.txt Validation Result
 * Requirement 6.4: Robots.txt compliance validation
 */
export interface RobotsTxtValidationResult {
  compliant: boolean;
  rules: string[];
  crawlDelay?: number;
  disallowedPaths?: string[];
  userAgent?: string;
}

/**
 * Security Metrics - CloudWatch security monitoring
 */
export interface SecurityMetrics {
  timestamp: string;
  urlValidationAttempts: number;
  urlValidationFailures: number;
  rateLimitViolations: number;
  encryptionValidationFailures: number;
  auditLogEntries: number;
  securityIncidents: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    count: number;
  }>;
}

/**
 * IAM Policy Statement - Minimal permissions structure
 * Requirement 6.1: Minimal IAM permissions for EventBridge execution
 */
export interface MinimalIAMPolicy {
  Version: string;
  Statement: Array<{
    Sid?: string;
    Effect: 'Allow' | 'Deny';
    Action: string | string[];
    Resource: string | string[];
    Condition?: Record<string, any>;
    NotAction?: string | string[];
  }>;
}

/**
 * Security Compliance Report
 * Comprehensive security status for crawler operations
 */
export interface SecurityComplianceReport {
  reportId: string;
  timestamp: string;
  executionId: string;
  
  // URL validation summary
  urlValidation: {
    totalUrls: number;
    validUrls: number;
    blockedUrls: number;
    securityViolations: number;
    domainWhitelistViolations: number;
  };
  
  // Rate limiting summary
  rateLimiting: {
    totalRequests: number;
    allowedRequests: number;
    rateLimitedRequests: number;
    averageRequestRate: number;
    peakRequestRate: number;
  };
  
  // Encryption compliance
  encryptionCompliance: {
    totalObjects: number;
    encryptedObjects: number;
    complianceViolations: number;
    encryptionType: string;
  };
  
  // Audit logging
  auditLogging: {
    totalEvents: number;
    securityEvents: number;
    criticalEvents: number;
    auditLogRetention: number; // days
  };
  
  // Overall compliance score
  complianceScore: number; // 0-100
  complianceLevel: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Recommendations
  recommendations: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
    action: string;
  }>;
}