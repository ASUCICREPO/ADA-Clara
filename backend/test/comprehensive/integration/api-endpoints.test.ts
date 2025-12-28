/**
 * Integration Tests for API Endpoints
 * 
 * Tests complete API workflows with realistic data, error handling, and edge cases
 * Requirements: All requirements
 */

import { AdminAnalyticsProcessor } from '../../../lambda/admin-analytics';
import { handler as chatHandler } from '../../../lambda/chat-processor/index';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock AWS services
jest.mock('../../../src/services/dynamodb-service');
jest.mock('../../../src/services/cache-service');

describe('API Endpoints Integration Tests', () => {
  let processor: AdminAnalyticsProcessor;
  let mockContext: Context;

  beforeEach(() => {
    processor = new AdminAnalyticsProcessor();
    
    mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'test-arn',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request',
      logGroupName: 'test-log-group',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {}
    };

    jest.clearAllMocks();
  });

  describe('Enhanced Dashboard Metrics Endpoint', () => {
    /**
     * Requirements 1.1, 1.2: Complete dashboard workflow
     */
    it('should return complete dashboard metrics', async () => {
      const query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        type: 'chat' as const // Changed from 'all' to valid type
      };

      const result = await processor.getEnhancedDashboardMetrics(query);

      expect(result).toHaveProperty('conversationAnalytics');
      expect(result).toHaveProperty('questionAnalytics');
      expect(result).toHaveProperty('escalationAnalytics');
      expect(result).toHaveProperty('realTimeMetrics');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('Conversation Analytics Endpoint', () => {
    /**
     * Requirements 1.1, 1.2: Conversation data with pagination
     */
    it('should handle conversation analytics with pagination', async () => {
      const query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        language: 'en',
        limit: 25,
        offset: 0
      };

      const result = await processor.getConversationAnalytics(query);

      expect(result).toHaveProperty('analytics');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination.limit).toBe(25);
      expect(result.pagination.offset).toBe(0);
    });
  });

  describe('Question Analysis Endpoint', () => {
    /**
     * Requirements 4.1, 5.1: FAQ and unanswered questions
     */
    it('should return comprehensive question analysis', async () => {
      const query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        category: 'all',
        limit: 20,
        includeUnanswered: true
      };

      const result = await processor.getQuestionAnalysis(query);

      expect(result).toHaveProperty('faq');
      expect(result).toHaveProperty('summary');
      expect(result.faq).toHaveProperty('topQuestions');
      expect(result.summary).toHaveProperty('answerRate');
    });
  });

  describe('Error Handling', () => {
    /**
     * Test API error responses
     */
    it('should handle validation errors properly', async () => {
      const invalidQuery = {
        startDate: 'invalid-date',
        endDate: '2024-01-31'
      };

      await expect(processor.getEnhancedDashboardMetrics(invalidQuery))
        .rejects.toThrow(/validation/i);
    });
  });

  describe('Chat Processor Integration', () => {
    /**
     * Requirements 1.2, 2.1, 4.2, 5.1, 8.4: Enhanced chat processing
     */
    it('should process chat messages with enhanced metadata', async () => {
      const testEvent: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/chat',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is type 2 diabetes?',
          userInfo: { name: 'Test User', email: 'test@example.com' }
        }),
        queryStringParameters: null,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        isBase64Encoded: false,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null
      };

      const result = await chatHandler(testEvent, mockContext);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response).toHaveProperty('conversationMetadata');
      expect(response.conversationMetadata).toHaveProperty('questionDetected');
      expect(response.conversationMetadata).toHaveProperty('questionCategory');
    });
  });
});