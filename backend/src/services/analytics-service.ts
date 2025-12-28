import { DynamoDBService } from './dynamodb-service';
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
} from '../types/index';

/**
 * Enhanced Analytics Service for ADA Clara Chatbot
 * Handles analytics aggregation, reporting, business intelligence, and conversation tracking
 */
export class AnalyticsService {
  private dynamoService: DynamoDBService | null = null;
  private dynamoClient: DynamoDBDocumentClient;
  private unansweredQuestionsTable: string;

  constructor() {
    // Lazy initialization to avoid circular dependency issues
    const client = new DynamoDBClient({});
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.unansweredQuestionsTable = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';
  }

  private getDynamoService(): DynamoDBService {
    if (!this.dynamoService) {
      this.dynamoService = new DynamoDBService();
    }
    return this.dynamoService;
  }

  /**
   * Aggregate analytics data for a specific time period
   */
  async aggregateAnalytics(
    startDate: string,
    endDate: string,
    granularity: 'hourly' | 'daily' | 'weekly' = 'daily'
  ): Promise<{
    chatAnalytics: any;
    escalationAnalytics: any;
    performanceAnalytics: any;
    userAnalytics: any;
  }> {
    console.log(`📊 Aggregating analytics from ${startDate} to ${endDate} (${granularity})`);

    const [chatAnalytics, escalationAnalytics, performanceAnalytics, userAnalytics] = await Promise.all([
      this.aggregateChatAnalytics(startDate, endDate, granularity),
      this.aggregateEscalationAnalytics(startDate, endDate, granularity),
      this.aggregatePerformanceAnalytics(startDate, endDate, granularity),
      this.aggregateUserAnalytics(startDate, endDate, granularity)
    ]);

    return {
      chatAnalytics,
      escalationAnalytics,
      performanceAnalytics,
      userAnalytics
    };
  }

