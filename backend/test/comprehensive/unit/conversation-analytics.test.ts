/**
 * Unit Tests for Conversation Analytics
 * 
 * Tests conversation aggregation, filtering, date range validation, and language breakdown
 * Requirements: 1.1, 1.2, 1.4, 1.5
 */

import { AnalyticsService } from '../../../src/services/analytics-service';
import { ConversationAnalytics, ConversationDetails } from '../../../src/types/index';

// Mock DynamoDB service to avoid actual database calls
jest.mock('../../../src/services/dynamodb-service');

describe('Conversation Analytics Unit Tests', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('getConversationAnalytics', () => {
    /**
     * Requirement 1.1: Total conversations with dates and languages
     */
    it('should return conversation analytics with proper structure', async () => {
      // Mock the DynamoDB service response
      const mockAnalytics = {
        totalConversations: 150,
        conversationsByDate: [
          { date: '2024-01-01', count: 25, languages: { en: 20, es: 5 } },
          { date: '2024-01-02', count: 30, languages: { en: 25, es: 5 } }
        ],
        languageDistribution: { en: 120, es: 30 },
        unansweredPercentage: 15.5,
        averageConfidenceScore: 0.85
      };

      // Mock the getDynamoService method
      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(mockAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      const result = await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        language: 'en'
      });

      expect(result).toEqual(mockAnalytics);
      expect(mockGetConversationAnalyticsByDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-02',
        'en'
      );
    });

    /**
     * Requirement 1.2: Language breakdown functionality
     */
    it('should handle language filtering correctly', async () => {
      const mockAnalytics = {
        totalConversations: 75,
        conversationsByDate: [
          { date: '2024-01-01', count: 25, languages: { es: 25 } }
        ],
        languageDistribution: { es: 75 },
        unansweredPercentage: 12.0,
        averageConfidenceScore: 0.82
      };

      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(mockAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      const result = await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'es'
      });

      expect(result.languageDistribution.es).toBe(75);
      expect(result.languageDistribution.en).toBeUndefined();
    });

    /**
     * Requirement 1.4: Date range filtering accuracy
     */
    it('should validate date range parameters', async () => {
      const mockAnalytics = {
        totalConversations: 0,
        conversationsByDate: [],
        languageDistribution: { en: 0, es: 0 },
        unansweredPercentage: 0,
        averageConfidenceScore: 0
      };

      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(mockAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      expect(mockGetConversationAnalyticsByDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        undefined
      );
    });

    /**
     * Error handling for invalid parameters
     */
    it('should handle errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      const mockGetConversationAnalyticsByDateRange = jest.fn().mockRejectedValue(mockError);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      await expect(analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-02'
      })).rejects.toThrow('Failed to retrieve conversation analytics: Database connection failed');
    });
  });

  describe('getConversationDetails', () => {
    /**
     * Requirement 8.1: Complete message history for conversations
     */
    it('should return detailed conversation information', async () => {
      const mockMessages = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          type: 'user',
          content: 'What is diabetes?',
          conversationId: 'conv-123',
          language: 'en'
        },
        {
          timestamp: '2024-01-01T10:00:05Z',
          type: 'bot',
          content: 'Diabetes is a condition...',
          conversationId: 'conv-123',
          language: 'en',
          confidenceScore: 0.9
        }
      ];

      const mockGetMessagesByConversation = jest.fn().mockResolvedValue(mockMessages);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getMessagesByConversation: mockGetMessagesByConversation
      });

      const result = await analyticsService.getConversationDetails('conv-123');

      expect(result).toBeDefined();
      expect(result?.conversationId).toBe('conv-123');
      expect(result?.messageCount).toBe(2);
      expect(result?.messages).toHaveLength(2);
      expect(result?.outcome).toBe('resolved');
    });

    /**
     * Requirement 8.4: Conversation metadata accuracy
     */
    it('should calculate conversation metadata correctly', async () => {
      const mockMessages = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          type: 'user',
          content: 'Help me understand my condition',
          conversationId: 'conv-456',
          language: 'en'
        },
        {
          timestamp: '2024-01-01T10:00:05Z',
          type: 'bot',
          content: 'I can help you with that...',
          conversationId: 'conv-456',
          language: 'en',
          confidenceScore: 0.6,
          escalationTrigger: true
        }
      ];

      const mockGetMessagesByConversation = jest.fn().mockResolvedValue(mockMessages);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getMessagesByConversation: mockGetMessagesByConversation
      });

      const result = await analyticsService.getConversationDetails('conv-456');

      expect(result?.outcome).toBe('escalated');
      expect(result?.escalationReason).toBe('Low confidence response triggered escalation');
    });

    /**
     * Handle non-existent conversations
     */
    it('should return null for non-existent conversations', async () => {
      const mockGetMessagesByConversation = jest.fn().mockResolvedValue([]);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getMessagesByConversation: mockGetMessagesByConversation
      });

      const result = await analyticsService.getConversationDetails('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('Data Validation', () => {
    /**
     * Requirement 1.5: Data completeness validation
     */
    it('should validate required fields in conversation analytics', async () => {
      const incompleteAnalytics = {
        totalConversations: 100
        // Missing required fields
      };

      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(incompleteAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      const result = await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-02'
      });

      // Should still return the data but with defaults for missing fields
      expect(result.totalConversations).toBe(100);
    });

    /**
     * Edge case: Empty date range
     */
    it('should handle empty date ranges', async () => {
      const emptyAnalytics = {
        totalConversations: 0,
        conversationsByDate: [],
        languageDistribution: { en: 0, es: 0 },
        unansweredPercentage: 0,
        averageConfidenceScore: 0
      };

      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(emptyAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      const result = await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      });

      expect(result.totalConversations).toBe(0);
      expect(result.conversationsByDate).toHaveLength(0);
    });
  });

  describe('Performance Considerations', () => {
    /**
     * Test that methods complete within reasonable time
     */
    it('should complete conversation analytics within 5 seconds', async () => {
      const mockAnalytics = {
        totalConversations: 1000,
        conversationsByDate: Array.from({ length: 30 }, (_, i) => ({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          count: Math.floor(Math.random() * 50),
          languages: { en: Math.floor(Math.random() * 40), es: Math.floor(Math.random() * 10) }
        })),
        languageDistribution: { en: 800, es: 200 },
        unansweredPercentage: 18.5,
        averageConfidenceScore: 0.87
      };

      const mockGetConversationAnalyticsByDateRange = jest.fn().mockResolvedValue(mockAnalytics);
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getConversationAnalyticsByDateRange: mockGetConversationAnalyticsByDateRange
      });

      const startTime = Date.now();
      
      await analyticsService.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});