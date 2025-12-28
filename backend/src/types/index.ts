// ADA Clara Chatbot - Core Data Models
// TypeScript interfaces for DynamoDB-based data storage

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
 * User Preferences - Language and interaction preferences
 * DynamoDB Table: UserPreferences
 * PK: USER#{userId}
 * SK: PREFERENCES
 */
export interface UserPreferences {
  userId: string;
  language: 'en' | 'es';
  notifications: boolean;
  escalationPreference: 'email' | 'phone' | 'both';
  timezone?: string;
  accessibilitySettings?: {
    fontSize: 'small' | 'medium' | 'large';
    highContrast: boolean;
    screenReader: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

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

  private static isValidEmail(email: string): boolean {
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