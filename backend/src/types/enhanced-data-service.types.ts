/**
 * Data Service Types
 * 
 * Type definitions for unified data management across DynamoDB and S3 operations.
 */

export interface UserSession {
  sessionId: string;
  userId: string;
  language: 'en' | 'es';
  userInfo?: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  escalated?: boolean;
  escalationReason?: string;
  escalationTimestamp?: Date;
  ttl?: number;
}

export interface ChatMessage {
  messageId: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  language: 'en' | 'es';
  metadata?: Record<string, any>;
  ttl?: number;
}

export interface UserPreferences {
  userId: string;
  language: 'en' | 'es';
  preferences: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  ttl?: number;
}

export interface AnalyticsData {
  date: string; // YYYY-MM-DD format
  hour: number;
  type: 'chat' | 'escalation' | 'performance' | 'user';
  metric: string;
  value: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface AuditLog {
  eventId: string;
  eventType: 'login' | 'logout' | 'data_access' | 'escalation' | 'error';
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ttl?: number;
}

export interface EscalationQueue {
  escalationId: string;
  sessionId: string;
  userId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reason: string;
  userInfo: Record<string, any>;
  conversationHistory: ChatMessage[];
  assignedAgent?: string;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  ttl?: number;
}

export interface EscalationStatus {
  escalationId: string;
  sessionId: string;
  status: 'initiated' | 'email_sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  assignedAgent?: string;
  followUpRequired: boolean;
}

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
    readingTime: number;
  };
  createdAt: Date;
}

export interface DataServiceHealthCheck {
  dynamodb: boolean;
  s3: { 
    contentBucket: boolean; 
    vectorsBucket: boolean; 
  };
  overall: boolean;
}

export interface DataServiceInfo {
  buckets: { 
    contentBucket: string; 
    vectorsBucket: string; 
  };
  tables: string[];
}

export interface AnalyticsSummary {
  totalSessions: number;
  totalMessages: number;
  escalationRate: number;
  languageDistribution: Record<string, number>;
  averageResponseTime: number;
}