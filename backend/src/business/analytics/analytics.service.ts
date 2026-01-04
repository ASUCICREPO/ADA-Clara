import { DynamoDBService } from '../../services/dynamodb-service';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  AnalyticsData, 
  ConversationRecord, 
  MessageRecord, 
  QuestionRecord,
  ConversationAnalytics,
  ConversationDetails,
  FAQAnalysis,
  UnansweredAnalysis,
  EnhancedDashboardData,
  EnhancedQuestionRankingResult,
  RealTimeMetrics,
  UnansweredQuestion,
  KnowledgeGap,
  KnowledgeGapAnalysis,
  CategoryKnowledgeGapAnalysis,
  ImprovementOpportunity,
  ProblematicQuestionTrends,
  CategoryTrend,
  TrendDataPoint,
  AdvancedFilterOptions,
  SearchOptions,
  SearchResult,
  SearchResultsResponse,
  FilterState,
  FilteredResponse,
  DataExportOptions,
  ExportResult,
  AdvancedAnalyticsQuery,
  QueryResult
} from '../../types/index';

// Simple interfaces for admin dashboard
export interface DashboardMetrics {
  totalConversations: number;
  escalationRate: number;
  outOfScopeRate: number;
  trends: {
    conversations: string;
    escalations: string;
    outOfScope: string;
  };
}

export interface ConversationChartData {
  data: Array<{
    date: string;
    conversations: number;
  }>;
}

export interface LanguageSplit {
  english: number;
  spanish: number;
}

export interface Question {
  question: string;
  count: number;
}

export interface QuestionsResponse {
  questions: Question[];
}

export interface DashboardData {
  metrics: DashboardMetrics;
  conversationsChart: ConversationChartData;
  languageSplit: LanguageSplit;
  frequentlyAskedQuestions: Question[];
  unansweredQuestions: Question[];
  lastUpdated: string;
}

/**
 * Unified Analytics Service for ADA Clara Chatbot
 * 
 * Provides both simple dashboard interface and comprehensive analytics capabilities:
 * - Simple methods for admin dashboard (no parameters, mock data)
 * - Advanced methods for detailed analytics (with parameters, real data processing)
 */
export class AnalyticsService {
  private dynamoService: DynamoDBService | null = null;
  private dynamoClient: DynamoDBDocumentClient;
  private unansweredQuestionsTable: string;

  // Table names for simple dashboard interface
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ada-clara-conversations';
  private readonly QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
  private readonly UNANSWERED_QUESTIONS_TABLE = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';

  constructor(dynamoService?: DynamoDBService) {
    // Support both constructor patterns for backward compatibility
    if (dynamoService) {
      this.dynamoService = dynamoService;
    }
    
    // Lazy initialization to avoid circular dependency issues
    const client = new DynamoDBClient({});
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.unansweredQuestionsTable = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';
  }

  // ===== SIMPLE DASHBOARD INTERFACE =====
  // These methods provide the exact interface expected by the admin dashboard controller

  /**
   * Get dashboard metrics (real data implementation)
   * Uses multiple data sources: chat sessions, escalation requests, and analytics
   */
  async getMetrics(): Promise<DashboardMetrics> {
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      const endDate = today;
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`[AnalyticsService] Calculating metrics for date range: ${startDateStr} to ${endDateStr}`);

      // Get total conversations from chat sessions table
      // Chat sessions are stored with PK: SESSION#{sessionId}, SK: METADATA
      const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
      const allSessions = await this.getDynamoService().scanItems(CHAT_SESSIONS_TABLE, {
        filterExpression: 'begins_with(PK, :pk)',
        expressionAttributeValues: {
          ':pk': 'SESSION#'
        }
      });

      console.log(`[AnalyticsService] Total sessions scanned: ${allSessions.length}`);

      // Filter sessions by date range (last 30 days)
      // Include sessions where startTime is within the date range
      // Use >= for startDate and <= for endDate, but add 1 day to endDate to include today's sessions
      const endDateInclusive = new Date(endDate);
      endDateInclusive.setHours(23, 59, 59, 999); // Include the entire end date

