// ADA Clara Chatbot - Core Data Models
// TypeScript interfaces for DynamoDB-based data storage

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