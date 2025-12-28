/**
 * Performance Tests for Large Dataset Scenarios
 * 
 * Tests system performance with realistic data volumes and concurrent access
 */

import { AdminAnalyticsProcessor } from '../../../lambda/admin-analytics';
import { AnalyticsService } from '../../../src/services/analytics-service';

// Mock services for performance testing
jest.mock('../../../src/services/dynamodb-service');
jest.mock('../../../src/services/cache-service');

describe('Large Dataset Performance Tests', () => {
  let processor: AdminAnalyticsProcessor;
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    processor = new AdminAnalyticsProcessor();
    analyticsService = new AnalyticsService();
    jest.clearAllMocks();
  });

  describe('Dashboard Metrics Performance', () => {
    /**
     * Test dashboard performance with large datasets
     */
    it('should handle large conversation datasets within 10 seconds', async () => {
      // Mock large dataset response
      const largeDataset = {
        conversationAnalytics: {
          totalConversations: 50000,
          conversationsByDate: Array.from({ length: 365 }, (_, i) => ({
            date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
            count: Math.floor(Math.random() * 200) + 50,
            languages: { en: Math.floor(Math.random() * 150) + 40, es: Math.floor(Math.random() * 50) + 10 }
          })),
          languageDistribution: { en: 35000, es: 15000 },
          unansweredPercentage: 12.5,
          averageConfidenceScore: 0.84
        },
        questionAnalytics: {
          topQuestions: Array.from({ length: 100 }, (_, i) => ({
            question: `Frequently asked question ${i + 1}?`,
            count: Math.floor(Math.random() * 500) + 100,
            category: `category-${i % 10}`,
            averageConfidence: Math.random() * 0.4 + 0.6
          })),
          questionsByCategory: {},
          totalQuestionsAnalyzed: 25000
        },
        escalationAnalytics: {
          topUnansweredQuestions: Array.from({ length: 50 }, (_, i) => ({
            question: `Unanswered question ${i + 1}?`,
            count: Math.floor(Math.random() * 100) + 20,
            category: `category-${i % 8}`,
            averageConfidence: Math.random() * 0.3 + 0.2,
            escalationRate: Math.random() * 30 + 10
          })),
          knowledgeGaps: [],
          improvementOpportunities: [],
          trendAnalysis: { totalUnansweredTrend: 'stable' as const, weeklyChangePercentage: 0, problematicCategories: [] }
        },
        realTimeMetrics: {
          liveConversations: { active: 25, total: 150, byLanguage: { en: 20, es: 5 } },
          activeUsers: { total: 45, new: 8, returning: 37 },
          escalations: { pending: 3, resolved: 12, total: 15 },
          systemPerformance: {
            responseTime: { p50: 450, p95: 1200, p99: 2500 },
            cpuUsage: 35.5,
            memoryUsage: 68.2
          },
          alerts: [],
          timestamp: new Date().toISOString(),
          activeConnections: 25,
          messagesLastHour: 180,
          escalationsToday: 8,
          systemLoad: 0.35,
          responseTime: 450
        },
        timestamp: new Date().toISOString()
      };

      // Mock the analytics service to return large dataset
      (processor as any).analyticsService = {
        getEnhancedDashboardMetrics: jest.fn().mockResolvedValue(largeDataset)
      };

      const startTime = Date.now();
      
      const result = await processor.getEnhancedDashboardMetrics({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.conversationAnalytics.totalConversations).toBe(50000);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    /**
     * Test memory usage with large datasets
     */
    it('should maintain reasonable memory usage with large datasets', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process multiple large requests
      const promises = Array.from({ length: 5 }, () => 
        processor.getEnhancedDashboardMetrics({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
      );

      await Promise.all(promises);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Concurrent Access Performance', () => {
    /**
     * Test concurrent request handling
     */
    it('should handle 20 concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, (_, i) => 
        processor.getEnhancedRealTimeMetrics()
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      
      // Calculate average response time per request
      const avgResponseTime = duration / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(1000); // Average < 1 second per request
    });

    /**
     * Test cache performance under load
     */
    it('should demonstrate cache effectiveness under load', async () => {
      // First request (cache miss)
      const firstStart = Date.now();
      await processor.getEnhancedRealTimeMetrics();
      const firstDuration = Date.now() - firstStart;

      // Second request (should be cached)
      const secondStart = Date.now();
      await processor.getEnhancedRealTimeMetrics();
      const secondDuration = Date.now() - secondStart;

      // Cached request should be significantly faster
      expect(secondDuration).toBeLessThan(firstDuration * 0.5);
    });
  });

  describe('Question Analysis Performance', () => {
    /**
     * Test FAQ analysis with large question datasets
     */
    it('should process 10,000 questions within 5 seconds', async () => {
      // Mock large question dataset
      const largeQuestionSet = Array.from({ length: 10000 }, (_, i) => ({
        date: '2024-01-01',
        originalQuestion: `Question ${i}?`,
        normalizedQuestion: `question ${i}`,
        category: `category-${i % 20}`,
        count: Math.floor(Math.random() * 10) + 1,
        totalConfidenceScore: Math.random() * 9,
        language: 'en'
      }));

      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: jest.fn().mockResolvedValue(largeQuestionSet),
        getQuestionsByCategory: jest.fn().mockResolvedValue([])
      });

      const startTime = Date.now();
      
      const result = await analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en',
        limit: 100
      });

      const duration = Date.now() - startTime;

      expect(result.topQuestions).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Stress Testing', () => {
    /**
     * Test system behavior under stress
     */
    it('should handle rapid successive requests without degradation', async () => {
      const requestCount = 50;
      const durations: number[] = [];

      for (let i = 0; i < requestCount; i++) {
        const start = Date.now();
        await processor.getSystemHealth();
        const duration = Date.now() - start;
        durations.push(duration);
      }

      // Calculate performance metrics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      expect(avgDuration).toBeLessThan(2000); // Average < 2 seconds
      expect(maxDuration).toBeLessThan(5000); // Max < 5 seconds
      
      // Performance should not degrade significantly over time
      const firstHalf = durations.slice(0, requestCount / 2);
      const secondHalf = durations.slice(requestCount / 2);
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      // Second half should not be more than 50% slower than first half
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5);
    });
  });
});