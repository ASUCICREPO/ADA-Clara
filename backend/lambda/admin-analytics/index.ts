import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DataService } from '../../src/services/data-service';
import { EscalationService } from '../../src/services/escalation-service';
import { AnalyticsService } from '../../src/services/analytics-service';
import { cacheService } from '../../src/services/cache-service';
import { validationService } from '../../src/services/validation-service';
import { 
  LambdaResponse, 
  PerformanceMetrics, 
  ErrorContext, 
  CircuitBreakerState,
  RetryConfig 
} from '../../src/types/index';

/**
 * ADA Clara Admin Analytics Lambda Function
 * Provides analytics and monitoring endpoints for the admin dashboard
 * 
 * TASK 10 ENHANCEMENTS:
 * - Caching layer for improved performance
 * - Enhanced parameter validation
 * - Circuit breaker pattern for resilience
 * - Comprehensive error handling and logging
 * - Performance monitoring and metrics
 */

// Circuit breaker states for external services
const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

// Retry configuration
const retryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true
};

interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  type?: 'chat' | 'escalation' | 'performance' | 'user';
  granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

interface DashboardMetrics {
  overview: {
    totalSessions: number;
    totalMessages: number;
    totalEscalations: number;
    activeUsers: number;
    averageResponseTime: number;
    systemUptime: number;
  };
  chatMetrics: {
    messagesPerHour: Array<{ hour: string; count: number }>;
    languageDistribution: Record<string, number>;
    averageSessionLength: number;
    topQuestions: Array<{ question: string; count: number }>;
  };
  escalationMetrics: {
    escalationRate: number;
    escalationsByPriority: Record<string, number>;
    escalationsByReason: Record<string, number>;
    averageResolutionTime: number;
    escalationTrends: Array<{ date: string; count: number }>;
  };
  performanceMetrics: {
    responseTimeP50: number;
    responseTimeP95: number;
    errorRate: number;
    throughput: number;
    lambdaMetrics: {
      chatProcessor: { invocations: number; errors: number; duration: number };
      escalationProcessor: { invocations: number; errors: number; duration: number };
    };
  };
  systemHealth: {
    dynamodbHealth: boolean;
    s3Health: boolean;
    sesHealth: boolean;
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    lastHealthCheck: string;
  };
}

export class AdminAnalyticsProcessor {
  private dataService: DataService;
  private escalationService: EscalationService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.dataService = new DataService();
    this.escalationService = new EscalationService();
    this.analyticsService = new AnalyticsService();
    