      const recentSessions = allSessions.filter(session => {
        if (!session.startTime) {
          console.log(`[AnalyticsService] Session ${session.PK || session.sessionId} has no startTime`);
          return false;
        }
        const sessionDate = new Date(session.startTime);
        const isInRange = sessionDate >= startDate && sessionDate <= endDateInclusive;
        
        if (!isInRange) {
          console.log(`[AnalyticsService] Session ${session.PK || session.sessionId} excluded: startTime=${session.startTime}, sessionDate=${sessionDate.toISOString()}, startDate=${startDate.toISOString()}, endDate=${endDateInclusive.toISOString()}`);
        }
        
        return isInRange;
      });

      const totalConversations = recentSessions.length;
      console.log(`[AnalyticsService] Found ${totalConversations} conversations in date range (out of ${allSessions.length} total sessions)`);
      
      // Log sample session data for debugging
      if (allSessions.length > 0) {
        const sampleSession = allSessions[0];
        console.log(`[AnalyticsService] Sample session: PK=${sampleSession.PK}, sessionId=${sampleSession.sessionId}, startTime=${sampleSession.startTime}, lastActivity=${sampleSession.lastActivity}`);
      }

      // Get all escalations from the escalation requests table
      // There are two types:
      // 1. Form escalations: have `source` field (form_submit or talk_to_person)
      // 2. Chat escalations: have `reason` and `sessionId` fields, no `source` field
      const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
      const allEscalations = await this.getDynamoService().scanItems(ESCALATION_TABLE, {});
      
      console.log(`[AnalyticsService] Total escalations in table: ${allEscalations.length}`);
      
      // Create a set of session IDs from recent conversations for matching
      // Sessions are stored with PK: SESSION#{sessionId}, so extract sessionId from PK or use sessionId field
      const recentSessionIds = new Set(recentSessions.map(s => {
        // If PK exists and starts with SESSION#, extract sessionId from it
        if (s.PK && s.PK.startsWith('SESSION#')) {
          return s.PK.replace('SESSION#', '');
        }
        // Otherwise use sessionId field directly
        return s.sessionId;
      }).filter(Boolean));
      console.log(`[AnalyticsService] Recent session IDs: ${Array.from(recentSessionIds).length} sessions`);
      
      // Filter escalations by date range
      const recentEscalations = allEscalations.filter(esc => {
        if (!esc.timestamp) return false;
        const escDate = new Date(esc.timestamp);
        return escDate >= startDate && escDate <= endDateInclusive;
      });

      // For escalation rate: Count UNIQUE conversations that have at least one escalation
      // A conversation can have multiple escalations, but we only count it once
      const escalatedSessionIds = new Set<string>();
      recentEscalations.forEach(esc => {
        // Count chat escalations (have reason and sessionId, no source)
        if (esc.reason && esc.sessionId && !esc.source) {
          // Only count if sessionId matches a recent conversation
          const sessionId = esc.sessionId;
          if (recentSessionIds.has(sessionId)) {
            escalatedSessionIds.add(sessionId);
          }
        }
      });
      
      const escalatedConversationsCount = escalatedSessionIds.size;
      const escalationRate = totalConversations > 0 ? Math.round((escalatedConversationsCount / totalConversations) * 100) : 0;
      console.log(`[AnalyticsService] Found ${escalatedConversationsCount} escalated conversations out of ${totalConversations} total conversations, rate: ${escalationRate}%`);

