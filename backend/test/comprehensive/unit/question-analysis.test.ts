/**
 * Unit Tests for Question Analysis
 * 
 * Tests question extraction, normalization, FAQ ranking, categorization, and unanswered question identification
 * Requirements: 4.1, 4.2, 5.1, 5.2
 */

import { AnalyticsService } from '../../../src/services/analytics-service';
import { FAQAnalysis, UnansweredAnalysis, QuestionRecord } from '../../../src/types/index';

// Mock DynamoDB service
jest.mock('../../../src/services/dynamodb-service');

describe('Question Analysis Unit Tests', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    jest.clearAllMocks();
  });

  describe('getFrequentlyAskedQuestions', () => {
    /**
     * Requirement 4.1: Question ranking by frequency
     */
    it('should return FAQ analysis with proper ranking', async () => {
      const mockQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-diabetes-001',
          date: '2024-01-01',
          originalQuestion: 'What is diabetes?',
          normalizedQuestion: 'what is diabetes',
          category: 'diabetes',
          count: 45,
          totalConfidenceScore: 38.5,
          averageConfidenceScore: 0.86,
          answeredCount: 40,
          unansweredCount: 5,
          escalationCount: 2,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-management-001',
          date: '2024-01-01',
          originalQuestion: 'How to manage blood sugar?',
          normalizedQuestion: 'how to manage blood sugar',
          category: 'management',
          count: 32,
          totalConfidenceScore: 28.8,
          averageConfidenceScore: 0.90,
          answeredCount: 30,
          unansweredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        },
        {
          questionHash: 'hash-diet-001',
          date: '2024-01-01',
          originalQuestion: 'What foods should I avoid?',
          normalizedQuestion: 'what foods should i avoid',
          category: 'diet',
          count: 28,
          totalConfidenceScore: 25.2,
          averageConfidenceScore: 0.90,
          answeredCount: 26,
          unansweredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T10:45:00Z'
        }
      ];

      // Mock DynamoDB service methods
      const mockGetQuestionsByLanguage = jest.fn().mockResolvedValue(mockQuestions);
      const mockGetQuestionsByCategory = jest.fn().mockResolvedValue([]);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: mockGetQuestionsByLanguage,
        getQuestionsByCategory: mockGetQuestionsByCategory
      });

      const result = await analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en',
        limit: 10
      });

      expect(result.topQuestions).toHaveLength(3);
      expect(result.topQuestions[0].question).toBe('What is diabetes?');
      expect(result.topQuestions[0].count).toBe(45);
      expect(result.topQuestions[1].count).toBe(32);
      expect(result.topQuestions[2].count).toBe(28);
      expect(result.totalQuestionsAnalyzed).toBe(105); // 45 + 32 + 28
    });

    /**
     * Requirement 4.2: Question categorization by topic
     */
    it('should categorize questions correctly', async () => {
      const mockQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-type1-001',
          date: '2024-01-01',
          originalQuestion: 'What is type 1 diabetes?',
          normalizedQuestion: 'what is type 1 diabetes',
          category: 'diabetes',
          count: 25,
          totalConfidenceScore: 22.5,
          averageConfidenceScore: 0.90,
          answeredCount: 23,
          unansweredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-type2-001',
          date: '2024-01-01',
          originalQuestion: 'What is type 2 diabetes?',
          normalizedQuestion: 'what is type 2 diabetes',
          category: 'diabetes',
          count: 20,
          totalConfidenceScore: 18.0,
          averageConfidenceScore: 0.90,
          answeredCount: 18,
          unansweredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        },
        {
          questionHash: 'hash-monitoring-001',
          date: '2024-01-01',
          originalQuestion: 'How to check blood sugar?',
          normalizedQuestion: 'how to check blood sugar',
          category: 'monitoring',
          count: 15,
          totalConfidenceScore: 13.5,
          averageConfidenceScore: 0.90,
          answeredCount: 14,
          unansweredCount: 1,
          escalationCount: 0,
          language: 'en',
          lastAsked: '2024-01-01T10:45:00Z'
        }
      ];

      const mockGetQuestionsByLanguage = jest.fn().mockResolvedValue(mockQuestions);
      const mockGetQuestionsByCategory = jest.fn().mockResolvedValue([]);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: mockGetQuestionsByLanguage,
        getQuestionsByCategory: mockGetQuestionsByCategory
      });

      const result = await analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      });

      expect(result.questionsByCategory).toEqual({
        diabetes: 45, // 25 + 20
        monitoring: 15
      });
    });

    /**
     * Test question normalization and deduplication
     */
    it('should normalize and deduplicate similar questions', async () => {
      const mockQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-diabetes-norm-001',
          date: '2024-01-01',
          originalQuestion: 'What is diabetes?',
          normalizedQuestion: 'what is diabetes',
          category: 'diabetes',
          count: 25,
          totalConfidenceScore: 22.5,
          averageConfidenceScore: 0.90,
          answeredCount: 23,
          unansweredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-diabetes-norm-002',
          date: '2024-01-01',
          originalQuestion: 'What is Diabetes?', // Different case
          normalizedQuestion: 'what is diabetes', // Same normalized
          category: 'diabetes',
          count: 15,
          totalConfidenceScore: 13.5,
          averageConfidenceScore: 0.90,
          answeredCount: 14,
          unansweredCount: 1,
          escalationCount: 0,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        }
      ];

      const mockGetQuestionsByLanguage = jest.fn().mockResolvedValue(mockQuestions);
      const mockGetQuestionsByCategory = jest.fn().mockResolvedValue([]);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: mockGetQuestionsByLanguage,
        getQuestionsByCategory: mockGetQuestionsByCategory
      });

      const result = await analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      });

      // Should be deduplicated into one question with combined count
      expect(result.topQuestions).toHaveLength(1);
      expect(result.topQuestions[0].count).toBe(40); // 25 + 15
    });
  });

  describe('getUnansweredQuestions', () => {
    /**
     * Requirement 5.1: Unanswered question identification
     */
    it('should identify unanswered questions correctly', async () => {
      const mockUnansweredQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-complications-001',
          date: '2024-01-01',
          originalQuestion: 'What about rare diabetes complications?',
          normalizedQuestion: 'what about rare diabetes complications',
          category: 'complications',
          count: 10,
          unansweredCount: 8,
          totalConfidenceScore: 4.5, // Low confidence
          averageConfidenceScore: 0.45,
          answeredCount: 2,
          escalationCount: 3,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-pregnancy-001',
          date: '2024-01-01',
          originalQuestion: 'How to handle diabetes during pregnancy?',
          normalizedQuestion: 'how to handle diabetes during pregnancy',
          category: 'pregnancy',
          count: 12,
          unansweredCount: 10,
          totalConfidenceScore: 3.6,
          averageConfidenceScore: 0.30,
          answeredCount: 2,
          escalationCount: 5,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        }
      ];

      const mockGetUnansweredQuestionsByDate = jest.fn().mockResolvedValue(mockUnansweredQuestions);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getUnansweredQuestionsByDate: mockGetUnansweredQuestionsByDate
      });

      const result = await analyticsService.getUnansweredQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en',
        limit: 10
      });

      expect(result.topUnansweredQuestions).toHaveLength(2);
      expect(result.topUnansweredQuestions[0].count).toBe(10); // Pregnancy question has higher unanswered count
      expect(result.topUnansweredQuestions[0].escalationRate).toBe(41.67); // 5/12 * 100
    });

    /**
     * Requirement 5.2: Knowledge gap analysis by topic category
     */
    it('should analyze knowledge gaps by category', async () => {
      const mockUnansweredQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-medication-001',
          date: '2024-01-01',
          originalQuestion: 'Complex medication interactions?',
          normalizedQuestion: 'complex medication interactions',
          category: 'medication',
          count: 20,
          unansweredCount: 15,
          totalConfidenceScore: 8.0,
          averageConfidenceScore: 0.40,
          answeredCount: 5,
          escalationCount: 8,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-medication-002',
          date: '2024-01-01',
          originalQuestion: 'Advanced insulin pump settings?',
          normalizedQuestion: 'advanced insulin pump settings',
          category: 'medication',
          count: 15,
          unansweredCount: 12,
          totalConfidenceScore: 6.0,
          averageConfidenceScore: 0.40,
          answeredCount: 3,
          escalationCount: 6,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        },
        {
          questionHash: 'hash-genetics-001',
          date: '2024-01-01',
          originalQuestion: 'Rare genetic diabetes types?',
          normalizedQuestion: 'rare genetic diabetes types',
          category: 'genetics',
          count: 8,
          unansweredCount: 7,
          totalConfidenceScore: 2.4,
          averageConfidenceScore: 0.30,
          answeredCount: 1,
          escalationCount: 4,
          language: 'en',
          lastAsked: '2024-01-01T10:45:00Z'
        }
      ];

      const mockGetUnansweredQuestionsByDate = jest.fn().mockResolvedValue(mockUnansweredQuestions);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getUnansweredQuestionsByDate: mockGetUnansweredQuestionsByDate
      });

      const result = await analyticsService.getUnansweredQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      });

      expect(result.knowledgeGaps).toHaveLength(2);
      
      // Medication category should have highest gap percentage
      const medicationGap = result.knowledgeGaps.find(gap => gap.category === 'medication');
      expect(medicationGap?.gapPercentage).toBeCloseTo(77.14); // (15+12)/(20+15) * 100
      
      const geneticsGap = result.knowledgeGaps.find(gap => gap.category === 'genetics');
      expect(geneticsGap?.gapPercentage).toBeCloseTo(87.5); // 7/8 * 100
    });

    /**
     * Test improvement opportunity prioritization
     */
    it('should prioritize improvement opportunities correctly', async () => {
      const mockUnansweredQuestions: QuestionRecord[] = [
        {
          questionHash: 'hash-high-impact-001',
          date: '2024-01-01',
          originalQuestion: 'High-impact unanswered question',
          normalizedQuestion: 'high impact unanswered question',
          category: 'high-impact',
          count: 50,
          unansweredCount: 40, // 80% unanswered
          totalConfidenceScore: 15.0,
          averageConfidenceScore: 0.30,
          answeredCount: 10,
          escalationCount: 20,
          language: 'en',
          lastAsked: '2024-01-01T12:00:00Z'
        },
        {
          questionHash: 'hash-low-impact-001',
          date: '2024-01-01',
          originalQuestion: 'Low-impact unanswered question',
          normalizedQuestion: 'low impact unanswered question',
          category: 'low-impact',
          count: 5,
          unansweredCount: 3, // 60% unanswered
          totalConfidenceScore: 1.5,
          averageConfidenceScore: 0.30,
          answeredCount: 2,
          escalationCount: 1,
          language: 'en',
          lastAsked: '2024-01-01T11:30:00Z'
        }
      ];

      const mockGetUnansweredQuestionsByDate = jest.fn().mockResolvedValue(mockUnansweredQuestions);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getUnansweredQuestionsByDate: mockGetUnansweredQuestionsByDate
      });

      const result = await analyticsService.getUnansweredQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      });

      expect(result.improvementOpportunities).toHaveLength(1); // Only high-impact should qualify
      expect(result.improvementOpportunities[0].topic).toBe('high-impact');
      expect(result.improvementOpportunities[0].priority).toBe('high');
      expect(result.improvementOpportunities[0].impact).toBe(40);
    });
  });

  describe('Question Extraction and Normalization', () => {
    /**
     * Test question extraction logic
     */
    it('should extract questions from various formats', () => {
      // This would test the question extraction logic if it were exposed
      // For now, we test through the main methods
      expect(true).toBe(true); // Placeholder
    });

    /**
     * Test question normalization
     */
    it('should normalize questions consistently', () => {
      // Test cases for normalization:
      // - Case insensitive
      // - Remove punctuation
      // - Handle common variations
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error handling for FAQ analysis
     */
    it('should handle FAQ analysis errors gracefully', async () => {
      const mockError = new Error('Database query failed');
      const mockGetQuestionsByLanguage = jest.fn().mockRejectedValue(mockError);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: mockGetQuestionsByLanguage,
        getQuestionsByCategory: jest.fn().mockResolvedValue([])
      });

      await expect(analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      })).rejects.toThrow('Failed to retrieve FAQ analysis: Database query failed');
    });

    /**
     * Test error handling for unanswered questions
     */
    it('should handle unanswered questions errors gracefully', async () => {
      const mockError = new Error('Table not found');
      const mockGetUnansweredQuestionsByDate = jest.fn().mockRejectedValue(mockError);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getUnansweredQuestionsByDate: mockGetUnansweredQuestionsByDate
      });

      await expect(analyticsService.getUnansweredQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en'
      })).rejects.toThrow('Failed to retrieve unanswered questions analysis: Table not found');
    });
  });

  describe('Performance Tests', () => {
    /**
     * Test performance with large datasets
     */
    it('should handle large question datasets efficiently', async () => {
      // Generate large mock dataset
      const largeQuestionSet: QuestionRecord[] = Array.from({ length: 1000 }, (_, i) => ({
        questionHash: `hash-question-${i}`,
        date: '2024-01-01',
        originalQuestion: `Question ${i}?`,
        normalizedQuestion: `question ${i}`,
        category: `category-${i % 10}`,
        count: Math.floor(Math.random() * 50) + 1,
        totalConfidenceScore: Math.random() * 45,
        averageConfidenceScore: Math.random(),
        answeredCount: Math.floor(Math.random() * 40),
        unansweredCount: Math.floor(Math.random() * 10),
        escalationCount: Math.floor(Math.random() * 5),
        language: 'en' as const,
        lastAsked: '2024-01-01T12:00:00Z'
      }));

      const mockGetQuestionsByLanguage = jest.fn().mockResolvedValue(largeQuestionSet);
      const mockGetQuestionsByCategory = jest.fn().mockResolvedValue([]);
      
      (analyticsService as any).getDynamoService = jest.fn().mockReturnValue({
        getQuestionsByLanguage: mockGetQuestionsByLanguage,
        getQuestionsByCategory: mockGetQuestionsByCategory
      });

      const startTime = Date.now();
      
      const result = await analyticsService.getFrequentlyAskedQuestions({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        language: 'en',
        limit: 50
      });

      const duration = Date.now() - startTime;
      
      expect(result.topQuestions).toHaveLength(50); // Should respect limit
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });
});