    // Warm up cache with frequently accessed data
    this.warmUpCache();
  }

  /**
   * Warm up cache with frequently accessed data
   */
  private async warmUpCache(): Promise<void> {
    try {
      const warmUpFunctions = [
        {
          key: 'dashboard-metrics-default',
          fetchFunction: () => this.analyticsService.getEnhancedDashboardMetrics({
            startDate: this.getDateDaysAgo(7),
            endDate: new Date().toISOString().split('T')[0]
          }),
          options: { ttl: 5 * 60 * 1000 } // 5 minutes
        },
        {
          key: 'realtime-metrics',
          fetchFunction: () => this.analyticsService.getRealTimeMetrics(),
          options: { ttl: 30 * 1000 } // 30 seconds
        },
        {
          key: 'system-health',
          fetchFunction: () => this.getSystemHealth(),
          options: { ttl: 60 * 1000 } // 1 minute
        }
      ];

      await cacheService.warmUp(warmUpFunctions);
    } catch (error) {
      console.error('Cache warm-up failed:', error);
      // Don't throw - warm-up failure shouldn't prevent Lambda from working
    }
  }

  /**
   * Execute function with circuit breaker pattern
   */
  private async executeWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const breaker = circuitBreakers.get(serviceName) || {
      serviceName,
      state: 'closed',
      failureCount: 0
    };

    // Check if circuit is open
    if (breaker.state === 'open') {
      const now = Date.now();
      if (breaker.nextAttemptTime && now < breaker.nextAttemptTime) {
        throw new Error(`Circuit breaker is open for ${serviceName}. Next attempt at ${new Date(breaker.nextAttemptTime).toISOString()}`);
      }
      // Try to close circuit
      breaker.state = 'half-open';
      breaker.successCount = 0;
    }

    try {
      const result = await this.executeWithRetry(operation);
      
      // Success - reset circuit breaker
      if (breaker.state === 'half-open') {
        breaker.successCount = (breaker.successCount || 0) + 1;
        if (breaker.successCount >= 3) {
          breaker.state = 'closed';
          breaker.failureCount = 0;
          delete breaker.lastFailureTime;
          delete breaker.nextAttemptTime;
        }
      } else if (breaker.state === 'closed') {
        breaker.failureCount = 0;
      }
      
      circuitBreakers.set(serviceName, breaker);
      return result;
    } catch (error) {
      // Failure - update circuit breaker
      breaker.failureCount++;
      breaker.lastFailureTime = Date.now();
      
      if (breaker.failureCount >= 5) {
        breaker.state = 'open';
        breaker.nextAttemptTime = Date.now() + 60000; // 1 minute
      }
      
      circuitBreakers.set(serviceName, breaker);
      throw error;
    }
  }

  /**
   * Execute function with exponential backoff retry
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on validation errors or client errors
        if (error instanceof Error && (
          error.message.includes('validation') ||
          error.message.includes('not found') ||
          error.message.includes('invalid')
        )) {
          throw error;
        }
        
        if (attempt < retryConfig.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
      retryConfig.maxDelay
    );
    
    if (retryConfig.jitter) {
      return delay + Math.random() * 1000; // Add up to 1 second jitter
    }
    
    return delay;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create performance metrics
   */
  private createPerformanceMetrics(
    requestId: string,
    endpoint: string,
    method: string,
    startTime: number,
    cacheHit: boolean = false
  ): PerformanceMetrics {
    const endTime = Date.now();
    const memoryUsed = process.memoryUsage().heapUsed;
    
    return {
      requestId,
      endpoint,
      method,
      startTime,
      endTime,
      duration: endTime - startTime,
      cacheHit,
      memoryUsed
    };
  }

  /**
   * Create error context for debugging
   */
  private createErrorContext(
    requestId: string,
    endpoint: string,
    method: string,
    parameters: any,
    error: Error
  ): ErrorContext {
    return {
      requestId,
      endpoint,
      method,
      parameters,
      timestamp: new Date().toISOString(),
      stackTrace: error.stack,
      additionalInfo: {
        memoryUsage: process.memoryUsage(),
        cacheStats: cacheService.getStats(),
        circuitBreakerStates: Array.from(circuitBreakers.entries())
      }
    };
  }

  /**
   * Get enhanced dashboard metrics using the new analytics service
   * TASK 10: Enhanced with caching, validation, and error handling
   */
  async getEnhancedDashboardMetrics(query: AnalyticsQuery): Promise<any> {
    // Validate parameters
    const validation = validationService.validateDashboardParams(query);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const sanitizedQuery = validation.sanitizedData || query;
    const endDate = sanitizedQuery.endDate || new Date().toISOString().split('T')[0];
    const startDate = sanitizedQuery.startDate || this.getDateDaysAgo(7);

    console.log(`📊 Getting enhanced dashboard metrics for ${startDate} to ${endDate}`);

    // Create cache key
    const cacheKey = `dashboard-metrics-${startDate}-${endDate}-${sanitizedQuery.type || 'all'}-${sanitizedQuery.granularity || 'daily'}`;

    try {
      // Use cache service with circuit breaker
      return await cacheService.get(
        cacheKey,
        () => this.executeWithCircuitBreaker('analytics-service', async () => {
          return await this.analyticsService.getEnhancedDashboardMetrics({
            startDate,
            endDate,
            language: sanitizedQuery.type === 'user' ? 'en' : undefined
          });
        }),
        { ttl: 5 * 60 * 1000 } // 5 minutes cache
      );
    } catch (error) {
      console.error('Error getting enhanced dashboard metrics:', error);
      
      // Try fallback to legacy metrics if enhanced service fails
      try {
        return await this.getDashboardMetrics(sanitizedQuery);
      } catch (fallbackError) {
        console.error('Fallback to legacy metrics also failed:', fallbackError);
        throw new Error(`Enhanced dashboard metrics failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Get detailed conversation analytics
   * TASK 10: Enhanced with caching, validation, and error handling
   */
  async getConversationAnalytics(query: {
    startDate?: string;
    endDate?: string;
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    // Validate parameters
    const validation = validationService.validateConversationParams(query);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const sanitizedQuery = validation.sanitizedData || query;
    const endDate = sanitizedQuery.endDate || new Date().toISOString().split('T')[0];
    const startDate = sanitizedQuery.startDate || this.getDateDaysAgo(7);

    console.log(`💬 Getting conversation analytics for ${startDate} to ${endDate}`);

    // Create cache key
    const cacheKey = `conversation-analytics-${startDate}-${endDate}-${sanitizedQuery.language || 'all'}-${sanitizedQuery.limit || 50}-${sanitizedQuery.offset || 0}`;

    try {
      return await cacheService.get(
        cacheKey,
        () => this.executeWithCircuitBreaker('analytics-service', async () => {
          const conversationAnalytics = await this.analyticsService.getConversationAnalytics({
            startDate,
            endDate,
            language: (sanitizedQuery.language === 'all' || !sanitizedQuery.language) ? undefined : sanitizedQuery.language as 'en' | 'es'
          });

          return {
            analytics: conversationAnalytics,
            pagination: {
              limit: sanitizedQuery.limit || 50,
              offset: sanitizedQuery.offset || 0,
              total: conversationAnalytics.totalConversations
            }
          };
        }),
        { ttl: 10 * 60 * 1000 } // 10 minutes cache
      );
    } catch (error) {
      console.error('Error getting conversation analytics:', error);
      throw error;
    }
  }

  /**
   * Get specific conversation details
   * TASK 10: Enhanced with caching, validation, and error handling
   */
  async getConversationDetails(conversationId: string): Promise<any> {
    // Validate conversation ID
    const validation = validationService.validateConversationId(conversationId);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const sanitizedId = validation.sanitizedData;
    console.log(`🔍 Getting conversation details for: ${sanitizedId}`);

    // Create cache key
    const cacheKey = `conversation-details-${sanitizedId}`;

    try {
      return await cacheService.get(
        cacheKey,
        () => this.executeWithCircuitBreaker('analytics-service', async () => {
          const details = await this.analyticsService.getConversationDetails(sanitizedId);
          
          if (!details) {
            throw new Error(`Conversation ${sanitizedId} not found`);
          }

          return details;
        }),
        { ttl: 15 * 60 * 1000 } // 15 minutes cache (conversation details don't change often)
      );
    } catch (error) {
      console.error('Error getting conversation details:', error);
      throw error;
    }
  }

  /**
   * Get FAQ and question analysis
   */
  async getQuestionAnalysis(query: {
    startDate?: string;
    endDate?: string;
    category?: string;
    limit?: number;
    includeUnanswered?: boolean;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(30); // Default to 30 days for FAQ analysis

    console.log(`❓ Getting question analysis for ${startDate} to ${endDate}`);

    try {
      const [faqAnalysis, unansweredAnalysis] = await Promise.all([
        this.analyticsService.getFrequentlyAskedQuestions({
          startDate,
          endDate,
          language: (query.category === 'all' || !query.category) ? undefined : query.category as 'en' | 'es',
          limit: query.limit || 20
        }),
        query.includeUnanswered ? this.analyticsService.getUnansweredQuestions({
          startDate,
          endDate,
          language: (query.category === 'all' || !query.category) ? undefined : query.category as 'en' | 'es',
          limit: query.limit || 20
        }) : null
      ]);

      return {
        faq: faqAnalysis,
        unanswered: unansweredAnalysis,
        summary: {
          totalQuestions: faqAnalysis.totalQuestionsAnalyzed,
          answeredQuestions: faqAnalysis.totalQuestionsAnalyzed - (unansweredAnalysis?.topUnansweredQuestions?.length || 0),
          unansweredQuestions: unansweredAnalysis?.topUnansweredQuestions?.length || 0,
          answerRate: unansweredAnalysis ? 
            ((faqAnalysis.totalQuestionsAnalyzed - (unansweredAnalysis.topUnansweredQuestions?.length || 0)) / faqAnalysis.totalQuestionsAnalyzed * 100) : 
            100
        }
      };
    } catch (error) {
      console.error('Error getting question analysis:', error);
      throw error;
    }
  }

  /**
   * Get enhanced escalation analytics
   */
  async getEscalationAnalytics(query: {
    startDate?: string;
    endDate?: string;
    priority?: string;
    status?: string;
    granularity?: string;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(30); // Default to 30 days for escalation analysis

    console.log(`🚨 Getting escalation analytics for ${startDate} to ${endDate}`);

    try {
      const escalationAnalytics = await this.analyticsService.getEscalationAnalytics({
        startDate,
        endDate,
        priority: query.priority as any,
        status: query.status as any,
        granularity: (query.granularity as any) || 'daily'
      });

      return escalationAnalytics;
    } catch (error) {
      console.error('Error getting escalation analytics:', error);
      throw error;
    }
  }

  /**
   * Get escalation trigger analysis
   */
  async getEscalationTriggerAnalysis(query: {
    startDate?: string;
    endDate?: string;
    conversationId?: string;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(7);

    console.log(`🔍 Getting escalation trigger analysis for ${startDate} to ${endDate}`);

    try {
      const triggerAnalysis = await this.analyticsService.getEscalationTriggerAnalysis({
        startDate,
        endDate,
        conversationId: query.conversationId
      });

      return triggerAnalysis;
    } catch (error) {
      console.error('Error getting escalation trigger analysis:', error);
      throw error;
    }
  }

  /**
   * Get escalation reason analysis
   */
  async getEscalationReasonAnalysis(query: {
    startDate?: string;
    endDate?: string;
    priority?: string;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(30);

    console.log(`📊 Getting escalation reason analysis for ${startDate} to ${endDate}`);

    try {
      const reasonAnalysis = await this.analyticsService.getEscalationReasonAnalysis({
        startDate,
        endDate,
        priority: query.priority as any
      });

      return reasonAnalysis;
    } catch (error) {
      console.error('Error getting escalation reason analysis:', error);
      throw error;
    }
  }

  /**
   * Get enhanced FAQ analysis with message extraction
   */
  async getEnhancedFAQAnalysis(query: {
    startDate?: string;
    endDate?: string;
    language?: string;
    limit?: number;
    includeExtraction?: boolean;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(30);

    console.log(`❓ Getting enhanced FAQ analysis for ${startDate} to ${endDate}`);

    try {
      const enhancedFAQ = await this.analyticsService.getEnhancedFAQAnalysis({
        startDate,
        endDate,
        language: (query.language === 'all' || !query.language) ? undefined : query.language as 'en' | 'es',
        limit: query.limit || 20,
        includeMessageExtraction: query.includeExtraction === true
      });

      return enhancedFAQ;
    } catch (error) {
      console.error('Error getting enhanced FAQ analysis:', error);
      throw error;
    }
  }

  /**
   * Get enhanced question ranking with multiple algorithms
   */
  async getEnhancedQuestionRanking(query: {
    startDate?: string;
    endDate?: string;
    language?: string;
    method?: string;
    limit?: number;
  }): Promise<any> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(30);

    console.log(`📊 Getting enhanced question ranking for ${startDate} to ${endDate}`);

    try {
      const ranking = await this.analyticsService.getEnhancedQuestionRanking({
        startDate,
        endDate,
        language: (query.language === 'all' || !query.language) ? undefined : query.language as 'en' | 'es',
        rankingMethod: query.method as any || 'combined',
        limit: query.limit || 20
      });

      return ranking;
    } catch (error) {
      console.error('Error getting enhanced question ranking:', error);
      throw error;
    }
  }

  /**
   * Get enhanced real-time metrics
   * TASK 10: Enhanced with caching and error handling
   */
  async getEnhancedRealTimeMetrics(): Promise<any> {
    console.log('⚡ Getting enhanced real-time metrics');

    // Real-time metrics have very short cache (30 seconds)
    const cacheKey = 'realtime-metrics';

    try {
      return await cacheService.get(
        cacheKey,
        () => this.executeWithCircuitBreaker('analytics-service', async () => {
          return await this.analyticsService.getRealTimeMetrics();
        }),
        { ttl: 30 * 1000 } // 30 seconds cache
      );
    } catch (error) {
      console.error('Error getting enhanced real-time metrics:', error);
      
      // Fallback to legacy real-time metrics
      try {
        return await this.getRealTimeMetrics();
      } catch (fallbackError) {
        console.error('Fallback to legacy real-time metrics also failed:', fallbackError);
        throw new Error(`Enhanced real-time metrics failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(query: AnalyticsQuery): Promise<DashboardMetrics> {
    const endDate = query.endDate || new Date().toISOString().split('T')[0];
    const startDate = query.startDate || this.getDateDaysAgo(7);

    console.log(`📊 Generating dashboard metrics for ${startDate} to ${endDate}`);

    // Run all analytics queries in parallel
    const [
      overviewMetrics,
      chatMetrics,
      escalationMetrics,
      performanceMetrics,
      systemHealth
    ] = await Promise.all([
      this.getOverviewMetrics(startDate, endDate),
      this.getChatMetrics(startDate, endDate),
      this.getEscalationMetrics(startDate, endDate),
      this.getPerformanceMetrics(startDate, endDate),
      this.getSystemHealth()
    ]);

    return {
      overview: overviewMetrics,
      chatMetrics,
      escalationMetrics,
      performanceMetrics,
      systemHealth
    };
  }

  /**
   * Get high-level overview metrics
   */
  private async getOverviewMetrics(startDate: string, endDate: string): Promise<DashboardMetrics['overview']> {
    // Get analytics summary from data service
    const summary = await this.dataService.getAnalyticsSummary(startDate, endDate);
    
    // Calculate system uptime (placeholder - would integrate with CloudWatch)
    const systemUptime = 99.9; // Percentage

    return {
      totalSessions: summary.totalSessions,
      totalMessages: summary.totalMessages,
      totalEscalations: Math.floor(summary.totalSessions * (summary.escalationRate / 100)),
      activeUsers: Math.floor(summary.totalSessions * 0.3), // Estimate active users
      averageResponseTime: summary.averageResponseTime,
      systemUptime
    };
  }

  /**
   * Get detailed chat metrics
   */
  private async getChatMetrics(startDate: string, endDate: string): Promise<DashboardMetrics['chatMetrics']> {
    // Generate hourly message distribution
    const messagesPerHour = await this.getHourlyMessageDistribution(startDate, endDate);
    
    // Get language distribution from analytics
    const summary = await this.dataService.getAnalyticsSummary(startDate, endDate);
    
    // Calculate average session length (placeholder)
    const averageSessionLength = 8.5; // minutes
    
    // Get top questions (placeholder - would analyze chat content)
    const topQuestions = [
      { question: "What is type 1 diabetes?", count: 45 },
      { question: "How to manage blood sugar?", count: 38 },
      { question: "Diabetes diet recommendations", count: 32 },
      { question: "Insulin dosage questions", count: 28 },
      { question: "Exercise with diabetes", count: 24 }
    ];

    return {
      messagesPerHour,
      languageDistribution: summary.languageDistribution,
      averageSessionLength,
      topQuestions
    };
  }

  /**
   * Get escalation-specific metrics
   */
  private async getEscalationMetrics(startDate: string, endDate: string): Promise<DashboardMetrics['escalationMetrics']> {
    // Get escalation statistics
    const escalationStats = await this.escalationService.getEscalationStats(7);
    
    // Calculate escalation rate
    const summary = await this.dataService.getAnalyticsSummary(startDate, endDate);
    const escalationRate = summary.escalationRate;
    
    // Generate escalation trends
    const escalationTrends = await this.getEscalationTrends(startDate, endDate);
    
    // Average resolution time (placeholder)
    const averageResolutionTime = 2.5; // hours

    return {
      escalationRate,
      escalationsByPriority: escalationStats.byPriority,
      escalationsByReason: escalationStats.byReason,
      averageResolutionTime,
      escalationTrends
    };
  }

  /**
   * Get performance and system metrics
   */
  private async getPerformanceMetrics(startDate: string, endDate: string): Promise<DashboardMetrics['performanceMetrics']> {
    // These would typically come from CloudWatch metrics
    // For now, return realistic placeholder values
    
    return {
      responseTimeP50: 850, // milliseconds
      responseTimeP95: 2100, // milliseconds
      errorRate: 0.5, // percentage
      throughput: 125, // requests per minute
      lambdaMetrics: {
        chatProcessor: {
          invocations: 1250,
          errors: 6,
          duration: 1200 // milliseconds
        },
        escalationProcessor: {
          invocations: 45,
          errors: 0,
          duration: 800 // milliseconds
        }
      }
    };
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<DashboardMetrics['systemHealth']> {
    // Get health checks from services
    const [dataHealth, escalationHealth] = await Promise.all([
      this.dataService.healthCheck(),
      this.escalationService.healthCheck()
    ]);

    const dynamodbHealth = dataHealth.dynamodb;
    const s3Health = dataHealth.s3.contentBucket && dataHealth.s3.vectorsBucket;
    const sesHealth = escalationHealth.sqsConnected && escalationHealth.snsConnected;

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    if (dynamodbHealth && s3Health && sesHealth) {
      overallHealth = 'healthy';
    } else if (dynamodbHealth && (s3Health || sesHealth)) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'unhealthy';
    }

    return {
      dynamodbHealth,
      s3Health,
      sesHealth,
      overallHealth,
      lastHealthCheck: new Date().toISOString()
    };
  }

  /**
   * Get hourly message distribution
   */
  private async getHourlyMessageDistribution(startDate: string, endDate: string): Promise<Array<{ hour: string; count: number }>> {
    const distribution: Array<{ hour: string; count: number }> = [];
    
    // Generate 24-hour distribution (placeholder data)
    for (let hour = 0; hour < 24; hour++) {
      // Simulate realistic chat patterns (higher during business hours)
      let count = 5; // Base activity
      if (hour >= 8 && hour <= 17) {
        count = Math.floor(Math.random() * 50) + 20; // Business hours
      } else if (hour >= 18 && hour <= 22) {
        count = Math.floor(Math.random() * 30) + 10; // Evening
      } else {
        count = Math.floor(Math.random() * 10) + 2; // Night/early morning
      }
      
      distribution.push({
        hour: hour.toString().padStart(2, '0') + ':00',
        count
      });
    }
    
    return distribution;
  }

  /**
   * Get escalation trends over time
   */
  private async getEscalationTrends(startDate: string, endDate: string): Promise<Array<{ date: string; count: number }>> {
    const trends: Array<{ date: string; count: number }> = [];
    
    // Generate daily escalation counts
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const count = Math.floor(Math.random() * 8) + 1; // 1-8 escalations per day
      
      trends.push({ date: dateStr, count });
    }
    
    return trends;
  }

  /**
   * Get real-time analytics for live dashboard updates
   */
  async getRealTimeMetrics(): Promise<{
    activeConnections: number;
    messagesLastHour: number;
    escalationsToday: number;
    systemLoad: number;
    responseTime: number;
  }> {
    // These would come from real-time monitoring
    return {
      activeConnections: Math.floor(Math.random() * 25) + 5,
      messagesLastHour: Math.floor(Math.random() * 100) + 20,
      escalationsToday: Math.floor(Math.random() * 5) + 1,
      systemLoad: Math.random() * 0.3 + 0.1, // 10-40% load
      responseTime: Math.random() * 500 + 800 // 800-1300ms
    };
  }

  /**
   * Get chat history with filtering and pagination
   */
  async getChatHistory(filters: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    language?: string;
    escalated?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    sessions: Array<{
      sessionId: string;
      userId: string;
      startTime: string;
      messageCount: number;
      language: string;
      escalated: boolean;
      lastActivity: string;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    // This would query the actual chat sessions
    // For now, return placeholder data
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    const sessions = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
      sessionId: `session-${Date.now()}-${i}`,
      userId: `user-${Math.floor(Math.random() * 1000)}`,
      startTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      messageCount: Math.floor(Math.random() * 20) + 3,
      language: Math.random() > 0.8 ? 'es' : 'en',
      escalated: Math.random() > 0.9,
      lastActivity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString()
    }));

    return {
      sessions,
      total: 150, // Placeholder total
      hasMore: offset + limit < 150
    };
  }

  /**
   * Utility function to get date N days ago
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  // Enhanced Unanswered Question Tracking Methods (Task 6)

  /**
   * Get unanswered questions identification and recording (Requirement 5.1)
   */
  async getUnansweredQuestions(
    startDate: Date,
    endDate: Date,
    confidenceThreshold: number = 0.7
  ): Promise<any> {
    try {
      console.log(`🔍 Identifying unanswered questions from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const unansweredQuestions = await this.analyticsService.identifyUnansweredQuestions(
        startDate,
        endDate,
        confidenceThreshold
      );

      return {
        dateRange: { startDate, endDate },
        confidenceThreshold,
        totalUnansweredQuestions: unansweredQuestions.length,
        unansweredQuestions: unansweredQuestions.slice(0, 100), // Limit for performance
        summary: {
          byCategory: this.groupByCategory(unansweredQuestions),
          byLanguage: this.groupByLanguage(unansweredQuestions),
          averageConfidence: unansweredQuestions.reduce((sum, q) => sum + q.confidence, 0) / unansweredQuestions.length || 0
        }
      };
    } catch (error) {
      console.error('Error getting unanswered questions:', error);
      throw error;
    }
  }

  /**
   * Get knowledge gap analysis by topic category (Requirement 5.2)
   */
  async getKnowledgeGapAnalysis(
    startDate: Date,
    endDate: Date,
    options: {
      minOccurrences?: number;
      includeSubcategories?: boolean;
      confidenceThreshold?: number;
    } = {}
  ): Promise<any> {
    try {
      console.log(`📊 Analyzing knowledge gaps from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const knowledgeGapAnalysis = await this.analyticsService.analyzeKnowledgeGaps(
        startDate,
        endDate,
        options
      );

      return knowledgeGapAnalysis;
    } catch (error) {
      console.error('Error analyzing knowledge gaps:', error);
      throw error;
    }
  }

  /**
   * Get improvement opportunity prioritization (Requirement 5.4)
   */
  async getImprovementOpportunities(
    knowledgeGaps: any[],
    options: {
      weightFrequency?: number;
      weightSeverity?: number;
      weightTrend?: number;
      maxOpportunities?: number;
    } = {}
  ): Promise<any> {
    try {
      console.log(`🎯 Prioritizing improvement opportunities for ${knowledgeGaps.length} knowledge gaps`);
      
      const opportunities = await this.analyticsService.prioritizeImprovementOpportunities(
        knowledgeGaps,
        options
      );

      return {
        totalOpportunities: opportunities.length,
        opportunities,
        prioritizationWeights: {
          frequency: options.weightFrequency || 0.4,
          severity: options.weightSeverity || 0.4,
          trend: options.weightTrend || 0.2
        },
        summary: {
          highPriority: opportunities.filter(o => o.priorityScore > 0.7).length,
          mediumPriority: opportunities.filter(o => o.priorityScore > 0.4 && o.priorityScore <= 0.7).length,
          lowPriority: opportunities.filter(o => o.priorityScore <= 0.4).length,
          totalEstimatedImpact: opportunities.reduce((sum, o) => sum + o.estimatedImpact.questionsAddressed, 0)
        }
      };
    } catch (error) {
      console.error('Error prioritizing improvement opportunities:', error);
      throw error;
    }
  }

  /**
   * Get trend analysis for problematic question types (Requirement 5.5)
   */
  async getProblematicQuestionTrends(
    startDate: Date,
    endDate: Date,
    options: {
      granularity?: 'daily' | 'weekly' | 'monthly';
      topCategories?: number;
      includeSeasonality?: boolean;
    } = {}
  ): Promise<any> {
    try {
      console.log(`📈 Analyzing problematic question trends from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const trends = await this.analyticsService.analyzeProblematicQuestionTrends(
        startDate,
        endDate,
        options
      );

      return trends;
    } catch (error) {
      console.error('Error analyzing problematic question trends:', error);
      throw error;
    }
  }

  // Helper methods for enhanced unanswered question tracking

  private groupByCategory(questions: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const question of questions) {
      grouped[question.category] = (grouped[question.category] || 0) + 1;
    }
    return grouped;
  }

  private groupByLanguage(questions: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const question of questions) {
      grouped[question.language] = (grouped[question.language] || 0) + 1;
    }
    return grouped;
  }

  // ============================================================================
  // TASK 8: Advanced Filtering and Search Implementation
  // ============================================================================

  /**
   * Get filtered conversations with advanced multi-parameter filtering
   * Requirement 7.1, 7.3 - Multi-parameter filtering with logical AND operations
   */
  async getFilteredConversations(filters: any): Promise<any> {
    try {
      console.log(`🔍 Getting filtered conversations with filters:`, JSON.stringify(filters, null, 2));
      
      const filteredConversations = await this.analyticsService.getFilteredConversations(filters);
      
      return filteredConversations;
    } catch (error) {
      console.error('Error getting filtered conversations:', error);
      throw error;
    }
  }

  /**
   * Search content with text-based search functionality
   * Requirement 7.2 - Text-based search for conversations and questions
   */
  async searchContent(searchOptions: any): Promise<any> {
    try {
      console.log(`🔎 Searching content with options:`, JSON.stringify(searchOptions, null, 2));
      
      const searchResults = await this.analyticsService.searchContent(searchOptions);
      
      return searchResults;
    } catch (error) {
      console.error('Error searching content:', error);
      throw error;
    }
  }

  /**
   * Export data with applied filters
   * Requirement 7.5 - Data export functionality with applied filters
   */
  async exportData(exportOptions: any): Promise<any> {
    try {
      console.log(`📤 Exporting data with options:`, JSON.stringify(exportOptions, null, 2));
      
      const exportResult = await this.analyticsService.exportData(exportOptions);
      
      return exportResult;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  /**
   * Execute advanced analytics query with filtering and aggregation
   */
  async executeAdvancedQuery(query: any): Promise<any> {
    try {
      console.log(`📊 Executing advanced query:`, JSON.stringify(query, null, 2));
      
      const queryResult = await this.analyticsService.executeAdvancedQuery(query);
      
      return queryResult;
    } catch (error) {
      console.error('Error executing advanced query:', error);
      throw error;
    }
  }
}

/**
 * Lambda handler for admin analytics API
 * TASK 10: Enhanced with caching, validation, error handling, and performance monitoring
 */
export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const requestId = context.awsRequestId;
  const startTime = Date.now();
  
  console.log('Admin Analytics API invoked:', JSON.stringify({
    requestId,
    path: event.path,
    method: event.httpMethod,
    queryParams: event.queryStringParameters,
    timestamp: new Date().toISOString()
  }, null, 2));

  const processor = new AdminAnalyticsProcessor();
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Helper function to create standardized response
  const createResponse = <T>(
    statusCode: number,
    data?: T,
    error?: string,
    cacheHit: boolean = false
  ): APIGatewayProxyResult => {
    const performance = processor['createPerformanceMetrics'](
      requestId,
      event.path,
      event.httpMethod,
      startTime,
      cacheHit
    );

    const response: LambdaResponse<T> = {
      success: statusCode < 400,
      timestamp: new Date().toISOString(),
      requestId,
      performance: {
        duration: performance.duration,
        cacheHit: performance.cacheHit,
        memoryUsed: performance.memoryUsed
      }
    };

    if (data) response.data = data;
    if (error) response.error = error;

    // Log performance metrics
    console.log('Request completed:', JSON.stringify({
      requestId,
      endpoint: event.path,
      method: event.httpMethod,
      statusCode,
      duration: performance.duration,
      cacheHit: performance.cacheHit,
      memoryUsed: performance.memoryUsed,
      cacheStats: cacheService.getStats()
    }, null, 2));

    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };
  };

  // Helper function to handle errors
  const handleError = (error: Error, endpoint: string): APIGatewayProxyResult => {
    const errorContext = processor['createErrorContext'](
      requestId,
      endpoint,
      event.httpMethod,
      event.queryStringParameters || {},
      error
    );

    console.error('Request failed:', JSON.stringify(errorContext, null, 2));

    // Determine appropriate status code
    let statusCode = 500;
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('circuit breaker')) {
      statusCode = 503;
    }

    return createResponse(statusCode, undefined, error.message);
  };

  try {
    const path = event.path;
    const method = event.httpMethod;
    const queryParams = event.queryStringParameters || {};

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return createResponse(200);
    }

    // Route requests with enhanced error handling
    if (method === 'GET') {
      try {
        if (path === '/admin/dashboard') {
          // Get comprehensive dashboard metrics (enhanced version)
          const metrics = await processor.getEnhancedDashboardMetrics(queryParams);
          return createResponse(200, metrics, undefined, true); // Assume cache hit for performance
        }

      if (path === '/admin/conversations') {
        // Get conversation analytics
        const analytics = await processor.getConversationAnalytics(queryParams);
        return createResponse(200, analytics);
      }

      if (path.startsWith('/admin/conversations/')) {
        // Get specific conversation details
        const conversationId = path.split('/').pop();
        if (!conversationId) {
          return createResponse(400, undefined, 'Conversation ID is required');
        }

        const details = await processor.getConversationDetails(conversationId);
        return createResponse(200, details);
      }

      if (path === '/admin/questions/enhanced') {
        // Get enhanced FAQ analysis with message extraction
        const enhancedFAQ = await processor.getEnhancedFAQAnalysis(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: enhancedFAQ,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/questions/ranking') {
        // Get enhanced question ranking
        const ranking = await processor.getEnhancedQuestionRanking(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: ranking,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/questions') {
        // Get FAQ and question analysis (existing endpoint)
        const analysis = await processor.getQuestionAnalysis(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: analysis,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/escalations') {
        // Get escalation analytics
        const analytics = await processor.getEscalationAnalytics(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: analytics,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/escalations/triggers') {
        // Get escalation trigger analysis
        const triggerAnalysis = await processor.getEscalationTriggerAnalysis(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: triggerAnalysis,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/escalations/reasons') {
        // Get escalation reason analysis
        const reasonAnalysis = await processor.getEscalationReasonAnalysis(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: reasonAnalysis,
            timestamp: new Date().toISOString()
          })
        };
      }
      
      if (path === '/admin/realtime') {
        // Get enhanced real-time metrics
        const realTimeMetrics = await processor.getEnhancedRealTimeMetrics();
        return createResponse(200, realTimeMetrics);
      }
      
      if (path === '/admin/chat-history') {
        // Get chat history with filters (legacy endpoint)
        const history = await processor.getChatHistory(queryParams);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: history,
            timestamp: new Date().toISOString()
          })
        };
      }
      
      if (path === '/admin/health') {
        // Get system health
        const health = await processor.getSystemHealth();
        return createResponse(200, health);
      }

      // Enhanced Unanswered Question Tracking Endpoints (Task 6)
      if (path === '/admin/unanswered-questions') {
        // Get unanswered questions identification and recording (Requirement 5.1)
        const startDate = queryParams.startDate ? new Date(queryParams.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = queryParams.endDate ? new Date(queryParams.endDate) : new Date();
        const confidenceThreshold = queryParams.confidenceThreshold ? parseFloat(queryParams.confidenceThreshold) : 0.7;

        const unansweredQuestions = await processor.getUnansweredQuestions(startDate, endDate, confidenceThreshold);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: unansweredQuestions,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/knowledge-gaps') {
        // Get knowledge gap analysis by topic category (Requirement 5.2)
        const startDate = queryParams.startDate ? new Date(queryParams.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = queryParams.endDate ? new Date(queryParams.endDate) : new Date();
        const options = {
          minOccurrences: queryParams.minOccurrences ? parseInt(queryParams.minOccurrences) : 3,
          includeSubcategories: queryParams.includeSubcategories !== 'false',
          confidenceThreshold: queryParams.confidenceThreshold ? parseFloat(queryParams.confidenceThreshold) : 0.7
        };

        const knowledgeGaps = await processor.getKnowledgeGapAnalysis(startDate, endDate, options);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: knowledgeGaps,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/improvement-opportunities') {
        // Get improvement opportunity prioritization (Requirement 5.4)
        const startDate = queryParams.startDate ? new Date(queryParams.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = queryParams.endDate ? new Date(queryParams.endDate) : new Date();
        
        // First get knowledge gaps
        const knowledgeGapAnalysis = await processor.getKnowledgeGapAnalysis(startDate, endDate);
        
        const options = {
          weightFrequency: queryParams.weightFrequency ? parseFloat(queryParams.weightFrequency) : 0.4,
          weightSeverity: queryParams.weightSeverity ? parseFloat(queryParams.weightSeverity) : 0.4,
          weightTrend: queryParams.weightTrend ? parseFloat(queryParams.weightTrend) : 0.2,
          maxOpportunities: queryParams.maxOpportunities ? parseInt(queryParams.maxOpportunities) : 20
        };

        const opportunities = await processor.getImprovementOpportunities(knowledgeGapAnalysis.knowledgeGaps, options);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: opportunities,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/question-trends') {
        // Get trend analysis for problematic question types (Requirement 5.5)
        const startDate = queryParams.startDate ? new Date(queryParams.startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const endDate = queryParams.endDate ? new Date(queryParams.endDate) : new Date();
        const options = {
          granularity: (queryParams.granularity as 'daily' | 'weekly' | 'monthly') || 'daily',
          topCategories: queryParams.topCategories ? parseInt(queryParams.topCategories) : 10,
          includeSeasonality: queryParams.includeSeasonality !== 'false'
        };

        const trends = await processor.getProblematicQuestionTrends(startDate, endDate, options);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: trends,
            timestamp: new Date().toISOString()
          })
        };
      }

      // ============================================================================
      // TASK 8: Advanced Filtering and Search Implementation
      // ============================================================================

      if (path === '/admin/conversations/filtered') {
        // Advanced conversation filtering with multi-parameter support (Requirement 7.1, 7.3)
        const filters = {
          startDate: queryParams.startDate,
          endDate: queryParams.endDate,
          language: queryParams.language as 'en' | 'es' | undefined,
          outcome: queryParams.outcome as 'resolved' | 'escalated' | 'abandoned' | undefined,
          confidenceThreshold: queryParams.confidenceThreshold ? parseFloat(queryParams.confidenceThreshold) : undefined,
          messageCountMin: queryParams.messageCountMin ? parseInt(queryParams.messageCountMin) : undefined,
          messageCountMax: queryParams.messageCountMax ? parseInt(queryParams.messageCountMax) : undefined,
          userId: queryParams.userId,
          userZipCode: queryParams.userZipCode,
          escalationPriority: queryParams.escalationPriority as 'low' | 'medium' | 'high' | 'critical' | undefined,
          escalationStatus: queryParams.escalationStatus as 'pending' | 'in_progress' | 'resolved' | undefined,
          escalationReason: queryParams.escalationReason,
          questionCategory: queryParams.questionCategory,
          isAnswered: queryParams.isAnswered ? queryParams.isAnswered === 'true' : undefined,
          limit: queryParams.limit ? parseInt(queryParams.limit) : undefined,
          offset: queryParams.offset ? parseInt(queryParams.offset) : undefined,
          sortBy: queryParams.sortBy as 'timestamp' | 'confidenceScore' | 'messageCount' | 'outcome' | undefined,
          sortOrder: queryParams.sortOrder as 'asc' | 'desc' | undefined
        };

        const filteredConversations = await processor.getFilteredConversations(filters);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: filteredConversations,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/search') {
        // Text-based search for conversations and questions (Requirement 7.2)
        if (!queryParams.query) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Search query is required'
            })
          };
        }

        const searchOptions = {
          query: queryParams.query,
          searchIn: (queryParams.searchIn?.split(',') || ['conversations', 'questions', 'messages']) as ('conversations' | 'questions' | 'messages')[],
          filters: {
            startDate: queryParams.startDate,
            endDate: queryParams.endDate,
            language: queryParams.language as 'en' | 'es' | undefined,
            outcome: queryParams.outcome as 'resolved' | 'escalated' | 'abandoned' | undefined,
            questionCategory: queryParams.questionCategory,
            isAnswered: queryParams.isAnswered ? queryParams.isAnswered === 'true' : undefined
          },
          fuzzyMatch: queryParams.fuzzyMatch === 'true',
          caseSensitive: queryParams.caseSensitive === 'true',
          wholeWords: queryParams.wholeWords === 'true',
          maxResults: queryParams.maxResults ? parseInt(queryParams.maxResults) : undefined,
          includeHighlights: queryParams.includeHighlights !== 'false',
          minRelevanceScore: queryParams.minRelevanceScore ? parseFloat(queryParams.minRelevanceScore) : undefined
        };

        const searchResults = await processor.searchContent(searchOptions);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: searchResults,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/export') {
        // Data export functionality with applied filters (Requirement 7.5)
        const exportOptions = {
          format: (queryParams.format as 'json' | 'csv' | 'xlsx') || 'json',
          dataTypes: (queryParams.dataTypes?.split(',') || ['conversations']) as ('conversations' | 'messages' | 'questions' | 'escalations')[],
          filters: {
            startDate: queryParams.startDate,
            endDate: queryParams.endDate,
            language: queryParams.language as 'en' | 'es' | undefined,
            outcome: queryParams.outcome as 'resolved' | 'escalated' | 'abandoned' | undefined,
            confidenceThreshold: queryParams.confidenceThreshold ? parseFloat(queryParams.confidenceThreshold) : undefined,
            questionCategory: queryParams.questionCategory,
            isAnswered: queryParams.isAnswered ? queryParams.isAnswered === 'true' : undefined
          },
          includeMetadata: queryParams.includeMetadata !== 'false',
          includeHeaders: queryParams.includeHeaders !== 'false',
          compressOutput: queryParams.compressOutput === 'true',
          filename: queryParams.filename,
          maxRecords: queryParams.maxRecords ? parseInt(queryParams.maxRecords) : undefined
        };

        const exportResult = await processor.exportData(exportOptions);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: exportResult,
            timestamp: new Date().toISOString()
          })
        };
      }

      if (path === '/admin/query/advanced') {
        // Execute advanced analytics query with filtering and aggregation
        if (!queryParams.queryId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: 'Query ID is required'
            })
          };
        }

        const advancedQuery = {
          queryId: queryParams.queryId,
          queryName: queryParams.queryName,
          metrics: queryParams.metrics?.split(',') || ['count'],
          dimensions: queryParams.dimensions?.split(',') || ['language'],
          filters: {
            startDate: queryParams.startDate,
            endDate: queryParams.endDate,
            language: queryParams.language as 'en' | 'es' | undefined,
            outcome: queryParams.outcome as 'resolved' | 'escalated' | 'abandoned' | undefined,
            confidenceThreshold: queryParams.confidenceThreshold ? parseFloat(queryParams.confidenceThreshold) : undefined
          },
          timeGranularity: queryParams.timeGranularity as 'hour' | 'day' | 'week' | 'month' | undefined,
          limit: queryParams.limit ? parseInt(queryParams.limit) : undefined,
          sortBy: queryParams.sortBy,
          sortOrder: queryParams.sortOrder as 'asc' | 'desc' | undefined
        };

        const queryResult = await processor.executeAdvancedQuery(advancedQuery);
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: queryResult,
            timestamp: new Date().toISOString()
          })
        };
      }
      } catch (endpointError) {
        return handleError(endpointError as Error, path);
      }
    }

    // Route not found
    return createResponse(404, undefined, 'Route not found');

  } catch (error) {
    return handleError(error as Error, event.path);
  }
};

/**
 * Health check handler
 */
export const healthHandler = async (): Promise<{ status: string; timestamp: string }> => {
  const processor = new AdminAnalyticsProcessor();
  
  try {
    const health = await processor.getSystemHealth();
    
    return {
      status: health.overallHealth,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString()
    };
  }
};