      // Calculate out of scope rate from unanswered questions
      // When chatbot shows "Talk to a person" (escalated: true), question is stored as unanswered
      // Out-of-scope rate = total unanswered questions count / total conversations
      let totalUnansweredCount = 0;
      const metricsDate = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 1000);
          // Sum up unansweredCount for all questions on this date
          const dayUnansweredCount = dayQuestions.reduce((sum, q) => sum + (q.unansweredCount || 0), 0);
          totalUnansweredCount += dayUnansweredCount;
        } catch (error) {
          // Continue if no questions for this date
        }
      }
      
      const outOfScopeRate = totalConversations > 0 ? Math.round((totalUnansweredCount / totalConversations) * 100) : 0;
      console.log(`[AnalyticsService] Found ${totalUnansweredCount} unanswered questions out of ${totalConversations} total conversations, out-of-scope rate: ${outOfScopeRate}%`);

      // Calculate trends (compare with previous 30 days)
      const previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const previousSessions = allSessions.filter(session => {
        if (!session.startTime) return false;
        const sessionDate = new Date(session.startTime);
        return sessionDate >= previousStartDate && sessionDate < startDate;
      });

      const previousConversations = previousSessions.length;
      const previousSessionIds = new Set(previousSessions.map(s => {
        // If PK exists and starts with SESSION#, extract sessionId from it
        if (s.PK && s.PK.startsWith('SESSION#')) {
          return s.PK.replace('SESSION#', '');
        }
        // Otherwise use sessionId field directly
        return s.sessionId;
      }).filter(Boolean));

      // Count previous escalated conversations (unique sessions)
      const previousEscalatedSessionIds = new Set<string>();
      allEscalations.forEach(esc => {
        if (!esc.timestamp) return;
        const escDate = new Date(esc.timestamp);
        if (escDate < previousStartDate || escDate >= startDate) return;
        
        // Count chat escalations that match previous conversations
        if (esc.reason && esc.sessionId && !esc.source) {
          if (previousSessionIds.has(esc.sessionId)) {
            previousEscalatedSessionIds.add(esc.sessionId);
          }
        }
      });
      const previousEscalatedCount = previousEscalatedSessionIds.size;

      const conversationTrend = this.calculateTrend(totalConversations, previousConversations);
      const previousEscalationRate = previousConversations > 0 ? Math.round((previousEscalatedCount / previousConversations) * 100) : 0;
      const escalationTrend = this.calculateTrend(escalationRate, previousEscalationRate);
      
      // Count previous out-of-scope from unanswered questions
      let previousUnansweredCount = 0;
      const previousMetricsDate = new Date();
      for (let i = 30; i < 60; i++) {
        const date = new Date(previousMetricsDate);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 1000);
          const dayUnansweredCount = dayQuestions.reduce((sum, q) => sum + (q.unansweredCount || 0), 0);
          previousUnansweredCount += dayUnansweredCount;
        } catch (error) {
          // Continue if no questions for this date
        }
      }
      
      const previousOutOfScopeRate = previousConversations > 0 ? Math.round((previousUnansweredCount / previousConversations) * 100) : 0;
      const outOfScopeTrend = this.calculateTrend(outOfScopeRate, previousOutOfScopeRate);

      console.log(`[AnalyticsService] Metrics calculated: conversations=${totalConversations}, escalationRate=${escalationRate}%, outOfScopeRate=${outOfScopeRate}%`);

      return {
        totalConversations,
        escalationRate,
        outOfScopeRate,
        trends: {
          conversations: conversationTrend,
          escalations: escalationTrend,
          outOfScope: outOfScopeTrend
        }
      };
    } catch (error) {
      console.error('Error fetching real metrics:', error);
      // Fallback to basic metrics on error
      return {
        totalConversations: 0,
        escalationRate: 0,
        outOfScopeRate: 0,
        trends: {
          conversations: '0%',
          escalations: '0%',
          outOfScope: '0%'
        }
      };
    }
  }

  /**
   * Get conversations over time chart data (real data implementation)
   */
  async getConversationsChart(): Promise<ConversationChartData> {
    try {
      const today = new Date();
      const data = [];

      // Get real conversation data for the last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const displayDateStr = `${date.getMonth() + 1}/${date.getDate()}`;

        // Query real conversations for this date
        const dayConversations = await this.getDynamoService().getConversationsByDateRange(dateStr, dateStr);
        const conversations = dayConversations.length;

        data.push({
          date: displayDateStr,
          conversations
        });
      }

      return { data };
    } catch (error) {
      console.error('Error fetching real conversations chart:', error);
      return { data: [] };
    }
  }

  /**
   * Get language distribution data (real data implementation)
   */
  async getLanguageSplit(): Promise<LanguageSplit> {
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];

      // Get conversations by language
      const englishConversations = await this.getDynamoService().getConversationsByDateRange(startDateStr, endDateStr, 'en');
      const spanishConversations = await this.getDynamoService().getConversationsByDateRange(startDateStr, endDateStr, 'es');
      
      const totalConversations = englishConversations.length + spanishConversations.length;
      
      if (totalConversations === 0) {
        return { english: 100, spanish: 0 };
      }

      const englishPercentage = Math.round((englishConversations.length / totalConversations) * 100);
      const spanishPercentage = 100 - englishPercentage;

      return {
        english: englishPercentage,
        spanish: spanishPercentage
      };
    } catch (error) {
      console.error('Error fetching real language split:', error);
      return {
        english: 100,
        spanish: 0
      };
    }
  }

  /**
   * Get frequently asked questions (real data implementation)
   */
  async getFrequentlyAskedQuestions(): Promise<Question[]> {
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      
      // Get questions from the last 30 days
      const questions: Question[] = [];
      const questionCounts = new Map<string, number>();
      
      // Query questions by different categories to get a comprehensive list
      const categories = ['diabetes-general', 'type-1', 'type-2', 'medication', 'diet', 'exercise', 'complications'];
      
      for (const category of categories) {
        try {
          const categoryQuestions = await this.getDynamoService().getQuestionsByCategory(category, 50);
          
          for (const q of categoryQuestions) {
            const normalizedQuestion = q.originalQuestion.trim();
            const currentCount = questionCounts.get(normalizedQuestion) || 0;
            questionCounts.set(normalizedQuestion, currentCount + q.count);
          }
        } catch (error) {
          console.log(`No questions found for category: ${category}`);
        }
      }
      
      // Convert to array and sort by frequency
      const sortedQuestions = Array.from(questionCounts.entries())
        .map(([question, count]) => ({ question, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6); // Top 6 questions
      
      // If no real data, return fallback questions (top 6)
      if (sortedQuestions.length === 0) {
        return [
          { question: 'What is type 1 diabetes?', count: 0 },
          { question: 'How do I manage blood sugar?', count: 0 },
          { question: 'What foods should I avoid?', count: 0 },
          { question: 'How often should I check glucose?', count: 0 },
          { question: 'What are diabetes complications?', count: 0 },
          { question: 'How much insulin should I take?', count: 0 }
        ];
      }
      
      return sortedQuestions;
    } catch (error) {
      console.error('Error fetching real frequently asked questions:', error);
      return [];
    }
  }

  /**
   * Get top unanswered questions (real data implementation)
   */
  async getUnansweredQuestions(): Promise<Question[]> {
    try {
      const today = new Date();
      const questions: Question[] = [];
      
      // Get unanswered questions from the last 30 days
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 20);
          questions.push(...dayQuestions.map(q => ({
            question: q.originalQuestion,
            count: q.count
          })));
        } catch (error) {
          // Continue if no questions for this date
        }
      }
      
      // Aggregate by question text and sort by frequency
      const questionCounts = new Map<string, number>();
      
      for (const q of questions) {
        const normalizedQuestion = q.question.trim();
        const currentCount = questionCounts.get(normalizedQuestion) || 0;
        questionCounts.set(normalizedQuestion, currentCount + q.count);
      }
      
      const sortedQuestions = Array.from(questionCounts.entries())
        .map(([question, count]) => ({ question, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6); // Top 6 unanswered questions
      
      // If no real data, return fallback questions (top 6)
      if (sortedQuestions.length === 0) {
        return [
          { question: 'Can I take insulin with food?', count: 0 },
          { question: 'What happens if I miss my medication?', count: 0 },
          { question: 'How do I travel with diabetes supplies?', count: 0 },
          { question: 'Can diabetes affect my vision?', count: 0 },
          { question: 'What should I do during sick days?', count: 0 },
          { question: 'How do I handle low blood sugar at night?', count: 0 }
        ];
      }
      
      return sortedQuestions;
    } catch (error) {
      console.error('Error fetching real unanswered questions:', error);
      return [];
    }
  }

  /**
   * Get comprehensive dashboard data (simple interface)
   */
  async getDashboardData(): Promise<DashboardData> {
    try {
      const [metrics, conversationsChart, languageSplit, frequentlyAsked, unanswered] = await Promise.all([
        this.getMetrics(),
        this.getConversationsChart(),
        this.getLanguageSplit(),
        this.getFrequentlyAskedQuestions(),
        this.getUnansweredQuestions()
      ]);

      return {
        metrics,
        conversationsChart,
        languageSplit,
        frequentlyAskedQuestions: frequentlyAsked,
        unansweredQuestions: unanswered,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  }

  /**
   * Health check for analytics service (simple interface)
   */
  async healthCheck(): Promise<{ status: string; service: string; timestamp: string }> {
    try {
      // Test database connectivity
      if (this.dynamoService) {
        await this.dynamoService.healthCheck();
      }

      return {
        status: 'healthy',
        service: 'admin-analytics',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Analytics service health check failed:', error);
      return {
        status: 'unhealthy',
        service: 'admin-analytics',
        timestamp: new Date().toISOString()
      };
    }
  }

  // ===== ADVANCED ANALYTICS INTERFACE =====
  // These methods provide comprehensive analytics capabilities with parameters

  /**
   * Get real-time metrics (advanced interface)
   */
  async getRealTimeMetrics(): Promise<RealTimeMetrics> {
    console.log('⚡ Getting enhanced real-time metrics');

    try {
      const [
        conversationMetrics,
        userMetrics,
        escalationMetrics,
        performanceMetrics,
        alerts
      ] = await Promise.all([
        this.getLiveConversationMetrics(),
        this.getActiveUserMetrics(),
        this.getRealTimeEscalationMetrics(),
        this.getSystemPerformanceMetrics(),
        this.getActiveAlerts()
      ]);

      return {
        timestamp: new Date().toISOString(),
        activeConnections: conversationMetrics.active,
        messagesLastHour: conversationMetrics.total,
        escalationsToday: escalationMetrics.pending + escalationMetrics.inProgress + escalationMetrics.resolved,
        systemLoad: performanceMetrics.cpuUsage,
        responseTime: performanceMetrics.responseTime.p50,
        liveConversations: {
          active: conversationMetrics.active,
          total: conversationMetrics.total,
          byLanguage: conversationMetrics.languages,
          averageDuration: conversationMetrics.averageLength,
          newInLastMinute: Math.floor(conversationMetrics.active / 60)
        },
        activeUsers: {
          total: userMetrics.total,
          unique: userMetrics.unique,
          returning: userMetrics.returning,
          byRegion: { 'US': userMetrics.total }, // Would be enhanced with real region data
          peakConcurrent: userMetrics.peakConcurrent
        },
        realTimeEscalations: {
          pending: escalationMetrics.pending,
          inProgress: escalationMetrics.inProgress,
          resolved: escalationMetrics.resolved,
          averageWaitTime: escalationMetrics.averageResolutionTime,
          criticalCount: 0 // Would be calculated from priority field
        },
        escalations: {
          pending: escalationMetrics.pending,
          inProgress: escalationMetrics.inProgress,
          resolved: escalationMetrics.resolved,
          averageWaitTime: escalationMetrics.averageResolutionTime,
          criticalCount: 0
        },
        systemPerformance: {
          responseTime: performanceMetrics.responseTime,
          cpuUsage: performanceMetrics.cpuUsage,
          memoryUsage: performanceMetrics.memoryUsage,
          diskUsage: 45, // Would come from CloudWatch
          networkLatency: 12, // Would come from CloudWatch
          errorRate: performanceMetrics.errorRate,
          throughput: conversationMetrics.total,
          lambdaMetrics: {
            chatProcessor: {
              invocations: conversationMetrics.total,
              errors: Math.floor(conversationMetrics.total * performanceMetrics.errorRate),
              duration: performanceMetrics.responseTime.p50,
              throttles: 0
            },
            adminAnalytics: {
              invocations: 10, // Would come from CloudWatch
              errors: 0,
              duration: 200,
              throttles: 0
            },
            escalationProcessor: {
              invocations: escalationMetrics.pending + escalationMetrics.inProgress,
              errors: 0,
              duration: 150,
              throttles: 0
            }
          },
          dynamoDbMetrics: {
            readCapacityUtilization: 80, // Would come from CloudWatch
            writeCapacityUtilization: 60, // Would come from CloudWatch
            throttledRequests: 0,
            successfulRequests: conversationMetrics.total
          }
        },
        alerts: alerts
      };
    } catch (error) {
      console.error('❌ Error getting real-time metrics:', error);
      throw new Error(`Failed to get real-time metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper methods for real data analytics

  /**
   * Calculate trend percentage between current and previous values
   */
  private calculateTrend(current: number, previous: number): string {
    if (previous === 0) {
      return current > 0 ? '+100%' : '0%';
    }
    
    const change = ((current - previous) / previous) * 100;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${Math.round(change)}%`;
  }

  /**
   * Get live conversation metrics (real data implementation)
   */
  private async getLiveConversationMetrics(): Promise<any> {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Get today's conversations
      const todayConversations = await this.getDynamoService().getConversationsByDateRange(todayStr, todayStr);
      
      // Get active conversations (last 1 hour)
      const oneHourAgo = new Date(today.getTime() - 60 * 60 * 1000);
      const activeConversations = todayConversations.filter(c => 
        new Date(c.endTime || c.startTime) > oneHourAgo
      );
      
      // Calculate average conversation length
      const conversationLengths = todayConversations.map(c => c.messageCount || 1);
      const averageLength = conversationLengths.length > 0 
        ? Math.round(conversationLengths.reduce((a, b) => a + b, 0) / conversationLengths.length)
        : 0;
      
      // Calculate language distribution
      const englishCount = todayConversations.filter(c => c.language === 'en').length;
      const spanishCount = todayConversations.filter(c => c.language === 'es').length;
      const total = englishCount + spanishCount;
      
      return {
        active: activeConversations.length,
        total: todayConversations.length,
        averageLength,
        languages: {
          english: total > 0 ? Math.round((englishCount / total) * 100) : 100,
          spanish: total > 0 ? Math.round((spanishCount / total) * 100) : 0
        }
      };
    } catch (error) {
      console.error('Error getting live conversation metrics:', error);
      // Fallback to minimal data
      return {
        active: 0,
        total: 0,
        averageLength: 0,
        languages: { english: 100, spanish: 0 }
      };
    }
  }

  /**
   * Get active user metrics (real data implementation)
   */
  private async getActiveUserMetrics(): Promise<any> {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Get today's conversations to count unique users
      const todayConversations = await this.getDynamoService().getConversationsByDateRange(todayStr, todayStr);
      
      // Count unique users
      const uniqueUsers = new Set(todayConversations.map(c => c.userId)).size;
      
      // Count returning users (users who had conversations before today)
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const previousConversations = await this.getDynamoService().getConversationsByDateRange(yesterdayStr, yesterdayStr);
      const previousUsers = new Set(previousConversations.map(c => c.userId));
      
      const returningUsers = todayConversations.filter(c => previousUsers.has(c.userId)).length;
      
      return {
        total: todayConversations.length,
        unique: uniqueUsers,
        returning: returningUsers,
        peakConcurrent: Math.min(uniqueUsers, 50) // Estimate based on unique users
      };
    } catch (error) {
      console.error('Error getting active user metrics:', error);
      return {
        total: 0,
        unique: 0,
        returning: 0,
        peakConcurrent: 0
      };
    }
  }

  /**
   * Get real-time escalation metrics (real data implementation)
   */
  private async getRealTimeEscalationMetrics(): Promise<any> {
    try {
      // Get escalations by status
      const pendingEscalations = await this.getDynamoService().getEscalationsByStatus('pending');
      const inProgressEscalations = await this.getDynamoService().getEscalationsByStatus('in_progress');
      const completedEscalations = await this.getDynamoService().getEscalationsByStatus('completed');
      
      // Calculate average resolution time for completed escalations
      const completedToday = completedEscalations.filter(e => {
        const completedDate = new Date(e.completedAt || e.createdAt);
        const today = new Date();
        return completedDate.toDateString() === today.toDateString();
      });
      
      let averageResolutionTime = 0;
      if (completedToday.length > 0) {
        const resolutionTimes = completedToday.map(e => {
          const created = new Date(e.createdAt);
          const completed = new Date(e.completedAt || e.createdAt);
          return (completed.getTime() - created.getTime()) / (1000 * 60); // minutes
        });
        averageResolutionTime = Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length);
      }
      
      return {
        pending: pendingEscalations.length,
        inProgress: inProgressEscalations.length,
        resolved: completedToday.length,
        averageResolutionTime
      };
    } catch (error) {
      console.error('Error getting escalation metrics:', error);
      return {
        pending: 0,
        inProgress: 0,
        resolved: 0,
        averageResolutionTime: 0
      };
    }
  }

  /**
   * Get system performance metrics (real data implementation)
   */
  private async getSystemPerformanceMetrics(): Promise<any> {
    try {
      // Get recent messages to calculate response times
      const today = new Date();
      const startDate = new Date(today.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];
      
      const messages = await this.getDynamoService().getMessagesByDateRange(startDateStr, endDateStr, 'bot');
      
      // Calculate response time percentiles from processingTime field
      const responseTimes = messages
        .map(m => m.processingTime || 0)
        .filter(t => t > 0)
        .sort((a, b) => a - b);
      
      let p50 = 0, p95 = 0, p99 = 0;
      
      if (responseTimes.length > 0) {
        p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
        p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
        p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
      }
      
      // Calculate error rate from failed messages
      const failedMessages = messages.filter(m => 
        (m.confidenceScore !== undefined && m.confidenceScore < 0.3) || 
        m.escalationTrigger
      ).length;
      const errorRate = messages.length > 0 ? (failedMessages / messages.length) : 0;
      
      return {
        responseTime: { p50, p95, p99 },
        cpuUsage: 25, // Would come from CloudWatch in production
        memoryUsage: 35, // Would come from CloudWatch in production
        errorRate
      };
    } catch (error) {
      console.error('Error getting system performance metrics:', error);
      return {
        responseTime: { p50: 0, p95: 0, p99: 0 },
        cpuUsage: 0,
        memoryUsage: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Get active system alerts (real data implementation)
   */
  private async getActiveAlerts(): Promise<Array<any>> {
    try {
      const alerts = [];
      
      // Check for high escalation rate
      const metrics = await this.getMetrics();
      if (metrics.escalationRate > 25) {
        alerts.push({
          id: 'high-escalation-rate',
          severity: 'high' as const,
          message: `Escalation rate is ${metrics.escalationRate}% (threshold: 25%)`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check for low conversation volume
      if (metrics.totalConversations < 10) {
        alerts.push({
          id: 'low-conversation-volume',
          severity: 'medium' as const,
          message: `Low conversation volume: ${metrics.totalConversations} conversations`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check for high out-of-scope rate
      if (metrics.outOfScopeRate > 15) {
        alerts.push({
          id: 'high-out-of-scope-rate',
          severity: 'medium' as const,
          message: `High out-of-scope rate: ${metrics.outOfScopeRate}% (threshold: 15%)`,
          timestamp: new Date().toISOString()
        });
      }
      
      return alerts;
    } catch (error) {
      console.error('Error getting active alerts:', error);
      return [];
    }
  }

  private async getPeakConcurrentUsers(): Promise<number> {
    // This would typically come from real-time tracking
    // For now, estimate based on recent activity
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const conversations = await this.getDynamoService().getConversationsByDateRange(todayStr, todayStr);
      const uniqueUsers = new Set(conversations.map(c => c.userId)).size;
      return Math.min(uniqueUsers, 50);
    } catch (error) {
      return 0;
    }
  }

  // Add other advanced methods as needed...
  // (Include full implementation from comprehensive service for production use)

  /**
   * Get DynamoDB service instance (lazy initialization)
   */
  private getDynamoService(): DynamoDBService {
    if (!this.dynamoService) {
      this.dynamoService = new DynamoDBService();
    }
    return this.dynamoService;
  }
}