  /**
   * Aggregate chat-related analytics
   */
  private async aggregateChatAnalytics(startDate: string, endDate: string, granularity: string): Promise<{
    totalMessages: number;
    totalSessions: number;
    averageMessagesPerSession: number;
    languageDistribution: Record<string, number>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
    responseTimeStats: { avg: number; p50: number; p95: number };
  }> {
    const chatData = await this.getAnalyticsDataByType('chat', startDate, endDate);
    
    let totalMessages = 0;
    let totalSessions = 0;
    let responseTimes: number[] = [];
    const languageDistribution: Record<string, number> = { en: 0, es: 0 };
    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

    for (const data of chatData) {
      if (data.metric === 'message_processed') {
        totalMessages += data.value;
        
        // Extract language from metadata
        if (data.metadata?.language) {
          languageDistribution[data.metadata.language] = 
            (languageDistribution[data.metadata.language] || 0) + data.value;
        }
        
        // Add to hourly distribution
        hourlyDistribution[data.hour].count += data.value;
      }
      
      if (data.metric === 'session_created') {
        totalSessions += data.value;
      }
      
      if (data.metric === 'response_time' && data.metadata?.responseTime) {
        responseTimes.push(data.metadata.responseTime);
      }
    }

    // Calculate response time statistics
    responseTimes.sort((a, b) => a - b);
    const responseTimeStats = {
      avg: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      p50: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.5)] : 0,
      p95: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0
    };

    return {
      totalMessages,
      totalSessions,
      averageMessagesPerSession: totalSessions > 0 ? totalMessages / totalSessions : 0,
      languageDistribution,
      hourlyDistribution,
      responseTimeStats
    };
  }

  /**
   * Aggregate escalation-related analytics
   */
  private async aggregateEscalationAnalytics(startDate: string, endDate: string, granularity: string): Promise<{
    totalEscalations: number;
    escalationRate: number;
    byPriority: Record<string, number>;
    byReason: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number }>;
    averageResolutionTime: number;
  }> {
    const escalationData = await this.getAnalyticsDataByType('escalation', startDate, endDate);
    const chatData = await this.getAnalyticsDataByType('chat', startDate, endDate);
    
    let totalEscalations = 0;
    let totalSessions = 0;
    const byPriority: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    const byReason: Record<string, number> = {};
    const dailyTrends: Record<string, number> = {};
    const resolutionTimes: number[] = [];

    // Process escalation data
    for (const data of escalationData) {
      if (data.metric === 'created') {
        totalEscalations += data.value;
        
        // Track by priority
        if (data.metadata?.priority) {
          byPriority[data.metadata.priority] = (byPriority[data.metadata.priority] || 0) + data.value;
        }
        
        // Track by reason
        if (data.metadata?.reason) {
          byReason[data.metadata.reason] = (byReason[data.metadata.reason] || 0) + data.value;
        }
        
        // Track daily trends
        dailyTrends[data.date] = (dailyTrends[data.date] || 0) + data.value;
      }
      
      if (data.metric === 'resolved' && data.metadata?.resolutionTime) {
        resolutionTimes.push(data.metadata.resolutionTime);
      }
    }

    // Get total sessions for escalation rate calculation
    for (const data of chatData) {
      if (data.metric === 'session_created') {
        totalSessions += data.value;
      }
    }

    // Convert daily trends to array
    const dailyTrendsArray = Object.entries(dailyTrends).map(([date, count]) => ({ date, count }));

    return {
      totalEscalations,
      escalationRate: totalSessions > 0 ? (totalEscalations / totalSessions) * 100 : 0,
      byPriority,
      byReason,
      dailyTrends: dailyTrendsArray,
      averageResolutionTime: resolutionTimes.length > 0 ? 
        resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length : 0
    };
  }

  /**
   * Aggregate performance-related analytics
   */
  private async aggregatePerformanceAnalytics(startDate: string, endDate: string, granularity: string): Promise<{
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    lambdaMetrics: Record<string, { invocations: number; errors: number; avgDuration: number }>;
  }> {
    const performanceData = await this.getAnalyticsDataByType('performance', startDate, endDate);
    
    const responseTimes: number[] = [];
    let totalRequests = 0;
    let totalErrors = 0;
    const lambdaMetrics: Record<string, { invocations: number; errors: number; durations: number[] }> = {};

    for (const data of performanceData) {
      if (data.metric === 'response_time') {
        responseTimes.push(data.value);
      }
      
      if (data.metric === 'request_count') {
        totalRequests += data.value;
      }
      
      if (data.metric === 'error_count') {
        totalErrors += data.value;
      }
      
      if (data.metric === 'lambda_invocation' && data.metadata?.functionName) {
        const funcName = data.metadata.functionName;
        if (!lambdaMetrics[funcName]) {
          lambdaMetrics[funcName] = { invocations: 0, errors: 0, durations: [] };
        }
        
        lambdaMetrics[funcName].invocations += data.value;
        
        if (data.metadata.error) {
          lambdaMetrics[funcName].errors += 1;
        }
        
        if (data.metadata.duration) {
          lambdaMetrics[funcName].durations.push(data.metadata.duration);
        }
      }
    }

    // Process lambda metrics
    const processedLambdaMetrics: Record<string, { invocations: number; errors: number; avgDuration: number }> = {};
    for (const [funcName, metrics] of Object.entries(lambdaMetrics)) {
      processedLambdaMetrics[funcName] = {
        invocations: metrics.invocations,
        errors: metrics.errors,
        avgDuration: metrics.durations.length > 0 ? 
          metrics.durations.reduce((a, b) => a + b, 0) / metrics.durations.length : 0
      };
    }

    return {
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      throughput: totalRequests,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      lambdaMetrics: processedLambdaMetrics
    };
  }

  /**
   * Aggregate user-related analytics
   */
  private async aggregateUserAnalytics(startDate: string, endDate: string, granularity: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
    userRetentionRate: number;
  }> {
    const userData = await this.getAnalyticsDataByType('user', startDate, endDate);
    
    let totalUsers = 0;
    let activeUsers = 0;
    let newUsers = 0;
    let returningUsers = 0;

    for (const data of userData) {
      if (data.metric === 'total_users') {
        totalUsers = Math.max(totalUsers, data.value);
      }
      
      if (data.metric === 'active_users') {
        activeUsers += data.value;
      }
      
      if (data.metric === 'new_users') {
        newUsers += data.value;
      }
      
      if (data.metric === 'returning_users') {
        returningUsers += data.value;
      }
    }

    const userRetentionRate = totalUsers > 0 ? (returningUsers / totalUsers) * 100 : 0;

    return {
      totalUsers,
      activeUsers,
      newUsers,
      returningUsers,
      userRetentionRate
    };
  }

  /**
   * Get analytics data by type for a date range
   */
  private async getAnalyticsDataByType(type: string, startDate: string, endDate: string): Promise<AnalyticsData[]> {
    const allData: AnalyticsData[] = [];
    
    // Iterate through each date in the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      
      try {
        const dayData = await this.getDynamoService().getAnalytics(dateStr, type);
        allData.push(...dayData);
      } catch (error) {
        console.warn(`Failed to get analytics for ${dateStr}:`, error);
      }
    }
    
    return allData;
  }

  /**
   * Generate real-time metrics snapshot
   */
  async generateRealTimeSnapshot(): Promise<{
    timestamp: string;
    activeConnections: number;
    messagesLastHour: number;
    escalationsToday: number;
    systemLoad: number;
    responseTime: number;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get recent analytics data
    const [hourlyData, dailyData] = await Promise.all([
      this.getAnalyticsDataByType('chat', oneHourAgo.toISOString().split('T')[0], now.toISOString().split('T')[0]),
      this.getAnalyticsDataByType('escalation', todayStart.toISOString().split('T')[0], now.toISOString().split('T')[0])
    ]);

    // Calculate metrics
    let messagesLastHour = 0;
    let escalationsToday = 0;
    let responseTimes: number[] = [];

    // Process hourly chat data
    for (const data of hourlyData) {
      if (data.metric === 'message_processed' && data.hour >= oneHourAgo.getHours()) {
        messagesLastHour += data.value;
      }
      
      if (data.metric === 'response_time') {
        responseTimes.push(data.value);
      }
    }

    // Process daily escalation data
    for (const data of dailyData) {
      if (data.metric === 'created') {
        escalationsToday += data.value;
      }
    }

    // Calculate average response time
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    // Simulate active connections and system load (would come from real monitoring)
    const activeConnections = Math.floor(Math.random() * 25) + 5;
    const systemLoad = Math.random() * 0.3 + 0.1;

    return {
      timestamp: now.toISOString(),
      activeConnections,
      messagesLastHour,
      escalationsToday,
      systemLoad,
      responseTime: avgResponseTime
    };
  }

  /**
   * Health check for analytics service
   */
  async healthCheck(): Promise<{
    analyticsDataAvailable: boolean;
    aggregationWorking: boolean;
    overall: boolean;
  }> {
    try {
      // Test basic analytics data retrieval
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const testData = await this.getAnalyticsDataByType('chat', yesterdayStr, yesterdayStr);
      const analyticsDataAvailable = true; // If we get here, it worked
      
      // Test aggregation
      const testAggregation = await this.aggregateAnalytics(yesterdayStr, yesterdayStr);
      const aggregationWorking = !!testAggregation;
      
      return {
        analyticsDataAvailable,
        aggregationWorking,
        overall: analyticsDataAvailable && aggregationWorking
      };
    } catch (error) {
      console.error('Analytics service health check failed:', error);
      return {
        analyticsDataAvailable: false,
        aggregationWorking: false,
        overall: false
      };
    }
  }

  // ===== ENHANCED CONVERSATION ANALYTICS =====

  /**
   * Get comprehensive conversation analytics for the admin dashboard
   */
  async getConversationAnalytics(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
  }): Promise<ConversationAnalytics> {
    console.log(`📊 Getting conversation analytics from ${params.startDate} to ${params.endDate}`);

    try {
      const analyticsData = await this.getDynamoService().getConversationAnalyticsByDateRange(
        params.startDate,
        params.endDate,
        params.language
      );

      return {
        totalConversations: analyticsData.totalConversations,
        conversationsByDate: analyticsData.conversationsByDate,
        languageDistribution: analyticsData.languageDistribution,
        unansweredPercentage: analyticsData.unansweredPercentage,
        averageConfidenceScore: analyticsData.averageConfidenceScore
      };
    } catch (error) {
      console.error('Failed to get conversation analytics:', error);
      throw new Error(`Failed to retrieve conversation analytics: ${(error as Error).message}`);
    }
  }

  /**
   * Get detailed conversation information including message history
   */
  async getConversationDetails(conversationId: string): Promise<ConversationDetails | null> {
    console.log(`🔍 Getting conversation details for: ${conversationId}`);

    try {
      // Get conversation record - we need to find it by conversationId
      // Since we don't have the timestamp, we'll need to scan or use a different approach
      const messages = await this.getDynamoService().getMessagesByConversation(conversationId);
      
      if (messages.length === 0) {
        return null;
      }

      // Calculate conversation metadata from messages
      const userMessages = messages.filter(m => m.type === 'user');
      const botMessages = messages.filter(m => m.type === 'bot');
      
      const startTime = messages[0].timestamp;
      const endTime = messages[messages.length - 1].timestamp;
      
      // Calculate average confidence score
      const confidenceScores = botMessages
        .filter(m => m.confidenceScore !== undefined)
        .map(m => m.confidenceScore!);
      const averageConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
        : 0;

      // Determine outcome
      const hasEscalation = messages.some(m => m.escalationTrigger);
      const outcome = hasEscalation ? 'escalated' : 
                     averageConfidence < 0.7 ? 'abandoned' : 'resolved';

      // Find escalation reason if any
      const escalationMessage = messages.find(m => m.escalationTrigger);
      const escalationReason = escalationMessage ? 'Low confidence response triggered escalation' : undefined;

      return {
        conversationId,
        userId: messages[0].conversationId, // Using conversationId as userId for now
        startTime,
        endTime,
        language: messages[0].language || 'en',
        messageCount: messages.length,
        messages: messages.map(m => ({
          timestamp: m.timestamp,
          type: m.type,
          content: m.content,
          confidenceScore: m.confidenceScore,
          escalationTrigger: m.escalationTrigger
        })),
        outcome,
        escalationReason
      };
    } catch (error) {
      console.error('Failed to get conversation details:', error);
      throw new Error(`Failed to retrieve conversation details: ${(error as Error).message}`);
    }
  }

  /**
   * Get frequently asked questions analysis
   */
  async getFrequentlyAskedQuestions(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
    limit?: number;
  }): Promise<FAQAnalysis> {
    console.log(`❓ Getting FAQ analysis from ${params.startDate} to ${params.endDate}`);

    try {
      const questions: QuestionRecord[] = [];
      
      // Get questions for each date in the range
      const start = new Date(params.startDate);
      const end = new Date(params.endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          // Get questions by language if specified
          if (params.language) {
            const languageQuestions = await this.getDynamoService().getQuestionsByLanguage(params.language, 100);
            questions.push(...languageQuestions.filter(q => q.date === dateStr));
          } else {
            // Get all questions for this date - we'll need to implement a method for this
            // For now, get questions by common categories
            const categories = ['diabetes', 'health', 'medication', 'diet', 'exercise', 'general'];
            for (const category of categories) {
              const categoryQuestions = await this.getDynamoService().getQuestionsByCategory(category, 20);
              questions.push(...categoryQuestions.filter(q => q.date === dateStr));
            }
          }
        } catch (error) {
          console.warn(`Failed to get questions for ${dateStr}:`, error);
        }
      }

      // Aggregate questions by normalized question text
      const questionMap = new Map<string, {
        question: string;
        count: number;
        category: string;
        totalConfidence: number;
        occurrences: number;
      }>();

      questions.forEach(q => {
        const key = q.normalizedQuestion;
        if (questionMap.has(key)) {
          const existing = questionMap.get(key)!;
          existing.count += q.count;
          existing.totalConfidence += q.totalConfidenceScore;
          existing.occurrences += 1;
        } else {
          questionMap.set(key, {
            question: q.originalQuestion,
            count: q.count,
            category: q.category,
            totalConfidence: q.totalConfidenceScore,
            occurrences: 1
          });
        }
      });

      // Convert to sorted array
      const topQuestions = Array.from(questionMap.values())
        .map(q => ({
          question: q.question,
          count: q.count,
          category: q.category,
          averageConfidence: q.totalConfidence / q.occurrences
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, params.limit || 10);

      // Calculate questions by category
      const questionsByCategory: Record<string, number> = {};
      topQuestions.forEach(q => {
        questionsByCategory[q.category] = (questionsByCategory[q.category] || 0) + q.count;
      });

      return {
        topQuestions,
        questionsByCategory,
        totalQuestionsAnalyzed: questions.reduce((sum, q) => sum + q.count, 0)
      };
    } catch (error) {
      console.error('Failed to get FAQ analysis:', error);
      throw new Error(`Failed to retrieve FAQ analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Get unanswered questions analysis
   */
  async getUnansweredQuestions(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
    limit?: number;
  }): Promise<UnansweredAnalysis> {
    console.log(`❌ Getting unanswered questions analysis from ${params.startDate} to ${params.endDate}`);

    try {
      const unansweredQuestions: QuestionRecord[] = [];
      
      // Get unanswered questions for each date in the range
      const start = new Date(params.startDate);
      const end = new Date(params.endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          const dayQuestions = await this.getDynamoService().getUnansweredQuestionsByDate(dateStr, 50);
          unansweredQuestions.push(...dayQuestions);
        } catch (error) {
          console.warn(`Failed to get unanswered questions for ${dateStr}:`, error);
        }
      }

      // Filter by language if specified
      const filteredQuestions = params.language 
        ? unansweredQuestions.filter(q => q.language === params.language)
        : unansweredQuestions;

      // Aggregate by normalized question
      const questionMap = new Map<string, {
        question: string;
        count: number;
        category: string;
        totalConfidence: number;
        escalationCount: number;
        totalQuestions: number;
      }>();

      filteredQuestions.forEach(q => {
        const key = q.normalizedQuestion;
        if (questionMap.has(key)) {
          const existing = questionMap.get(key)!;
          existing.count += q.unansweredCount;
          existing.totalConfidence += q.totalConfidenceScore;
          existing.escalationCount += q.escalationCount;
          existing.totalQuestions += q.count;
        } else {
          questionMap.set(key, {
            question: q.originalQuestion,
            count: q.unansweredCount,
            category: q.category,
            totalConfidence: q.totalConfidenceScore,
            escalationCount: q.escalationCount,
            totalQuestions: q.count
          });
        }
      });

      // Convert to sorted array
      const topUnansweredQuestions = Array.from(questionMap.values())
        .map(q => ({
          question: q.question,
          count: q.count,
          category: q.category,
          averageConfidence: q.totalQuestions > 0 ? q.totalConfidence / q.totalQuestions : 0,
          escalationRate: q.totalQuestions > 0 ? (q.escalationCount / q.totalQuestions) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, params.limit || 10);

      // Calculate knowledge gaps by category
      const categoryStats = new Map<string, { unanswered: number; total: number }>();
      
      filteredQuestions.forEach(q => {
        if (categoryStats.has(q.category)) {
          const stats = categoryStats.get(q.category)!;
          stats.unanswered += q.unansweredCount;
          stats.total += q.count;
        } else {
          categoryStats.set(q.category, {
            unanswered: q.unansweredCount,
            total: q.count
          });
        }
      });

      const knowledgeGaps = Array.from(categoryStats.entries())
        .map(([category, stats]) => ({
          category,
          unansweredCount: stats.unanswered,
          totalCount: stats.total,
          gapPercentage: stats.total > 0 ? (stats.unanswered / stats.total) * 100 : 0
        }))
        .sort((a, b) => b.gapPercentage - a.gapPercentage);

      // Identify improvement opportunities
      const improvementOpportunities = knowledgeGaps
        .filter(gap => gap.gapPercentage > 20) // Focus on categories with >20% unanswered
        .map(gap => ({
          topic: gap.category,
          priority: gap.gapPercentage > 50 ? 'high' as const : 
                   gap.gapPercentage > 35 ? 'medium' as const : 'low' as const,
          impact: gap.unansweredCount,
          urgency: gap.gapPercentage > 40 ? 0.8 : 0.5,
          effort: gap.gapPercentage > 60 ? 'high' as const : 'medium' as const,
          roi: (gap.gapPercentage / 100) * 0.8 // Simple ROI calculation
        }))
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 5);

      return {
        topUnansweredQuestions,
        knowledgeGaps,
        improvementOpportunities,
        trendAnalysis: {
          totalUnansweredTrend: 'stable' as const,
          weeklyChangePercentage: 0,
          problematicCategories: knowledgeGaps.slice(0, 5).map(gap => ({
            category: gap.category,
            severity: gap.gapPercentage > 60 ? 'critical' as const : 
                     gap.gapPercentage > 40 ? 'high' as const : 
                     gap.gapPercentage > 20 ? 'medium' as const : 'low' as const,
            weeklyIncrease: 0
          }))
        }
      };
    } catch (error) {
      console.error('Failed to get unanswered questions analysis:', error);
      throw new Error(`Failed to retrieve unanswered questions analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Get enhanced dashboard metrics combining all analytics
   */
  async getEnhancedDashboardMetrics(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
  }): Promise<EnhancedDashboardData> {
    console.log(`📈 Getting enhanced dashboard metrics from ${params.startDate} to ${params.endDate}`);

    try {
      const [
        conversationAnalytics,
        faqAnalysis,
        unansweredAnalysis,
        realTimeMetrics
      ] = await Promise.all([
        this.getConversationAnalytics(params),
        this.getFrequentlyAskedQuestions({ ...params, limit: 10 }),
        this.getUnansweredQuestions({ ...params, limit: 10 }),
        this.getRealTimeMetrics()
      ]);

      return {
        conversationAnalytics,
        questionAnalytics: faqAnalysis,
        escalationAnalytics: unansweredAnalysis,
        realTimeMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get enhanced dashboard metrics:', error);
      throw new Error(`Failed to retrieve enhanced dashboard metrics: ${(error as Error).message}`);
    }
  }

  /**
   * Get enhanced real-time metrics for live dashboard updates (Task 7)
   * Requirements: 6.1, 6.3, 6.4, 6.5
   */
  async getRealTimeMetrics(): Promise<RealTimeMetrics> {
    console.log('⚡ Getting enhanced real-time metrics');

    try {
      const now = new Date();
      
      // Get all real-time data in parallel for better performance
      const [
        liveConversations,
        activeUsers,
        realTimeEscalations,
        systemPerformance,
        alerts
      ] = await Promise.all([
        this.getLiveConversationMetrics(),
        this.getActiveUserMetrics(),
        this.getRealTimeEscalationMetrics(),
        this.getSystemPerformanceMetrics(),
        this.getActiveAlerts()
      ]);

      // Legacy metrics for backward compatibility
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [hourlyData, dailyData] = await Promise.all([
        this.getAnalyticsDataByType('chat', oneHourAgo.toISOString().split('T')[0], now.toISOString().split('T')[0]),
        this.getAnalyticsDataByType('escalation', todayStart.toISOString().split('T')[0], now.toISOString().split('T')[0])
      ]);

      let messagesLastHour = 0;
      let escalationsToday = 0;
      let responseTimes: number[] = [];

      // Process legacy data
      for (const data of hourlyData) {
        if (data.metric === 'message_processed' && data.hour >= oneHourAgo.getHours()) {
          messagesLastHour += data.value;
        }
        if (data.metric === 'response_time') {
          responseTimes.push(data.value);
        }
      }

      for (const data of dailyData) {
        if (data.metric === 'created') {
          escalationsToday += data.value;
        }
      }

      const avgResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

      return {
        timestamp: now.toISOString(),
        activeConnections: liveConversations.total,
        messagesLastHour,
        escalationsToday,
        systemLoad: systemPerformance.cpuUsage,
        responseTime: avgResponseTime,
        // Enhanced real-time metrics
        liveConversations,
        activeUsers,
        realTimeEscalations,
        escalations: realTimeEscalations, // Renamed for consistency with test expectations
        systemPerformance,
        alerts
      };
    } catch (error) {
      console.error('Failed to get enhanced real-time metrics:', error);
      throw new Error(`Failed to retrieve enhanced real-time metrics: ${(error as Error).message}`);
    }
  }

  /**
   * Get live conversation metrics (Requirement 6.1)
   * Tracks active conversations, languages, and conversation flow
   */
  private async getLiveConversationMetrics(): Promise<{
    active: number;
    total: number;
    byLanguage: Record<string, number>;
    averageDuration: number;
    newInLastMinute: number;
  }> {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Query active conversations (conversations with activity in last 5 minutes)
      const activeConversations = await this.getActiveConversations(fiveMinutesAgo);
      
      // Query new conversations in the last minute
      const newConversations = await this.getNewConversations(oneMinuteAgo, now);

      // Group by language
      const byLanguage: Record<string, number> = {};
      let totalDuration = 0;
      let conversationCount = 0;

      for (const conversation of activeConversations) {
        const language = conversation.language || 'en';
        byLanguage[language] = (byLanguage[language] || 0) + 1;
        
        if (conversation.startTime) {
          const duration = now.getTime() - new Date(conversation.startTime).getTime();
          totalDuration += duration;
          conversationCount++;
        }
      }

      const averageDuration = conversationCount > 0 ? totalDuration / conversationCount : 0;

      return {
        active: activeConversations.length,
        total: activeConversations.length,
        byLanguage,
        averageDuration: Math.round(averageDuration / 1000), // Convert to seconds
        newInLastMinute: newConversations.length
      };
    } catch (error) {
      console.error('Error getting live conversation metrics:', error);
      // Return default values if data unavailable
      return {
        active: 0,
        total: 0,
        byLanguage: { en: 0, es: 0 },
        averageDuration: 0,
        newInLastMinute: 0
      };
    }
  }

  /**
   * Get active user metrics (Requirement 6.3)
   * Tracks unique users, returning users, and geographic distribution
   */
  private async getActiveUserMetrics(): Promise<{
    total: number;
    unique: number;
    returning: number;
    byRegion: Record<string, number>;
    peakConcurrent: number;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get active users in the last hour
      const activeUsers = await this.getActiveUsers(oneHourAgo, now);
      
      // Get historical users to identify returning vs new
      const historicalUsers = await this.getHistoricalUsers(oneDayAgo, oneHourAgo);
      
      // Calculate metrics
      const uniqueUsers = new Set(activeUsers.map(u => u.userId));
      const returningUsers = activeUsers.filter(u => 
        historicalUsers.some(h => h.userId === u.userId)
      );

      // Group by region (simplified - would use IP geolocation in real implementation)
      const byRegion: Record<string, number> = {};
      for (const user of activeUsers) {
        const region = user.region || 'unknown';
        byRegion[region] = (byRegion[region] || 0) + 1;
      }

      // Get peak concurrent users (would come from real-time tracking)
      const peakConcurrent = await this.getPeakConcurrentUsers();

      return {
        total: activeUsers.length,
        unique: uniqueUsers.size,
        returning: returningUsers.length,
        byRegion,
        peakConcurrent
      };
    } catch (error) {
      console.error('Error getting active user metrics:', error);
      return {
        total: 0,
        unique: 0,
        returning: 0,
        byRegion: { 'us-east-1': 0, 'us-west-2': 0 },
        peakConcurrent: 0
      };
    }
  }

  /**
   * Get real-time escalation metrics (Requirement 6.4)
   * Tracks escalation queue status and processing times
   */
  private async getRealTimeEscalationMetrics(): Promise<{
    pending: number;
    inProgress: number;
    resolved: number;
    averageWaitTime: number;
    criticalCount: number;
  }> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get current escalation queue status
      const escalations = await this.getCurrentEscalations();
      
      // Calculate status counts
      const pending = escalations.filter(e => e.status === 'pending').length;
      const inProgress = escalations.filter(e => e.status === 'in_progress').length;
      const resolved = escalations.filter(e => 
        e.status === 'resolved' && 
        new Date(e.resolvedAt || 0) >= todayStart
      ).length;
      const criticalCount = escalations.filter(e => e.priority === 'critical').length;

      // Calculate average wait time for pending escalations
      let totalWaitTime = 0;
      let waitingCount = 0;
      
      for (const escalation of escalations) {
        if (escalation.status === 'pending' && escalation.createdAt) {
          const waitTime = now.getTime() - new Date(escalation.createdAt).getTime();
          totalWaitTime += waitTime;
          waitingCount++;
        }
      }

      const averageWaitTime = waitingCount > 0 ? totalWaitTime / waitingCount : 0;

      return {
        pending,
        inProgress,
        resolved,
        averageWaitTime: Math.round(averageWaitTime / 1000), // Convert to seconds
        criticalCount
      };
    } catch (error) {
      console.error('Error getting real-time escalation metrics:', error);
      return {
        pending: 0,
        inProgress: 0,
        resolved: 0,
        averageWaitTime: 0,
        criticalCount: 0
      };
    }
  }

  /**
   * Get system performance metrics (Requirement 6.5)
   * Tracks Lambda, DynamoDB, and overall system health
   */
  private async getSystemPerformanceMetrics(): Promise<{
    responseTime: { p50: number; p95: number; p99: number };
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: number;
    errorRate: number;
    throughput: number;
    lambdaMetrics: any;
    dynamoDbMetrics: any;
  }> {
    try {
      // In a real implementation, these would come from CloudWatch metrics
      // For now, we'll simulate realistic values and provide the structure
      
      const [lambdaMetrics, dynamoDbMetrics] = await Promise.all([
        this.getLambdaMetrics(),
        this.getDynamoDbMetrics()
      ]);

      // Simulate system metrics (would come from CloudWatch in production)
      const cpuUsage = Math.random() * 0.3 + 0.1; // 10-40%
      const memoryUsage = Math.random() * 0.4 + 0.2; // 20-60%
      const diskUsage = Math.random() * 0.2 + 0.1; // 10-30%
      const networkLatency = Math.random() * 50 + 10; // 10-60ms
      const errorRate = Math.random() * 0.02; // 0-2%
      const throughput = Math.random() * 100 + 50; // 50-150 requests/min
      
      // Response time percentiles
      const responseTime = {
        p50: Math.random() * 500 + 200, // 200-700ms
        p95: Math.random() * 1000 + 800, // 800-1800ms
        p99: Math.random() * 2000 + 1500 // 1500-3500ms
      };

      return {
        responseTime,
        cpuUsage,
        memoryUsage,
        diskUsage,
        networkLatency,
        errorRate,
        throughput,
        lambdaMetrics,
        dynamoDbMetrics
      };
    } catch (error) {
      console.error('Error getting system performance metrics:', error);
      return {
        responseTime: { p50: 350, p95: 1200, p99: 2500 },
        cpuUsage: 0.15,
        memoryUsage: 0.35,
        diskUsage: 0.20,
        networkLatency: 25,
        errorRate: 0.01,
        throughput: 75,
        lambdaMetrics: {
          chatProcessor: { invocations: 0, errors: 0, duration: 0, throttles: 0 },
          adminAnalytics: { invocations: 0, errors: 0, duration: 0, throttles: 0 },
          escalationProcessor: { invocations: 0, errors: 0, duration: 0, throttles: 0 }
        },
        dynamoDbMetrics: {
          readCapacityUtilization: 0.3,
          writeCapacityUtilization: 0.2,
          throttledRequests: 0,
          successfulRequests: 100
        }
      };
    }
  }

  /**
   * Get active system alerts
   */
  private async getActiveAlerts(): Promise<Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
    resolved: boolean;
  }>> {
    try {
      // In production, this would query an alerts/monitoring system
      // For now, return sample alerts based on system conditions
      const alerts = [];
      
      // Check for high error rates, system load, etc.
      const systemMetrics = await this.getSystemPerformanceMetrics();
      
      if (systemMetrics.errorRate > 0.05) {
        alerts.push({
          id: `error-rate-${Date.now()}`,
          severity: 'high' as const,
          message: `High error rate detected: ${(systemMetrics.errorRate * 100).toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          resolved: false
        });
      }
      
      if (systemMetrics.cpuUsage > 0.8) {
        alerts.push({
          id: `cpu-usage-${Date.now()}`,
          severity: 'medium' as const,
          message: `High CPU usage: ${(systemMetrics.cpuUsage * 100).toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          resolved: false
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error getting active alerts:', error);
      return [];
    }
  }

  // Helper methods for real-time metrics

  private async getActiveConversations(since: Date): Promise<any[]> {
    // This would query the conversations table for active conversations
    // For now, return mock data
    return [];
  }

  private async getNewConversations(startTime: Date, endTime: Date): Promise<any[]> {
    // This would query for conversations created in the time range
    return [];
  }

  private async getActiveUsers(startTime: Date, endTime: Date): Promise<any[]> {
    // This would query for users active in the time range
    return [];
  }

  private async getHistoricalUsers(startTime: Date, endTime: Date): Promise<any[]> {
    // This would query for historical user activity
    return [];
  }

  private async getPeakConcurrentUsers(): Promise<number> {
    // This would get the peak concurrent users from a tracking system
    return Math.floor(Math.random() * 50) + 10;
  }

  private async getCurrentEscalations(): Promise<any[]> {
    // This would query the escalation queue table
    return [];
  }

  private async getLambdaMetrics(): Promise<any> {
    // This would query CloudWatch for Lambda metrics
    return {
      chatProcessor: {
        invocations: Math.floor(Math.random() * 1000) + 100,
        errors: Math.floor(Math.random() * 10),
        duration: Math.random() * 2000 + 500,
        throttles: Math.floor(Math.random() * 5)
      },
      adminAnalytics: {
        invocations: Math.floor(Math.random() * 100) + 10,
        errors: Math.floor(Math.random() * 2),
        duration: Math.random() * 1000 + 200,
        throttles: 0
      },
      escalationProcessor: {
        invocations: Math.floor(Math.random() * 50) + 5,
        errors: Math.floor(Math.random() * 2),
        duration: Math.random() * 1500 + 300,
        throttles: 0
      }
    };
  }

  private async getDynamoDbMetrics(): Promise<any> {
    // This would query CloudWatch for DynamoDB metrics
    return {
      readCapacityUtilization: Math.random() * 0.5 + 0.1,
      writeCapacityUtilization: Math.random() * 0.4 + 0.1,
      throttledRequests: Math.floor(Math.random() * 5),
      successfulRequests: Math.floor(Math.random() * 1000) + 500
    };
  }

  /**
   * Get enhanced escalation analytics with filtering and trend analysis
   */
  async getEscalationAnalytics(params: {
    startDate: string;
    endDate: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    status?: 'pending' | 'in_progress' | 'resolved' | 'closed';
    granularity?: 'daily' | 'weekly';
  }): Promise<{
    totalEscalations: number;
    escalationRate: number;
    averageResolutionTime: number;
    escalationsByPriority: Record<string, number>;
    escalationsByReason: Record<string, number>;
    escalationsByStatus: Record<string, number>;
    escalationTrends: Array<{ date: string; count: number; rate: number }>;
    triggerAnalysis: {
      lowConfidence: number;
      explicitRequest: number;
      emergencyKeywords: number;
      repeatedQuestions: number;
      longConversation: number;
      noRelevantSources: number;
    };
  }> {
    console.log(`🚨 Getting escalation analytics from ${params.startDate} to ${params.endDate}`);

    try {
      // Get escalation data for the date range
      const escalationData = await this.getAnalyticsDataByType('escalation', params.startDate, params.endDate);
      const chatData = await this.getAnalyticsDataByType('chat', params.startDate, params.endDate);

      // Initialize counters
      let totalEscalations = 0;
      let totalSessions = 0;
      const escalationsByPriority: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
      const escalationsByReason: Record<string, number> = {};
      const escalationsByStatus: Record<string, number> = { pending: 0, in_progress: 0, resolved: 0, closed: 0 };
      const resolutionTimes: number[] = [];
      const dailyEscalations: Record<string, { count: number; sessions: number }> = {};
      
      const triggerAnalysis = {
        lowConfidence: 0,
        explicitRequest: 0,
        emergencyKeywords: 0,
        repeatedQuestions: 0,
        longConversation: 0,
        noRelevantSources: 0
      };

      // Process escalation data
      for (const data of escalationData) {
        // Apply filters
        if (params.priority && data.metadata?.priority !== params.priority) continue;
        if (params.status && data.metadata?.status !== params.status) continue;

        if (data.metric === 'created') {
          totalEscalations += data.value;
          
          // Track by priority
          if (data.metadata?.priority) {
            escalationsByPriority[data.metadata.priority] = 
              (escalationsByPriority[data.metadata.priority] || 0) + data.value;
          }
          
          // Track by reason
          if (data.metadata?.reason) {
            escalationsByReason[data.metadata.reason] = 
              (escalationsByReason[data.metadata.reason] || 0) + data.value;
            
            // Categorize trigger types
            const reason = data.metadata.reason.toLowerCase();
            if (reason.includes('confidence')) {
              triggerAnalysis.lowConfidence += data.value;
            } else if (reason.includes('explicit') || reason.includes('human')) {
              triggerAnalysis.explicitRequest += data.value;
            } else if (reason.includes('emergency') || reason.includes('urgent')) {
              triggerAnalysis.emergencyKeywords += data.value;
            } else if (reason.includes('repeated') || reason.includes('similar')) {
              triggerAnalysis.repeatedQuestions += data.value;
            } else if (reason.includes('conversation') || reason.includes('extended')) {
              triggerAnalysis.longConversation += data.value;
            } else if (reason.includes('sources') || reason.includes('knowledge')) {
              triggerAnalysis.noRelevantSources += data.value;
            }
          }
          
          // Track by status
          if (data.metadata?.status) {
            escalationsByStatus[data.metadata.status] = 
              (escalationsByStatus[data.metadata.status] || 0) + data.value;
          }
          
          // Track daily trends
          if (!dailyEscalations[data.date]) {
            dailyEscalations[data.date] = { count: 0, sessions: 0 };
          }
          dailyEscalations[data.date].count += data.value;
        }
        
        if (data.metric === 'resolved' && data.metadata?.resolutionTime) {
          resolutionTimes.push(data.metadata.resolutionTime);
        }
      }

      // Get session counts for escalation rate calculation
      for (const data of chatData) {
        if (data.metric === 'session_created') {
          totalSessions += data.value;
          
          // Track daily sessions for trend analysis
          if (!dailyEscalations[data.date]) {
            dailyEscalations[data.date] = { count: 0, sessions: 0 };
          }
          dailyEscalations[data.date].sessions += data.value;
        }
      }

      // Calculate escalation trends
      const escalationTrends = Object.entries(dailyEscalations)
        .map(([date, data]) => ({
          date,
          count: data.count,
          rate: data.sessions > 0 ? (data.count / data.sessions) * 100 : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Group by week if requested
      if (params.granularity === 'weekly') {
        const weeklyTrends: Record<string, { count: number; sessions: number }> = {};
        
        for (const trend of escalationTrends) {
          const date = new Date(trend.date);
          const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];
          
          if (!weeklyTrends[weekKey]) {
            weeklyTrends[weekKey] = { count: 0, sessions: 0 };
          }
          
          weeklyTrends[weekKey].count += trend.count;
          // Note: We'd need session data to calculate weekly rates properly
        }
        
        escalationTrends.length = 0;
        escalationTrends.push(...Object.entries(weeklyTrends).map(([date, data]) => ({
          date,
          count: data.count,
          rate: data.sessions > 0 ? (data.count / data.sessions) * 100 : 0
        })));
      }

      // Calculate average resolution time
      const averageResolutionTime = resolutionTimes.length > 0 ? 
        resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length : 0;

      // Calculate overall escalation rate
      const escalationRate = totalSessions > 0 ? (totalEscalations / totalSessions) * 100 : 0;

      return {
        totalEscalations,
        escalationRate,
        averageResolutionTime,
        escalationsByPriority,
        escalationsByReason,
        escalationsByStatus,
        escalationTrends,
        triggerAnalysis
      };
    } catch (error) {
      console.error('Failed to get escalation analytics:', error);
      throw new Error(`Failed to retrieve escalation analytics: ${(error as Error).message}`);
    }
  }

  /**
   * Get escalation trigger analysis for conversations
   */
  async getEscalationTriggerAnalysis(params: {
    startDate: string;
    endDate: string;
    conversationId?: string;
  }): Promise<{
    totalTriggeredConversations: number;
    triggersByType: Record<string, number>;
    triggersByConfidenceRange: Record<string, number>;
    conversationsWithTriggers: Array<{
      conversationId: string;
      triggerCount: number;
      triggerTypes: string[];
      averageConfidence: number;
      escalated: boolean;
    }>;
  }> {
    console.log(`🔍 Getting escalation trigger analysis from ${params.startDate} to ${params.endDate}`);

    try {
      // Get messages with escalation triggers
      const triggerMessages = await this.getDynamoService().getEscalationTriggerMessages(
        params.startDate, 
        params.endDate
      );

      // Filter by conversation if specified
      const filteredMessages = params.conversationId 
        ? triggerMessages.filter(m => m.conversationId === params.conversationId)
        : triggerMessages;

      // Analyze triggers by conversation
      const conversationTriggers = new Map<string, {
        triggerCount: number;
        triggerTypes: Set<string>;
        confidenceScores: number[];
        escalated: boolean;
      }>();

      const triggersByType: Record<string, number> = {};
      const triggersByConfidenceRange: Record<string, number> = {
        'very_low_0_20': 0,
        'low_20_40': 0,
        'medium_40_60': 0,
        'high_60_80': 0,
        'very_high_80_100': 0
      };

      for (const message of filteredMessages) {
        if (!message.escalationTrigger) continue;

        const conversationId = message.conversationId;
        
        if (!conversationTriggers.has(conversationId)) {
          conversationTriggers.set(conversationId, {
            triggerCount: 0,
            triggerTypes: new Set(),
            confidenceScores: [],
            escalated: false
          });
        }

        const conversation = conversationTriggers.get(conversationId)!;
        conversation.triggerCount++;
        
        if (message.confidenceScore !== undefined) {
          conversation.confidenceScores.push(message.confidenceScore);
          
          // Categorize by confidence range
          const confidence = message.confidenceScore * 100;
          if (confidence < 20) {
            triggersByConfidenceRange.very_low_0_20++;
          } else if (confidence < 40) {
            triggersByConfidenceRange.low_20_40++;
          } else if (confidence < 60) {
            triggersByConfidenceRange.medium_40_60++;
          } else if (confidence < 80) {
            triggersByConfidenceRange.high_60_80++;
          } else {
            triggersByConfidenceRange.very_high_80_100++;
          }
        }

        // Determine trigger type based on message content and confidence
        let triggerType = 'unknown';
        if (message.confidenceScore !== undefined && message.confidenceScore < 0.5) {
          triggerType = 'low_confidence';
        } else if (message.content.toLowerCase().includes('help') || 
                   message.content.toLowerCase().includes('human') ||
                   message.content.toLowerCase().includes('agent')) {
          triggerType = 'explicit_request';
        } else if (message.content.toLowerCase().includes('emergency') ||
                   message.content.toLowerCase().includes('urgent')) {
          triggerType = 'emergency_keywords';
        } else {
          triggerType = 'system_triggered';
        }

        conversation.triggerTypes.add(triggerType);
        triggersByType[triggerType] = (triggersByType[triggerType] || 0) + 1;
      }

      // Convert to result format
      const conversationsWithTriggers = Array.from(conversationTriggers.entries()).map(([conversationId, data]) => ({
        conversationId,
        triggerCount: data.triggerCount,
        triggerTypes: Array.from(data.triggerTypes),
        averageConfidence: data.confidenceScores.length > 0 
          ? data.confidenceScores.reduce((a, b) => a + b, 0) / data.confidenceScores.length 
          : 0,
        escalated: data.escalated // This would need to be determined from conversation outcome
      }));

      return {
        totalTriggeredConversations: conversationTriggers.size,
        triggersByType,
        triggersByConfidenceRange,
        conversationsWithTriggers
      };
    } catch (error) {
      console.error('Failed to get escalation trigger analysis:', error);
      throw new Error(`Failed to retrieve escalation trigger analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Get escalation reason categorization and analysis
   */
  async getEscalationReasonAnalysis(params: {
    startDate: string;
    endDate: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<{
    totalEscalations: number;
    reasonCategories: Array<{
      category: string;
      count: number;
      percentage: number;
      averagePriority: string;
      averageResolutionTime: number;
    }>;
    reasonTrends: Array<{
      date: string;
      reasonBreakdown: Record<string, number>;
    }>;
    improvementOpportunities: Array<{
      reason: string;
      frequency: number;
      suggestedAction: string;
      priority: 'high' | 'medium' | 'low';
    }>;
  }> {
    console.log(`📊 Getting escalation reason analysis from ${params.startDate} to ${params.endDate}`);

    try {
      const escalationData = await this.getAnalyticsDataByType('escalation', params.startDate, params.endDate);
      
      // Filter by priority if specified
      const filteredData = params.priority 
        ? escalationData.filter(d => d.metadata?.priority === params.priority)
        : escalationData;

      const reasonStats = new Map<string, {
        count: number;
        priorities: string[];
        resolutionTimes: number[];
      }>();

      const dailyReasons: Record<string, Record<string, number>> = {};
      let totalEscalations = 0;

      // Process escalation data
      for (const data of filteredData) {
        if (data.metric === 'created' && data.metadata?.reason) {
          totalEscalations += data.value;
          const reason = data.metadata.reason;
          
          // Track reason statistics
          if (!reasonStats.has(reason)) {
            reasonStats.set(reason, {
              count: 0,
              priorities: [],
              resolutionTimes: []
            });
          }
          
          const stats = reasonStats.get(reason)!;
          stats.count += data.value;
          
          if (data.metadata.priority) {
            stats.priorities.push(data.metadata.priority);
          }
          
          // Track daily trends
          if (!dailyReasons[data.date]) {
            dailyReasons[data.date] = {};
          }
          dailyReasons[data.date][reason] = (dailyReasons[data.date][reason] || 0) + data.value;
        }
        
        if (data.metric === 'resolved' && data.metadata?.reason && data.metadata?.resolutionTime) {
          const reason = data.metadata.reason;
          if (reasonStats.has(reason)) {
            reasonStats.get(reason)!.resolutionTimes.push(data.metadata.resolutionTime);
          }
        }
      }

      // Calculate reason categories
      const reasonCategories = Array.from(reasonStats.entries()).map(([reason, stats]) => {
        const percentage = totalEscalations > 0 ? (stats.count / totalEscalations) * 100 : 0;
        
        // Calculate average priority (convert to numeric for averaging)
        const priorityValues = { low: 1, medium: 2, high: 3, urgent: 4 };
        const avgPriorityValue = stats.priorities.length > 0 
          ? stats.priorities.reduce((sum, p) => sum + (priorityValues[p as keyof typeof priorityValues] || 2), 0) / stats.priorities.length
          : 2;
        
        const averagePriority = avgPriorityValue <= 1.5 ? 'low' : 
                              avgPriorityValue <= 2.5 ? 'medium' : 
                              avgPriorityValue <= 3.5 ? 'high' : 'urgent';
        
        const averageResolutionTime = stats.resolutionTimes.length > 0 
          ? stats.resolutionTimes.reduce((a, b) => a + b, 0) / stats.resolutionTimes.length 
          : 0;

        return {
          category: reason,
          count: stats.count,
          percentage,
          averagePriority,
          averageResolutionTime
        };
      }).sort((a, b) => b.count - a.count);

      // Calculate reason trends
      const reasonTrends = Object.entries(dailyReasons).map(([date, reasonBreakdown]) => ({
        date,
        reasonBreakdown
      })).sort((a, b) => a.date.localeCompare(b.date));

      // Identify improvement opportunities
      const improvementOpportunities = reasonCategories
        .filter(category => category.count >= 5) // Focus on frequent issues
        .map(category => {
          let suggestedAction = '';
          let priority: 'high' | 'medium' | 'low' = 'medium';
          
          const reason = category.category.toLowerCase();
          
          if (reason.includes('confidence') || reason.includes('accuracy')) {
            suggestedAction = 'Improve knowledge base content and model training';
            priority = category.percentage > 20 ? 'high' : 'medium';
          } else if (reason.includes('repeated') || reason.includes('similar')) {
            suggestedAction = 'Add FAQ entries for commonly repeated questions';
            priority = 'medium';
          } else if (reason.includes('sources') || reason.includes('knowledge')) {
            suggestedAction = 'Expand knowledge base coverage for this topic area';
            priority = category.percentage > 15 ? 'high' : 'medium';
          } else if (reason.includes('conversation') || reason.includes('extended')) {
            suggestedAction = 'Optimize conversation flow and add proactive escalation';
            priority = 'low';
          } else {
            suggestedAction = 'Review and optimize escalation triggers';
            priority = 'medium';
          }

          return {
            reason: category.category,
            frequency: category.count,
            suggestedAction,
            priority
          };
        })
        .sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        })
        .slice(0, 10); // Top 10 opportunities

      return {
        totalEscalations,
        reasonCategories,
        reasonTrends,
        improvementOpportunities
      };
    } catch (error) {
      console.error('Failed to get escalation reason analysis:', error);
      throw new Error(`Failed to retrieve escalation reason analysis: ${(error as Error).message}`);
    }
  }
  async trackConversationOutcome(
    conversationId: string,
    outcome: 'resolved' | 'escalated' | 'abandoned',
    metadata?: {
      escalationReason?: string;
      finalConfidenceScore?: number;
      userSatisfaction?: number;
    }
  ): Promise<void> {
    console.log(`📝 Tracking conversation outcome: ${conversationId} -> ${outcome}`);

    try {
      // This would typically update the conversation record
      // For now, we'll record it as analytics data
      const now = new Date();
      const analyticsData: AnalyticsData = {
        date: now.toISOString().split('T')[0],
        hour: now.getHours(),
        type: 'chat',
        metric: 'outcome',
        value: 1,
        createdAt: now,
        metadata: {
          conversationId,
          outcome,
          ...metadata
        }
      };

      await this.getDynamoService().recordAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to track conversation outcome:', error);
      throw new Error(`Failed to track conversation outcome: ${(error as Error).message}`);
    }
  }

  /**
   * Get enhanced FAQ analysis with question extraction from messages
   */
  async getEnhancedFAQAnalysis(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
    limit?: number;
    includeMessageExtraction?: boolean;
  }): Promise<{
    topQuestions: Array<{
      question: string;
      count: number;
      category: string;
      averageConfidence: number;
      sources: Array<{ type: 'recorded' | 'extracted'; count: number }>;
    }>;
    questionsByCategory: Record<string, number>;
    totalQuestionsAnalyzed: number;
    extractedQuestions: Array<{
      question: string;
      frequency: number;
      averageConfidence: number;
      category: string;
    }>;
  }> {
    console.log(`❓ Getting enhanced FAQ analysis from ${params.startDate} to ${params.endDate}`);

    try {
      // Get recorded questions from the questions table
      const recordedQuestions = await this.getFrequentlyAskedQuestions({
        startDate: params.startDate,
        endDate: params.endDate,
        language: params.language,
        limit: params.limit || 20
      });

      let extractedQuestions: Array<{
        question: string;
        frequency: number;
        averageConfidence: number;
        category: string;
      }> = [];

      // Extract questions from messages if requested
      if (params.includeMessageExtraction) {
        extractedQuestions = await this.extractQuestionsFromMessages(
          params.startDate,
          params.endDate,
          params.language
        );
      }

      // Combine and enhance the analysis
      const questionMap = new Map<string, {
        question: string;
        count: number;
        category: string;
        totalConfidence: number;
        occurrences: number;
        sources: { recorded: number; extracted: number };
      }>();

      // Add recorded questions
      recordedQuestions.topQuestions.forEach(q => {
        const key = this.normalizeQuestion(q.question);
        questionMap.set(key, {
          question: q.question,
          count: q.count,
          category: q.category,
          totalConfidence: q.averageConfidence * q.count,
          occurrences: q.count,
          sources: { recorded: q.count, extracted: 0 }
        });
      });

      // Add extracted questions
      extractedQuestions.forEach(q => {
        const key = this.normalizeQuestion(q.question);
        if (questionMap.has(key)) {
          const existing = questionMap.get(key)!;
          existing.count += q.frequency;
          existing.totalConfidence += q.averageConfidence * q.frequency;
          existing.occurrences += q.frequency;
          existing.sources.extracted += q.frequency;
        } else {
          questionMap.set(key, {
            question: q.question,
            count: q.frequency,
            category: q.category,
            totalConfidence: q.averageConfidence * q.frequency,
            occurrences: q.frequency,
            sources: { recorded: 0, extracted: q.frequency }
          });
        }
      });

      // Convert to final format
      const topQuestions = Array.from(questionMap.values())
        .map(q => ({
          question: q.question,
          count: q.count,
          category: q.category,
          averageConfidence: q.totalConfidence / q.occurrences,
          sources: [
            { type: 'recorded' as const, count: q.sources.recorded },
            { type: 'extracted' as const, count: q.sources.extracted }
          ].filter(s => s.count > 0)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, params.limit || 20);

      // Calculate questions by category
      const questionsByCategory: Record<string, number> = {};
      topQuestions.forEach(q => {
        questionsByCategory[q.category] = (questionsByCategory[q.category] || 0) + q.count;
      });

      return {
        topQuestions,
        questionsByCategory,
        totalQuestionsAnalyzed: Array.from(questionMap.values()).reduce((sum, q) => sum + q.count, 0),
        extractedQuestions
      };
    } catch (error) {
      console.error('Failed to get enhanced FAQ analysis:', error);
      throw new Error(`Failed to retrieve enhanced FAQ analysis: ${(error as Error).message}`);
    }
  }

  /**
   * Extract questions from chat messages using pattern matching
   */
  private async extractQuestionsFromMessages(
    startDate: string,
    endDate: string,
    language?: 'en' | 'es'
  ): Promise<Array<{
    question: string;
    frequency: number;
    averageConfidence: number;
    category: string;
  }>> {
    try {
      // Get user messages from the date range
      const messages = await this.getDynamoService().getMessagesByDateRange(
        startDate,
        endDate,
        'user'
      );

      // Filter by language if specified
      const filteredMessages = language 
        ? messages.filter(m => m.language === language)
        : messages;

      // Extract questions using pattern matching
      const questionPatterns = {
        en: [
          /^(what|how|when|where|why|who|which|can|could|would|should|is|are|do|does|did)\s+.+\?$/i,
          /^.+\?$/i, // Any sentence ending with ?
          /^(tell me|explain|help me|show me)\s+.+$/i
        ],
        es: [
          /^(qué|cómo|cuándo|dónde|por qué|quién|cuál|puedo|podría|sería|debería|es|son|hacer|hace|hizo)\s+.+\?$/i,
          /^.+\?$/i, // Any sentence ending with ?
          /^(dime|explica|ayúdame|muéstrame)\s+.+$/i
        ]
      };

      const extractedQuestions = new Map<string, {
        question: string;
        frequency: number;
        confidenceScores: number[];
        category: string;
      }>();

      for (const message of filteredMessages) {
        const content = message.content.trim();
        const messageLang = message.language || 'en';
        const patterns = questionPatterns[messageLang as keyof typeof questionPatterns] || questionPatterns.en;

        // Check if message matches question patterns
        const isQuestion = patterns.some(pattern => pattern.test(content));
        
        if (isQuestion && content.length > 10 && content.length < 200) {
          const normalizedQuestion = this.normalizeQuestion(content);
          
          if (extractedQuestions.has(normalizedQuestion)) {
            const existing = extractedQuestions.get(normalizedQuestion)!;
            existing.frequency++;
            if (message.confidenceScore !== undefined) {
              existing.confidenceScores.push(message.confidenceScore);
            }
          } else {
            extractedQuestions.set(normalizedQuestion, {
              question: content,
              frequency: 1,
              confidenceScores: message.confidenceScore !== undefined ? [message.confidenceScore] : [],
              category: await this.categorizeQuestion(content, messageLang)
            });
          }
        }
      }

      // Convert to result format
      return Array.from(extractedQuestions.values())
        .map(q => ({
          question: q.question,
          frequency: q.frequency,
          averageConfidence: q.confidenceScores.length > 0 
            ? q.confidenceScores.reduce((a, b) => a + b, 0) / q.confidenceScores.length 
            : 0,
          category: q.category
        }))
        .filter(q => q.frequency >= 2) // Only include questions asked at least twice
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 50); // Limit to top 50 extracted questions
    } catch (error) {
      console.error('Failed to extract questions from messages:', error);
      return [];
    }
  }

  /**
   * Categorize a question based on its content
   */
  private categorizeQuestion(question: string, language: 'en' | 'es' = 'en'): string {
    const lowerQuestion = question.toLowerCase();
    
    const categories = {
      en: {
        diabetes: ['diabetes', 'blood sugar', 'glucose', 'insulin', 'diabetic'],
        diet: ['food', 'eat', 'diet', 'nutrition', 'meal', 'carb', 'sugar'],
        medication: ['medication', 'medicine', 'drug', 'pill', 'dose', 'prescription'],
        exercise: ['exercise', 'workout', 'physical', 'activity', 'gym', 'walk'],
        symptoms: ['symptom', 'feel', 'pain', 'hurt', 'sick', 'tired'],
        monitoring: ['test', 'check', 'monitor', 'measure', 'level'],
        complications: ['complication', 'problem', 'issue', 'concern', 'risk'],
        lifestyle: ['lifestyle', 'daily', 'routine', 'habit', 'change']
      },
      es: {
        diabetes: ['diabetes', 'azúcar', 'glucosa', 'insulina', 'diabético'],
        diet: ['comida', 'comer', 'dieta', 'nutrición', 'comida', 'carbohidrato'],
        medication: ['medicamento', 'medicina', 'droga', 'pastilla', 'dosis'],
        exercise: ['ejercicio', 'entrenamiento', 'físico', 'actividad', 'gimnasio'],
        symptoms: ['síntoma', 'sentir', 'dolor', 'doler', 'enfermo', 'cansado'],
        monitoring: ['prueba', 'verificar', 'monitorear', 'medir', 'nivel'],
        complications: ['complicación', 'problema', 'asunto', 'preocupación', 'riesgo'],
        lifestyle: ['estilo de vida', 'diario', 'rutina', 'hábito', 'cambio']
      }
    };

    const langCategories = categories[language] || categories.en;

    for (const [category, keywords] of Object.entries(langCategories)) {
      if (keywords.some(keyword => lowerQuestion.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Get enhanced question ranking with multiple ranking algorithms
   */
  async getEnhancedQuestionRanking(params: {
    startDate: string;
    endDate: string;
    language?: 'en' | 'es';
    rankingMethod?: 'frequency' | 'confidence' | 'impact' | 'combined';
    limit?: number;
  }): Promise<EnhancedQuestionRankingResult> {
    console.log(`📊 Getting enhanced question ranking from ${params.startDate} to ${params.endDate}`);

    try {
      // Get base FAQ analysis
      const faqAnalysis = await this.getFrequentlyAskedQuestions({
        startDate: params.startDate,
        endDate: params.endDate,
        language: params.language,
        limit: 100 // Get more for ranking
      });

      // Calculate enhanced ranking scores
      const rankedQuestions = faqAnalysis.topQuestions.map((question, index) => {
        // Frequency score (normalized 0-1)
        const maxFrequency = Math.max(...faqAnalysis.topQuestions.map(q => q.count));
        const frequencyScore = question.count / maxFrequency;

        // Confidence score (inverted - lower confidence = higher impact)
        const confidenceScore = 1 - question.averageConfidence;

        // Impact score (combination of frequency and confidence issues)
        const impactScore = frequencyScore * (1 + confidenceScore);

        // Combined score (weighted average)
        const combinedScore = (frequencyScore * 0.4) + (confidenceScore * 0.3) + (impactScore * 0.3);

        let finalScore: number;
        switch (params.rankingMethod || 'combined') {
          case 'frequency':
            finalScore = frequencyScore;
            break;
          case 'confidence':
            finalScore = confidenceScore;
            break;
          case 'impact':
            finalScore = impactScore;
            break;
          default:
            finalScore = combinedScore;
        }

        return {
          question: question.question,
          rank: 0, // Will be set after sorting
          score: finalScore,
          frequency: question.count,
          averageConfidence: question.averageConfidence,
          category: question.category,
          impactScore,
          rankingFactors: {
            frequencyScore,
            confidenceScore,
            impactScore,
            combinedScore
          }
        };
      });

      // Sort by score and assign ranks
      rankedQuestions.sort((a, b) => b.score - a.score);
      rankedQuestions.forEach((question, index) => {
        question.rank = index + 1;
      });

      return {
        rankedQuestions: rankedQuestions.slice(0, params.limit || 20),
        rankingMethod: params.rankingMethod || 'combined',
        totalQuestionsRanked: faqAnalysis.totalQuestionsAnalyzed,
        rankingMetadata: {
          method: params.rankingMethod || 'combined',
          totalQuestions: faqAnalysis.totalQuestionsAnalyzed,
          dateRange: { start: params.startDate, end: params.endDate },
          language: params.language
        }
      };
    } catch (error) {
      console.error('Failed to get enhanced question ranking:', error);
      throw new Error(`Failed to retrieve enhanced question ranking: ${(error as Error).message}`);
    }
  }

  /**
   * Record question analysis for FAQ tracking
   */
  async recordQuestionAnalysis(
    question: string,
    category: string,
    confidenceScore: number,
    language: 'en' | 'es' = 'en',
    wasAnswered: boolean = true
  ): Promise<void> {
    console.log(`📊 Recording question analysis: ${question.substring(0, 50)}...`);

    try {
      const now = new Date();
      const questionHash = this.generateQuestionHash(question);
      
      const questionRecord: QuestionRecord = {
        questionHash,
        date: now.toISOString().split('T')[0],
        originalQuestion: question,
        normalizedQuestion: this.normalizeQuestion(question),
        category,
        count: 1,
        totalConfidenceScore: confidenceScore,
        averageConfidenceScore: confidenceScore,
        answeredCount: wasAnswered ? 1 : 0,
        unansweredCount: wasAnswered ? 0 : 1,
        escalationCount: confidenceScore < 0.5 ? 1 : 0,
        language,
        lastAsked: now.toISOString()
      };

      await this.getDynamoService().createOrUpdateQuestionRecord(questionRecord);
    } catch (error) {
      console.error('Failed to record question analysis:', error);
      throw new Error(`Failed to record question analysis: ${(error as Error).message}`);
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Generate a hash for question deduplication
   */
  private generateQuestionHash(question: string): string {
    const normalized = this.normalizeQuestion(question);
    // Simple hash function - in production, use a proper hash library
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Normalize question text for comparison
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Enhanced unanswered question identification and recording (Requirement 5.1)
   * Identifies questions that received low-confidence responses or no satisfactory answers
   */
  async identifyUnansweredQuestions(
    startDate: Date,
    endDate: Date,
    confidenceThreshold: number = 0.7
  ): Promise<UnansweredQuestion[]> {
    try {
      // Query conversations within date range
      const conversations = await this.getConversationsInDateRange(startDate, endDate);
      const unansweredQuestions: UnansweredQuestion[] = [];

      for (const conversation of conversations) {
        const messages = await this.getConversationMessages(conversation.conversationId);
        
        for (const message of messages) {
          if (message.type === 'user' && this.isQuestion(message.content)) {
            // Find the bot's response to this question
            const botResponse = messages.find(m => 
              m.type === 'bot' && 
              new Date(m.timestamp).getTime() > new Date(message.timestamp).getTime() &&
              Math.abs(new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime()) < 60000 // Within 1 minute
            );

            const isUnanswered = !botResponse || 
              (botResponse.confidenceScore && botResponse.confidenceScore < confidenceThreshold) ||
              this.isGenericResponse(botResponse.content);

            if (isUnanswered) {
              const normalizedQuestion = this.normalizeQuestion(message.content);
              const category = await this.categorizeQuestion(message.content);
              
              unansweredQuestions.push({
                id: `${conversation.conversationId}-${new Date(message.timestamp).getTime()}`,
                question: message.content,
                normalizedQuestion,
                category,
                timestamp: new Date(message.timestamp).getTime(),
                conversationId: conversation.conversationId,
                userId: conversation.userId,
                confidence: botResponse?.confidenceScore || 0,
                responseContent: botResponse?.content || null,
                language: conversation.language || 'en'
              });

              // Record in DynamoDB for persistence
              await this.recordUnansweredQuestion({
                id: `${conversation.conversationId}-${new Date(message.timestamp).getTime()}`,
                question: message.content,
                normalizedQuestion,
                category,
                timestamp: new Date(message.timestamp).getTime(),
                conversationId: conversation.conversationId,
                userId: conversation.userId,
                confidence: botResponse?.confidenceScore || 0,
                responseContent: botResponse?.content || null,
                language: conversation.language || 'en'
              });
            }
          }
        }
      }

      return unansweredQuestions;
    } catch (error) {
      console.error('Error identifying unanswered questions:', error);
      throw error;
    }
  }

  /**
   * Enhanced knowledge gap analysis by topic category (Requirement 5.2)
   * Analyzes patterns in unanswered questions to identify knowledge gaps
   */
  async analyzeKnowledgeGaps(
    startDate: Date,
    endDate: Date,
    options: {
      minOccurrences?: number;
      includeSubcategories?: boolean;
      confidenceThreshold?: number;
    } = {}
  ): Promise<KnowledgeGapAnalysis> {
    try {
      const { minOccurrences = 3, includeSubcategories = true, confidenceThreshold = 0.7 } = options;
      
      const unansweredQuestions = await this.identifyUnansweredQuestions(
        startDate, 
        endDate, 
        confidenceThreshold
      );

      // Group by category and analyze patterns
      const categoryGaps = new Map<string, {
        questions: UnansweredQuestion[];
        frequency: number;
        avgConfidence: number;
        subcategories: Map<string, number>;
        trends: { date: string; count: number }[];
      }>();

      // Analyze by day for trend data
      const dailyData = new Map<string, Map<string, number>>();

      for (const question of unansweredQuestions) {
        const category = question.category;
        const dateKey = new Date(question.timestamp).toISOString().split('T')[0];

        // Category analysis
        if (!categoryGaps.has(category)) {
          categoryGaps.set(category, {
            questions: [],
            frequency: 0,
            avgConfidence: 0,
            subcategories: new Map(),
            trends: []
          });
        }

        const categoryData = categoryGaps.get(category)!;
        categoryData.questions.push(question);
        categoryData.frequency++;

        // Daily trend tracking
        if (!dailyData.has(dateKey)) {
          dailyData.set(dateKey, new Map());
        }
        const dayData = dailyData.get(dateKey)!;
        dayData.set(category, (dayData.get(category) || 0) + 1);

        // Subcategory analysis if enabled
        if (includeSubcategories) {
          const subcategory = await this.getQuestionSubcategory(question.question);
          categoryData.subcategories.set(subcategory, (categoryData.subcategories.get(subcategory) || 0) + 1);
        }
      }

      // Calculate averages and build trends
      const gaps: KnowledgeGap[] = [];
      for (const [category, data] of Array.from(categoryGaps)) {
        if (data.frequency >= minOccurrences) {
          data.avgConfidence = data.questions.reduce((sum, q) => sum + q.confidence, 0) / data.questions.length;
          
          // Build trend data
          const trendMap = new Map<string, number>();
          for (const [date, categories] of Array.from(dailyData)) {
            trendMap.set(date, categories.get(category) || 0);
          }
          data.trends = Array.from(trendMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

          gaps.push({
            category,
            frequency: data.frequency,
            avgConfidence: data.avgConfidence,
            sampleQuestions: data.questions.slice(0, 5).map(q => q.question),
            subcategories: includeSubcategories ? Array.from(data.subcategories.entries())
              .map(([sub, count]) => ({ subcategory: sub, count }))
              .sort((a, b) => b.count - a.count) : [],
            trends: data.trends,
            severity: this.calculateGapSeverity(data.frequency, data.avgConfidence),
            recommendedActions: await this.generateRecommendedActions(category, data)
          });
        }
      }

      return {
        analysisDate: new Date(),
        dateRange: { startDate, endDate },
        totalUnansweredQuestions: unansweredQuestions.length,
        knowledgeGaps: gaps.sort((a, b) => b.severity - a.severity),
        summary: {
          criticalGaps: gaps.filter(g => g.severity >= 0.8).length,
          moderateGaps: gaps.filter(g => g.severity >= 0.5 && g.severity < 0.8).length,
          minorGaps: gaps.filter(g => g.severity < 0.5).length,
          topCategories: gaps.slice(0, 5).map(g => g.category)
        }
      };
    } catch (error) {
      console.error('Error analyzing knowledge gaps:', error);
      throw error;
    }
  }

  /**
   * Improvement opportunity prioritization (Requirement 5.4)
   * Prioritizes knowledge gaps and unanswered questions for content improvement
   */
  async prioritizeImprovementOpportunities(
    knowledgeGaps: KnowledgeGap[],
    options: {
      weightFrequency?: number;
      weightSeverity?: number;
      weightTrend?: number;
      maxOpportunities?: number;
    } = {}
  ): Promise<ImprovementOpportunity[]> {
    try {
      const {
        weightFrequency = 0.4,
        weightSeverity = 0.4,
        weightTrend = 0.2,
        maxOpportunities = 20
      } = options;

      const opportunities: ImprovementOpportunity[] = [];

      for (const gap of knowledgeGaps) {
        // Calculate trend score (positive trend = increasing problems)
        const trendScore = this.calculateTrendScore(gap.trends);
        
        // Calculate composite priority score
        const normalizedFrequency = Math.min(gap.frequency / 50, 1); // Normalize to 0-1
        const priorityScore = 
          (normalizedFrequency * weightFrequency) +
          (gap.severity * weightSeverity) +
          (trendScore * weightTrend);

        // Determine effort level based on frequency and complexity
        const effortLevel = this.determineEffortLevel(gap);
        
        // Calculate impact potential
        const impactPotential = this.calculateImpactPotential(gap);

        opportunities.push({
          id: `gap-${gap.category.replace(/\s+/g, '-').toLowerCase()}`,
          category: gap.category,
          description: `Address knowledge gap in ${gap.category}`,
          priorityScore,
          frequency: gap.frequency,
          severity: gap.severity,
          trendScore,
          effortLevel,
          impactPotential,
          recommendedActions: gap.recommendedActions,
          sampleQuestions: gap.sampleQuestions,
          estimatedImpact: {
            questionsAddressed: gap.frequency,
            userSatisfactionImprovement: impactPotential * 0.3,
            confidenceScoreImprovement: (1 - gap.avgConfidence) * 0.5
          },
          timeline: this.estimateImplementationTimeline(effortLevel),
          resources: this.identifyRequiredResources(gap)
        });
      }

      // Sort by priority score and return top opportunities
      return opportunities
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, maxOpportunities);
    } catch (error) {
      console.error('Error prioritizing improvement opportunities:', error);
      throw error;
    }
  }

  /**
   * Trend analysis for problematic question types (Requirement 5.5)
   * Analyzes trends in unanswered questions over time
   */
  async analyzeProblematicQuestionTrends(
    startDate: Date,
    endDate: Date,
    options: {
      granularity?: 'daily' | 'weekly' | 'monthly';
      topCategories?: number;
      includeSeasonality?: boolean;
    } = {}
  ): Promise<ProblematicQuestionTrends> {
    try {
      const { granularity = 'daily', topCategories = 10, includeSeasonality = true } = options;
      
      const unansweredQuestions = await this.identifyUnansweredQuestions(startDate, endDate);
      
      // Group by time period and category
      const timeSeriesData = new Map<string, Map<string, {
        count: number;
        avgConfidence: number;
        questions: UnansweredQuestion[];
      }>>();

      for (const question of unansweredQuestions) {
        const timeKey = this.getTimeKey(new Date(question.timestamp), granularity);
        const category = question.category;

        if (!timeSeriesData.has(timeKey)) {
          timeSeriesData.set(timeKey, new Map());
        }

        const timeData = timeSeriesData.get(timeKey)!;
        if (!timeData.has(category)) {
          timeData.set(category, { count: 0, avgConfidence: 0, questions: [] });
        }

        const categoryData = timeData.get(category)!;
        categoryData.count++;
        categoryData.questions.push(question);
      }

      // Calculate average confidence for each time period and category
      for (const [timeKey, timeData] of Array.from(timeSeriesData)) {
        for (const [category, data] of Array.from(timeData)) {
          data.avgConfidence = data.questions.reduce((sum, q) => sum + q.confidence, 0) / data.questions.length;
        }
      }

      // Build trend data for top categories
      const categoryFrequency = new Map<string, number>();
      for (const question of unansweredQuestions) {
        categoryFrequency.set(question.category, (categoryFrequency.get(question.category) || 0) + 1);
      }

      const topCategoriesList = Array.from(categoryFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topCategories)
        .map(([category]) => category);

      const trends: CategoryTrend[] = [];
      for (const category of topCategoriesList) {
        const trendData: TrendDataPoint[] = [];
        
        for (const [timeKey, timeData] of Array.from(timeSeriesData)) {
          const categoryData = timeData.get(category);
          trendData.push({
            period: timeKey,
            count: categoryData?.count || 0,
            avgConfidence: categoryData?.avgConfidence || 0,
            change: 0 // Will be calculated below
          });
        }

        // Sort by time and calculate period-over-period changes
        trendData.sort((a, b) => a.period.localeCompare(b.period));
        for (let i = 1; i < trendData.length; i++) {
          const current = trendData[i].count;
          const previous = trendData[i - 1].count;
          trendData[i].change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        }

        // Calculate trend metrics
        const totalCount = trendData.reduce((sum, d) => sum + d.count, 0);
        const avgChange = trendData.slice(1).reduce((sum, d) => sum + d.change, 0) / (trendData.length - 1);
        const isIncreasing = avgChange > 5; // More than 5% average increase
        const isVolatile = this.calculateVolatility(trendData.map(d => d.count)) > 0.3;

        trends.push({
          category,
          totalCount,
          avgChange,
          isIncreasing,
          isVolatile,
          trendData,
          seasonality: includeSeasonality ? await this.detectSeasonality(trendData) : null,
          forecast: await this.generateForecast(trendData, granularity)
        });
      }

      return {
        analysisDate: new Date(),
        dateRange: { startDate, endDate },
        granularity,
        totalQuestions: unansweredQuestions.length,
        categoryTrends: trends,
        overallTrend: {
          totalChange: this.calculateOverallTrend(timeSeriesData),
          peakPeriods: this.identifyPeakPeriods(timeSeriesData),
          improvingCategories: trends.filter(t => !t.isIncreasing && t.avgChange < -5).map(t => t.category),
          worseningCategories: trends.filter(t => t.isIncreasing && t.avgChange > 10).map(t => t.category)
        }
      };
    } catch (error) {
      console.error('Error analyzing problematic question trends:', error);
      throw error;
    }
  }

  // Helper methods for enhanced unanswered question tracking

  private async recordUnansweredQuestion(question: UnansweredQuestion): Promise<void> {
    const command = new PutCommand({
      TableName: this.unansweredQuestionsTable,
      Item: {
        id: question.id,
        question: question.question,
        normalizedQuestion: question.normalizedQuestion,
        category: question.category,
        timestamp: question.timestamp,
        conversationId: question.conversationId,
        userId: question.userId,
        confidence: question.confidence,
        responseContent: question.responseContent,
        language: question.language,
        createdAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
      }
    });

    await this.dynamoClient.send(command);
  }

  private isQuestion(text: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did'];
    const lowerText = text.toLowerCase();
    return text.includes('?') || questionWords.some(word => lowerText.startsWith(word + ' '));
  }

  private isGenericResponse(response: string): boolean {
    const genericPhrases = [
      'i don\'t know',
      'i\'m not sure',
      'i can\'t help',
      'sorry, i don\'t understand',
      'please contact support',
      'i don\'t have information'
    ];
    const lowerResponse = response.toLowerCase();
    return genericPhrases.some(phrase => lowerResponse.includes(phrase));
  }

  private async getQuestionSubcategory(question: string): Promise<string> {
    // Enhanced subcategorization logic
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('type 1')) return 'type-1-diabetes';
    if (lowerQuestion.includes('type 2')) return 'type-2-diabetes';
    if (lowerQuestion.includes('gestational')) return 'gestational-diabetes';
    if (lowerQuestion.includes('child') || lowerQuestion.includes('kid')) return 'pediatric';
    if (lowerQuestion.includes('pregnancy') || lowerQuestion.includes('pregnant')) return 'pregnancy';
    if (lowerQuestion.includes('emergency') || lowerQuestion.includes('urgent')) return 'emergency';
    
    return 'general';
  }

  private calculateGapSeverity(frequency: number, avgConfidence: number): number {
    // Severity based on frequency and low confidence
    const frequencyScore = Math.min(frequency / 20, 1); // Normalize to 0-1
    const confidenceScore = 1 - avgConfidence; // Lower confidence = higher severity
    return (frequencyScore * 0.6) + (confidenceScore * 0.4);
  }

  private async generateRecommendedActions(category: string, data: any): Promise<string[]> {
    const actions = [
      `Create comprehensive FAQ section for ${category}`,
      `Enhance knowledge base content for ${category} topics`,
      `Review and improve existing ${category} responses`
    ];

    if (data.frequency > 10) {
      actions.push(`Prioritize ${category} content creation due to high frequency`);
    }

    if (data.avgConfidence < 0.5) {
      actions.push(`Improve response confidence for ${category} through better training data`);
    }

    return actions;
  }

  private calculateTrendScore(trends: { date: string; count: number }[]): number {
    if (trends.length < 2) return 0;
    
    const recent = trends.slice(-7); // Last 7 data points
    const earlier = trends.slice(0, 7); // First 7 data points
    
    const recentAvg = recent.reduce((sum, t) => sum + t.count, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, t) => sum + t.count, 0) / earlier.length;
    
    return earlierAvg > 0 ? (recentAvg - earlierAvg) / earlierAvg : 0;
  }

  private determineEffortLevel(gap: KnowledgeGap): 'low' | 'medium' | 'high' {
    if (gap.frequency < 5) return 'low';
    if (gap.frequency < 15) return 'medium';
    return 'high';
  }

  private calculateImpactPotential(gap: KnowledgeGap): number {
    // Impact based on frequency and current severity
    return Math.min((gap.frequency * gap.severity) / 20, 1);
  }

  private estimateImplementationTimeline(effort: 'low' | 'medium' | 'high'): string {
    switch (effort) {
      case 'low': return '1-2 weeks';
      case 'medium': return '2-4 weeks';
      case 'high': return '1-2 months';
      default: return '2-4 weeks';
    }
  }

  private identifyRequiredResources(gap: KnowledgeGap): string[] {
    const resources = ['Content writer', 'Subject matter expert'];
    
    if (gap.frequency > 15) {
      resources.push('Technical writer', 'QA reviewer');
    }
    
    if (gap.severity > 0.7) {
      resources.push('Medical professional review');
    }
    
    return resources;
  }

  private getTimeKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
    switch (granularity) {
      case 'daily':
        return date.toISOString().split('T')[0];
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      case 'monthly':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return date.toISOString().split('T')[0];
    }
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return mean > 0 ? stdDev / mean : 0;
  }

  private async detectSeasonality(trendData: TrendDataPoint[]): Promise<any> {
    // Simple seasonality detection - could be enhanced with more sophisticated algorithms
    if (trendData.length < 12) return null;
    
    const monthlyPattern = new Map<number, number[]>();
    for (const point of trendData) {
      const month = new Date(point.period).getMonth();
      if (!monthlyPattern.has(month)) {
        monthlyPattern.set(month, []);
      }
      monthlyPattern.get(month)!.push(point.count);
    }
    
    const monthlyAverages = new Map<number, number>();
    for (const [month, values] of Array.from(monthlyPattern)) {
      monthlyAverages.set(month, values.reduce((sum, v) => sum + v, 0) / values.length);
    }
    
    return {
      detected: monthlyAverages.size >= 6, // At least 6 months of data
      pattern: Array.from(monthlyAverages.entries()).sort((a, b) => a[0] - b[0])
    };
  }

  private async generateForecast(trendData: TrendDataPoint[], granularity: string): Promise<any> {
    // Simple linear trend forecast
    if (trendData.length < 3) return null;
    
    const values = trendData.map(d => d.count);
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + (i * v), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const nextPeriods = 3; // Forecast next 3 periods
    const forecast = [];
    for (let i = 1; i <= nextPeriods; i++) {
      forecast.push({
        period: `forecast-${i}`,
        predictedCount: Math.max(0, Math.round(slope * (n + i - 1) + intercept))
      });
    }
    
    return {
      method: 'linear-trend',
      confidence: 'low', // Simple method has low confidence
      forecast
    };
  }

  private calculateOverallTrend(timeSeriesData: Map<string, Map<string, any>>): number {
    const totalsByPeriod = new Map<string, number>();
    
    for (const [period, categories] of Array.from(timeSeriesData)) {
      let total = 0;
      for (const [, data] of Array.from(categories)) {
        total += data.count;
      }
      totalsByPeriod.set(period, total);
    }
    
    const periods = Array.from(totalsByPeriod.keys()).sort();
    if (periods.length < 2) return 0;
    
    const firstHalf = periods.slice(0, Math.floor(periods.length / 2));
    const secondHalf = periods.slice(Math.floor(periods.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, p) => sum + totalsByPeriod.get(p)!, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, p) => sum + totalsByPeriod.get(p)!, 0) / secondHalf.length;
    
    return firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
  }

  private identifyPeakPeriods(timeSeriesData: Map<string, Map<string, any>>): string[] {
    const totalsByPeriod = new Map<string, number>();
    
    for (const [period, categories] of Array.from(timeSeriesData)) {
      let total = 0;
      for (const [, data] of Array.from(categories)) {
        total += data.count;
      }
      totalsByPeriod.set(period, total);
    }
    
    const values = Array.from(totalsByPeriod.values());
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const threshold = mean * 1.5; // 50% above average
    
    return Array.from(totalsByPeriod.entries())
      .filter(([, count]) => count > threshold)
      .map(([period]) => period)
      .sort();
  }

  // Additional helper methods for enhanced functionality

  private async getConversationsInDateRange(startDate: Date, endDate: Date): Promise<ConversationRecord[]> {
    // This would typically query the conversations table
    // For now, return empty array - this should be implemented based on your DynamoDB schema
    return [];
  }

  private async getConversationMessages(conversationId: string): Promise<MessageRecord[]> {
    // This would typically query the messages table for a specific conversation
    // For now, return empty array - this should be implemented based on your DynamoDB schema
    return [];
  }

  // ============================================================================
  // TASK 8: Advanced Filtering and Search Implementation
  // ============================================================================

  /**
   * Advanced conversation filtering with multi-parameter support
   * Requirement 7.1, 7.3 - Multi-parameter filtering with logical AND operations
   */
  async getFilteredConversations(filters: AdvancedFilterOptions): Promise<FilteredResponse<ConversationRecord>> {
    const startTime = Date.now();
    const filterId = this.generateFilterId(filters);

    try {
      // Build date range for query
      const startDate = filters.startDate ? new Date(filters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

      // Get conversations in date range
      let conversations = await this.getConversationsInDateRange(startDate, endDate);

      // Apply filters with logical AND operations
      conversations = conversations.filter(conv => {
        // Language filter
        if (filters.language && conv.language !== filters.language) return false;
        
        // Outcome filter
        if (filters.outcome && conv.outcome !== filters.outcome) return false;
        
        // Confidence threshold filter
        if (filters.confidenceThreshold !== undefined && 
            conv.averageConfidenceScore < filters.confidenceThreshold) return false;
        
        // Message count filters
        if (filters.messageCountMin !== undefined && 
            conv.messageCount < filters.messageCountMin) return false;
        if (filters.messageCountMax !== undefined && 
            conv.messageCount > filters.messageCountMax) return false;
        
        // User filters
        if (filters.userId && conv.userId !== filters.userId) return false;
        if (filters.userZipCode && conv.userInfo?.zipCode !== filters.userZipCode) return false;
        
        // Escalation filters
        if (filters.escalationPriority && !conv.escalationReason) return false;
        if (filters.escalationStatus && conv.outcome !== 'escalated') return false;
        if (filters.escalationReason && 
            !conv.escalationReason?.toLowerCase().includes(filters.escalationReason.toLowerCase())) return false;

        return true;
      });

      // Apply sorting
      if (filters.sortBy) {
        conversations.sort((a, b) => {
          let aVal: any, bVal: any;
          
          switch (filters.sortBy) {
            case 'timestamp':
              aVal = new Date(a.timestamp).getTime();
              bVal = new Date(b.timestamp).getTime();
              break;
            case 'confidenceScore':
              aVal = a.averageConfidenceScore;
              bVal = b.averageConfidenceScore;
              break;
            case 'messageCount':
              aVal = a.messageCount;
              bVal = b.messageCount;
              break;
            default:
              aVal = a.timestamp;
              bVal = b.timestamp;
          }
          
          const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return filters.sortOrder === 'desc' ? -result : result;
        });
      }

      // Apply pagination
      const total = conversations.length;
      const offset = filters.offset || 0;
      const limit = filters.limit || 50;
      const paginatedConversations = conversations.slice(offset, offset + limit);

      // Create filter state
      const filterState: FilterState = {
        filterId,
        appliedFilters: filters,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        resultCount: total,
        executionTime: Date.now() - startTime
      };

      return {
        data: paginatedConversations,
        filterState,
        pagination: {
          total,
          offset,
          limit,
          hasMore: offset + limit < total
        },
        appliedFilters: filters
      };

    } catch (error) {
      console.error('Error in getFilteredConversations:', error);
      throw error;
    }
  }

  /**
   * Text-based search for conversations and questions
   * Requirement 7.2 - Text-based search functionality
   */
  async searchContent(searchOptions: SearchOptions): Promise<SearchResultsResponse> {
    const startTime = Date.now();
    const results: SearchResult[] = [];

    try {
      const { query, searchIn, filters, fuzzyMatch, caseSensitive, maxResults = 100 } = searchOptions;
      
      // Normalize search query
      const normalizedQuery = caseSensitive ? query : query.toLowerCase();
      const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);

      // Search in conversations
      if (searchIn.includes('conversations')) {
        const conversations = await this.searchConversations(searchTerms, filters, fuzzyMatch, caseSensitive);
        results.push(...conversations);
      }

      // Search in questions
      if (searchIn.includes('questions')) {
        const questions = await this.searchQuestions(searchTerms, filters, fuzzyMatch, caseSensitive);
        results.push(...questions);
      }

      // Search in messages
      if (searchIn.includes('messages')) {
        const messages = await this.searchMessages(searchTerms, filters, fuzzyMatch, caseSensitive);
        results.push(...messages);
      }

      // Sort by relevance score
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Apply result limits
      const limitedResults = results.slice(0, maxResults);

      // Filter by minimum relevance score
      const filteredResults = searchOptions.minRelevanceScore 
        ? limitedResults.filter(r => r.relevanceScore >= searchOptions.minRelevanceScore!)
        : limitedResults;

      return {
        results: filteredResults,
        totalCount: results.length,
        searchQuery: query,
        searchOptions,
        executionTime: Date.now() - startTime,
        suggestions: this.generateSearchSuggestions(query, filteredResults.length === 0)
      };

    } catch (error) {
      console.error('Error in searchContent:', error);
      throw error;
    }
  }

  /**
   * Export filtered data in various formats
   * Requirement 7.5 - Data export functionality with applied filters
   */
  async exportData(exportOptions: DataExportOptions): Promise<ExportResult> {
    const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      const exportData: any[] = [];
      let totalRecords = 0;

      // Collect data based on selected types
      for (const dataType of exportOptions.dataTypes) {
        switch (dataType) {
          case 'conversations':
            const conversations = await this.getFilteredConversations(exportOptions.filters || {});
            exportData.push(...conversations.data.map(c => ({ dataType: 'conversation', ...c })));
            totalRecords += conversations.data.length;
            break;

          case 'messages':
            const messages = await this.getFilteredMessages(exportOptions.filters || {});
            exportData.push(...messages.map(m => ({ dataType: 'message', ...m })));
            totalRecords += messages.length;
            break;

          case 'questions':
            const questions = await this.getFilteredQuestions(exportOptions.filters || {});
            exportData.push(...questions.map(q => ({ dataType: 'question', ...q })));
            totalRecords += questions.length;
            break;

          case 'escalations':
            const escalations = await this.getFilteredEscalations(exportOptions.filters || {});
            exportData.push(...escalations.map(e => ({ dataType: 'escalation', ...e })));
            totalRecords += escalations.length;
            break;
        }
      }

      // Apply record limit
      const limitedData = exportOptions.maxRecords 
        ? exportData.slice(0, exportOptions.maxRecords)
        : exportData;

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = exportOptions.filename || 
        `ada-clara-export-${timestamp}.${exportOptions.format}`;

      // Format data based on export format
      let formattedData: string | Buffer;
      let fileSize: number;

      switch (exportOptions.format) {
        case 'json':
          const jsonData = {
            exportInfo: {
              exportId,
              timestamp: new Date().toISOString(),
              filters: exportOptions.filters,
              recordCount: limitedData.length
            },
            data: limitedData
          };
          formattedData = JSON.stringify(jsonData, null, 2);
          fileSize = Buffer.byteLength(formattedData, 'utf8');
          break;

        case 'csv':
          formattedData = this.convertToCSV(limitedData, exportOptions.includeHeaders);
          fileSize = Buffer.byteLength(formattedData, 'utf8');
          break;

        case 'xlsx':
          formattedData = await this.convertToXLSX(limitedData, exportOptions.includeHeaders);
          fileSize = formattedData.length;
          break;

        default:
          throw new Error(`Unsupported export format: ${exportOptions.format}`);
      }

      // Store export file (in real implementation, this would upload to S3)
      const downloadUrl = await this.storeExportFile(exportId, filename, formattedData, exportOptions.format);

      return {
        exportId,
        status: 'completed',
        format: exportOptions.format,
        filename,
        recordCount: limitedData.length,
        fileSize,
        downloadUrl,
        createdAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

    } catch (error) {
      console.error('Error in exportData:', error);
      return {
        exportId,
        status: 'failed',
        format: exportOptions.format,
        filename: exportOptions.filename || 'export-failed',
        recordCount: 0,
        fileSize: 0,
        createdAt: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute advanced analytics query with filtering and aggregation
   */
  async executeAdvancedQuery(query: AdvancedAnalyticsQuery): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Get filtered data based on query filters
      const conversations = await this.getFilteredConversations(query.filters);
      
      // Aggregate data based on dimensions and metrics
      const aggregatedData = this.aggregateQueryData(
        conversations.data, 
        query.dimensions, 
        query.metrics,
        query.timeGranularity
      );

      // Apply sorting and limiting
      let sortedData = aggregatedData;
      if (query.sortBy) {
        sortedData = aggregatedData.sort((a, b) => {
          const aVal = a.metrics[query.sortBy!] || a.dimensions[query.sortBy!] || 0;
          const bVal = b.metrics[query.sortBy!] || b.dimensions[query.sortBy!] || 0;
          const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return query.sortOrder === 'desc' ? -result : result;
        });
      }

      if (query.limit) {
        sortedData = sortedData.slice(0, query.limit);
      }

      return {
        queryId: query.queryId,
        executedAt: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        resultCount: sortedData.length,
        data: sortedData,
        filters: query.filters,
        metadata: {
          totalRecordsScanned: conversations.data.length,
          cacheHit: false,
          dataFreshness: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Error in executeAdvancedQuery:', error);
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods for Task 8
  // ============================================================================

  private generateFilterId(filters: AdvancedFilterOptions): string {
    const filterString = JSON.stringify(filters);
    return `filter_${Date.now()}_${this.hashString(filterString)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private async searchConversations(
    searchTerms: string[], 
    filters?: AdvancedFilterOptions,
    fuzzyMatch?: boolean,
    caseSensitive?: boolean
  ): Promise<SearchResult[]> {
    // Get conversations with filters applied
    const filteredConversations = await this.getFilteredConversations(filters || {});
    const results: SearchResult[] = [];

    for (const conversation of filteredConversations.data) {
      // Get messages for this conversation
      const messages = await this.getConversationMessages(conversation.conversationId);
      
      // Search in conversation metadata and messages
      const searchableContent = [
        conversation.userInfo?.name || '',
        conversation.escalationReason || '',
        ...messages.map(m => m.content)
      ].join(' ');

      const relevanceScore = this.calculateRelevanceScore(searchableContent, searchTerms, fuzzyMatch, caseSensitive);
      
      if (relevanceScore > 0) {
        results.push({
          id: conversation.conversationId,
          type: 'conversation',
          relevanceScore,
          title: `Conversation ${conversation.conversationId}`,
          content: this.truncateContent(searchableContent, 200),
          highlights: this.extractHighlights(searchableContent, searchTerms, caseSensitive),
          metadata: {
            timestamp: conversation.timestamp,
            language: conversation.language,
            conversationId: conversation.conversationId,
            userId: conversation.userId
          }
        });
      }
    }

    return results;
  }

  private async searchQuestions(
    searchTerms: string[], 
    filters?: AdvancedFilterOptions,
    fuzzyMatch?: boolean,
    caseSensitive?: boolean
  ): Promise<SearchResult[]> {
    // Get questions from the database
    const questions = await this.getFilteredQuestions(filters || {});
    const results: SearchResult[] = [];

    for (const question of questions) {
      const relevanceScore = this.calculateRelevanceScore(
        question.originalQuestion, 
        searchTerms, 
        fuzzyMatch, 
        caseSensitive
      );
      
      if (relevanceScore > 0) {
        results.push({
          id: question.questionHash,
          type: 'question',
          relevanceScore,
          title: question.originalQuestion,
          content: question.originalQuestion,
          highlights: this.extractHighlights(question.originalQuestion, searchTerms, caseSensitive),
          metadata: {
            timestamp: question.lastAsked,
            language: question.language,
            category: question.category
          }
        });
      }
    }

    return results;
  }

  private async searchMessages(
    searchTerms: string[], 
    filters?: AdvancedFilterOptions,
    fuzzyMatch?: boolean,
    caseSensitive?: boolean
  ): Promise<SearchResult[]> {
    // Get messages with filters applied
    const messages = await this.getFilteredMessages(filters || {});
    const results: SearchResult[] = [];

    for (const message of messages) {
      const relevanceScore = this.calculateRelevanceScore(
        message.content, 
        searchTerms, 
        fuzzyMatch, 
        caseSensitive
      );
      
      if (relevanceScore > 0) {
        results.push({
          id: `${message.conversationId}_${message.messageIndex}`,
          type: 'message',
          relevanceScore,
          title: `Message from ${message.type}`,
          content: this.truncateContent(message.content, 200),
          highlights: this.extractHighlights(message.content, searchTerms, caseSensitive),
          metadata: {
            timestamp: message.timestamp,
            language: message.language,
            conversationId: message.conversationId
          }
        });
      }
    }

    return results;
  }

  private calculateRelevanceScore(
    content: string, 
    searchTerms: string[], 
    fuzzyMatch?: boolean,
    caseSensitive?: boolean
  ): number {
    if (!content || searchTerms.length === 0) return 0;

    const normalizedContent = caseSensitive ? content : content.toLowerCase();
    let score = 0;
    let matchedTerms = 0;

    for (const term of searchTerms) {
      if (fuzzyMatch) {
        // Simple fuzzy matching - could be enhanced with more sophisticated algorithms
        const fuzzyMatches = this.findFuzzyMatches(normalizedContent, term);
        if (fuzzyMatches.length > 0) {
          matchedTerms++;
          score += fuzzyMatches.length * 0.8; // Fuzzy matches get lower score
        }
      } else {
        // Exact matching
        const exactMatches = (normalizedContent.match(new RegExp(this.escapeRegExp(term), 'g')) || []).length;
        if (exactMatches > 0) {
          matchedTerms++;
          score += exactMatches;
        }
      }
    }

    // Calculate final relevance score (0-1)
    const termCoverage = matchedTerms / searchTerms.length;
    const matchDensity = score / normalizedContent.split(/\s+/).length;
    
    return Math.min(1, (termCoverage * 0.7) + (matchDensity * 0.3));
  }

  private findFuzzyMatches(content: string, term: string): string[] {
    // Simple fuzzy matching implementation
    const words = content.split(/\s+/);
    const matches: string[] = [];
    
    for (const word of words) {
      if (this.calculateLevenshteinDistance(word, term) <= Math.max(1, Math.floor(term.length * 0.2))) {
        matches.push(word);
      }
    }
    
    return matches;
  }

  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private extractHighlights(content: string, searchTerms: string[], caseSensitive?: boolean): string[] {
    const highlights: string[] = [];
    const normalizedContent = caseSensitive ? content : content.toLowerCase();
    
    for (const term of searchTerms) {
      const regex = new RegExp(`\\b${this.escapeRegExp(term)}\\b`, caseSensitive ? 'g' : 'gi');
      const matches = content.match(regex);
      if (matches) {
        highlights.push(...matches);
      }
    }
    
    return Array.from(new Set(highlights)); // Remove duplicates
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  private generateSearchSuggestions(query: string, noResults: boolean): string[] {
    if (!noResults) return [];
    
    // Simple suggestion generation - could be enhanced with ML
    const suggestions: string[] = [];
    
    // Common diabetes-related terms
    const commonTerms = [
      'diabetes', 'blood sugar', 'insulin', 'glucose', 'type 1', 'type 2',
      'medication', 'diet', 'exercise', 'symptoms', 'treatment', 'management'
    ];
    
    // Find similar terms
    for (const term of commonTerms) {
      if (this.calculateLevenshteinDistance(query.toLowerCase(), term) <= 2) {
        suggestions.push(term);
      }
    }
    
    return suggestions.slice(0, 5);
  }

  private async getFilteredMessages(filters: AdvancedFilterOptions): Promise<MessageRecord[]> {
    // This would query the messages table with filters applied
    // For now, return empty array - implement based on your DynamoDB schema
    return [];
  }

  private async getFilteredQuestions(filters: AdvancedFilterOptions): Promise<QuestionRecord[]> {
    // This would query the questions table with filters applied
    // For now, return empty array - implement based on your DynamoDB schema
    return [];
  }

  private async getFilteredEscalations(filters: AdvancedFilterOptions): Promise<any[]> {
    // This would query the escalations table with filters applied
    // For now, return empty array - implement based on your DynamoDB schema
    return [];
  }

  private convertToCSV(data: any[], includeHeaders?: boolean): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];
    
    if (includeHeaders) {
      csvRows.push(headers.join(','));
    }
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  private async convertToXLSX(data: any[], includeHeaders?: boolean): Promise<Buffer> {
    // This would use a library like xlsx to create Excel files
    // For now, return empty buffer - implement with proper XLSX library
    return Buffer.from('');
  }

  private async storeExportFile(exportId: string, filename: string, data: string | Buffer, format: string): Promise<string> {
    // This would upload the file to S3 and return a presigned URL
    // For now, return a mock URL
    return `https://ada-clara-exports.s3.amazonaws.com/${exportId}/${filename}`;
  }

  private aggregateQueryData(
    data: any[], 
    dimensions: string[], 
    metrics: string[],
    timeGranularity?: string
  ): Array<{ dimensions: Record<string, any>; metrics: Record<string, number>; timestamp?: string }> {
    // Group data by dimensions
    const groups = new Map<string, any[]>();
    
    for (const item of data) {
      const dimensionKey = dimensions.map(dim => item[dim] || 'unknown').join('|');
      if (!groups.has(dimensionKey)) {
        groups.set(dimensionKey, []);
      }
      groups.get(dimensionKey)!.push(item);
    }
    
    // Calculate metrics for each group
    const results: Array<{ dimensions: Record<string, any>; metrics: Record<string, number>; timestamp?: string }> = [];
    
    for (const [dimensionKey, groupData] of Array.from(groups)) {
      const dimensionValues = dimensionKey.split('|');
      const dimensionObj: Record<string, any> = {};
      
      dimensions.forEach((dim, index) => {
        dimensionObj[dim] = dimensionValues[index];
      });
      
      const metricsObj: Record<string, number> = {};
      
      for (const metric of metrics) {
        switch (metric) {
          case 'count':
            metricsObj[metric] = groupData.length;
            break;
          case 'averageConfidence':
            const confidenceScores = groupData
              .map(item => item.averageConfidenceScore)
              .filter(score => score !== undefined);
            metricsObj[metric] = confidenceScores.length > 0 
              ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
              : 0;
            break;
          case 'totalMessages':
            metricsObj[metric] = groupData.reduce((sum, item) => sum + (item.messageCount || 0), 0);
            break;
          default:
            metricsObj[metric] = 0;
        }
      }
      
      results.push({
        dimensions: dimensionObj,
        metrics: metricsObj,
        timestamp: timeGranularity ? this.getTimeGrouping(groupData[0]?.timestamp, timeGranularity) : undefined
      });
    }
    
    return results;
  }

  private getTimeGrouping(timestamp: string, granularity: string): string {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    
    switch (granularity) {
      case 'hour':
        return date.toISOString().substring(0, 13) + ':00:00.000Z';
      case 'day':
        return date.toISOString().substring(0, 10) + 'T00:00:00.000Z';
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().substring(0, 10) + 'T00:00:00.000Z';
      case 'month':
        return date.toISOString().substring(0, 7) + '-01T00:00:00.000Z';
      default:
        return timestamp;
    }
  }
}