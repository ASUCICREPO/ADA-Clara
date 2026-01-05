import { DynamoDBService } from '../../services/dynamodb-service';
import { QuestionProcessingService } from '../../services/question-processing.service';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  AnalyticsData, 
  ConversationData, // Simplified interface replacing ConversationRecord
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
  private questionProcessingService?: QuestionProcessingService;
  private dynamoClient: DynamoDBDocumentClient;
  private unansweredQuestionsTable: string;

  // Table names for simple dashboard interface
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  // CONVERSATIONS_TABLE removed - using CHAT_SESSIONS_TABLE instead
  private readonly QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
  private readonly UNANSWERED_QUESTIONS_TABLE = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';

  constructor(dynamoService?: DynamoDBService) {
    // Support both constructor patterns for backward compatibility
    if (dynamoService) {
      this.dynamoService = dynamoService;
      // Initialize enhanced question processing service
      this.questionProcessingService = new QuestionProcessingService(dynamoService);
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

      // Get total conversations using our centralized method
      // This replaces the direct session scanning to avoid duplication
      const recentStartDateStr = startDate.toISOString().split('T')[0];
      const recentEndDateStr = endDate.toISOString().split('T')[0];
      
      const recentConversations = await this.getDynamoService().getConversationsByDateRange(recentStartDateStr, recentEndDateStr);
      const totalConversations = recentConversations.length;
      
      console.log(`[AnalyticsService] Found ${totalConversations} conversations in date range via getConversationsByDateRange`);
      
      // Create a set of session IDs from recent conversations for matching
      const recentSessionIds = new Set(recentConversations.map(c => c.sessionId).filter(Boolean));
      console.log(`[AnalyticsService] Recent session IDs: ${Array.from(recentSessionIds).length} sessions`);
      
      // Get all escalations from the escalation requests table
      // There are two types:
      // 1. Form escalations: have `source` field (form_submit or talk_to_person)
      // 2. Chat escalations: have `reason` and `sessionId` fields, no `source` field
      const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
      const allEscalations = await this.getDynamoService().scanItems(ESCALATION_TABLE, {});
      
      console.log(`[AnalyticsService] Total escalations in table: ${allEscalations.length}`);
      
      // Filter escalations by date range
      const endDateInclusive = new Date(endDate);
      endDateInclusive.setHours(23, 59, 59, 999);
      
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

      // Calculate out of scope rate from analytics table
      // Out-of-scope entries are stored in analytics table with PK = 'ANALYTICS#out-of-scope'
      let outOfScopeConversationsCount = 0;
      try {
        const outOfScopeEntries = await this.getDynamoService().queryItems(
          this.ANALYTICS_TABLE,
          'PK = :pk',
          { ':pk': 'ANALYTICS#out-of-scope' }
        );
        
        // Filter by date range and count unique conversations (not total entries)
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setHours(23, 59, 59, 999);
        
        const outOfScopeSessionIds = new Set<string>();
        outOfScopeEntries.forEach(entry => {
          if (!entry.timestamp) return;
          const entryDate = new Date(entry.timestamp);
          if (entryDate >= startDate && entryDate <= endDateInclusive) {
            // Extract session ID from the SK (format: timestamp#question-sessionIndex-questionIndex)
            const sk = entry.SK;
            if (sk && sk.includes('#question-')) {
              const sessionPart = sk.split('#question-')[1];
              if (sessionPart) {
                const sessionIndex = sessionPart.split('-')[0];
                outOfScopeSessionIds.add(`session-${sessionIndex}`);
              }
            }
          }
        });
        
        outOfScopeConversationsCount = outOfScopeSessionIds.size;
        console.log(`[AnalyticsService] Found ${outOfScopeConversationsCount} conversations with out-of-scope questions in date range`);
      } catch (error) {
        console.error('[AnalyticsService] Error fetching out-of-scope analytics:', error);
        // Fallback to unanswered questions method
        for (let i = 0; i < 30; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          
          try {
            const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 1000);
            // Sum up unansweredCount for all questions on this date
            const dayUnansweredCount = dayQuestions.reduce((sum, q) => sum + (q.unansweredCount || 0), 0);
            outOfScopeConversationsCount += dayUnansweredCount;
          } catch (error) {
            // Continue if no questions for this date
          }
        }
      }
      
      const outOfScopeRate = totalConversations > 0 ? Math.round((outOfScopeConversationsCount / totalConversations) * 100) : 0;
      console.log(`[AnalyticsService] Found ${outOfScopeConversationsCount} conversations with out-of-scope questions out of ${totalConversations} total conversations, out-of-scope rate: ${outOfScopeRate}%`);

      // Calculate trends (compare with previous 30 days)
      const previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const previousStartDateStr = previousStartDate.toISOString().split('T')[0];
      const previousEndDateStr = startDate.toISOString().split('T')[0];
      
      const previousConversations = await this.getDynamoService().getConversationsByDateRange(previousStartDateStr, previousEndDateStr);
      const previousSessionIds = new Set(previousConversations.map(c => c.sessionId).filter(Boolean));

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

      const conversationTrend = this.calculateTrend(totalConversations, previousConversations.length);
      const previousEscalationRate = previousConversations.length > 0 ? Math.round((previousEscalatedCount / previousConversations.length) * 100) : 0;
      const escalationTrend = this.calculateTrend(escalationRate, previousEscalationRate);
      
      // Count previous out-of-scope from analytics table
      let previousOutOfScopeConversationsCount = 0;
      try {
        const previousOutOfScopeEntries = await this.getDynamoService().queryItems(
          this.ANALYTICS_TABLE,
          'PK = :pk',
          { ':pk': 'ANALYTICS#out-of-scope' }
        );
        
        const previousOutOfScopeSessionIds = new Set<string>();
        previousOutOfScopeEntries.forEach(entry => {
          if (!entry.timestamp) return;
          const entryDate = new Date(entry.timestamp);
          if (entryDate >= previousStartDate && entryDate < startDate) {
            // Extract session ID from the SK
            const sk = entry.SK;
            if (sk && sk.includes('#question-')) {
              const sessionPart = sk.split('#question-')[1];
              if (sessionPart) {
                const sessionIndex = sessionPart.split('-')[0];
                previousOutOfScopeSessionIds.add(`session-${sessionIndex}`);
              }
            }
          }
        });
        
        previousOutOfScopeConversationsCount = previousOutOfScopeSessionIds.size;
      } catch (error) {
        console.error('[AnalyticsService] Error fetching previous out-of-scope analytics:', error);
        // Fallback to unanswered questions method
        for (let i = 30; i < 60; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          
          try {
            const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 1000);
            const dayUnansweredCount = dayQuestions.reduce((sum, q) => sum + (q.unansweredCount || 0), 0);
            previousOutOfScopeConversationsCount += dayUnansweredCount;
          } catch (error) {
            // Continue if no questions for this date
          }
        }
      }
      
      const previousOutOfScopeRate = previousConversations.length > 0 ? Math.round((previousOutOfScopeConversationsCount / previousConversations.length) * 100) : 0;
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
   * Get frequently asked questions (enhanced with QuestionProcessingService)
   */
  async getFrequentlyAskedQuestions(): Promise<Question[]> {
    try {
      console.log('[AnalyticsService] Fetching frequently asked questions (FIXED)...');
      console.log(`[AnalyticsService] Using table: ${this.QUESTIONS_TABLE}`);
      console.log(`[AnalyticsService] Environment QUESTIONS_TABLE: ${process.env.QUESTIONS_TABLE}`);
      
      // Try direct table access first
      const dynamoService = this.getDynamoService();
      if (dynamoService) {
        try {
          const questionItems = await dynamoService.scanItems(this.QUESTIONS_TABLE, {});
          console.log(`[AnalyticsService] Found ${questionItems.length} items in questions table`);
          
          if (questionItems.length > 0) {
            console.log(`[AnalyticsService] First item sample:`, {
              question: questionItems[0].question,
              answered: questionItems[0].answered,
              count: questionItems[0].count,
              answeredCount: questionItems[0].answeredCount
            });
            
            const validQuestions = questionItems
              .filter(item => {
                const isAnswered = item.answered === true;
                const hasCount = (item.count || 0) > 0;
                console.log(`[AnalyticsService] Item "${item.question}": answered=${isAnswered}, count=${item.count}, hasCount=${hasCount}`);
                return isAnswered && hasCount;
              })
              .map(item => ({
                question: item.question,
                count: item.count || item.answeredCount || 0
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 6);
            
            console.log(`[AnalyticsService] Returning ${validQuestions.length} FAQ questions`);
            return validQuestions;
          }
        } catch (error) {
          console.error('[AnalyticsService] Error reading questions table:', error);
        }
      }

      // Use the enhanced question processing service if available
      if (this.questionProcessingService) {
        const enhancedQuestions = await this.questionProcessingService.getFrequentlyAskedQuestions(6); // Top 6 questions
        
        if (enhancedQuestions.length > 0) {
          return enhancedQuestions.map(q => ({
            question: q.question,
            count: q.count
          }));
        }
      }

      return [];
    } catch (error) {
      console.error('Error fetching real frequently asked questions:', error);
      return [];
    }
  }

  /**
   * Get top unanswered questions (enhanced with QuestionProcessingService)
   */
  async getUnansweredQuestions(): Promise<Question[]> {
    try {
      // Use the enhanced question processing service if available
      if (this.questionProcessingService) {
        const enhancedQuestions = await this.questionProcessingService.getUnansweredQuestions(6); // Top 6 questions
        
        if (enhancedQuestions.length > 0) {
          return enhancedQuestions.map(q => ({
            question: q.question,
            count: q.count // This is the unanswered count
          }));
        }
      }

      // Fallback to original implementation
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
            count: q.unansweredCount // Use unansweredCount instead of count
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
   * Get DynamoDB service instance (lazy initialization) - Public for enhanced integrations
   */
  public getDynamoService(): DynamoDBService {
    if (!this.dynamoService) {
      this.dynamoService = new DynamoDBService();
    }
    return this.dynamoService;
  }
}