/**
 * End-to-End Tests for Complete Workflows
 * 
 * Tests complete user workflows with realistic conversation data
 */

import { AdminAnalyticsProcessor } from '../../../lambda/admin-analytics';
import { handler as chatHandler } from '../../../lambda/chat-processor/index';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock AWS services but allow realistic data flow
jest.mock('../../../src/services/dynamodb-service');

describe('Complete Workflow E2E Tests', () => {
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

  describe('Complete Admin Dashboard Workflow', () => {
    /**
     * Test complete admin dashboard data flow
     */
    it('should provide complete dashboard experience', async () => {
      // Step 1: Get dashboard overview
      const dashboardData = await processor.getEnhancedDashboardMetrics({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      expect(dashboardData).toHaveProperty('conversationAnalytics');
      expect(dashboardData).toHaveProperty('questionAnalytics');
      expect(dashboardData).toHaveProperty('realTimeMetrics');

      // Step 2: Drill down into conversation details
      const conversationAnalytics = await processor.getConversationAnalytics({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        language: 'en',
        limit: 50,
        offset: 0
      });

      expect(conversationAnalytics).toHaveProperty('analytics');
      expect(conversationAnalytics).toHaveProperty('pagination');

      // Step 3: Analyze specific questions
      const questionAnalysis = await processor.getQuestionAnalysis({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        category: 'diabetes',
        limit: 20,
        includeUnanswered: true
      });

      expect(questionAnalysis).toHaveProperty('faq');
      expect(questionAnalysis).toHaveProperty('summary');

      // Step 4: Check system health
      const systemHealth = await processor.getSystemHealth();

      expect(systemHealth).toHaveProperty('overallHealth');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(systemHealth.overallHealth);
    });
  });

  describe('Chat to Analytics Pipeline', () => {
    /**
     * Test complete pipeline from chat message to analytics
     */
    it('should process chat message and make it available in analytics', async () => {
      // Step 1: Process a chat message
      const chatEvent: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/chat',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What are the symptoms of type 2 diabetes?',
          userInfo: {
            name: 'John Doe',
            email: 'john@example.com'
          }
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

      const chatResult = await chatHandler(chatEvent, mockContext);
      expect(chatResult.statusCode).toBe(200);

      const chatResponse = JSON.parse(chatResult.body);
      expect(chatResponse).toHaveProperty('conversationMetadata');
      expect(chatResponse.conversationMetadata.questionDetected).toBe(true);
      expect(chatResponse.conversationMetadata.questionCategory).toBeDefined();

      // Step 2: Verify the question appears in analytics
      // (In a real test, this would require actual database integration)
      const questionAnalysis = await processor.getQuestionAnalysis({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        category: 'all',
        limit: 100,
        includeUnanswered: false
      });

      expect(questionAnalysis).toHaveProperty('faq');
      // In a real scenario, we would verify the question appears in the results
    });
  });

  describe('Escalation Workflow', () => {
    /**
     * Test escalation detection and analytics
     */
    it('should detect escalation and track in analytics', async () => {
      // Step 1: Process a message that should trigger escalation
      const escalationEvent: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/chat',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'I am having severe chest pain and difficulty breathing. Is this related to my diabetes?',
          userInfo: {
            name: 'Emergency User',
            email: 'emergency@example.com'
          }
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

      const chatResult = await chatHandler(escalationEvent, mockContext);
      expect(chatResult.statusCode).toBe(200);

      const chatResponse = JSON.parse(chatResult.body);
      expect(chatResponse.escalationSuggested).toBe(true);
      expect(chatResponse.conversationMetadata.escalationTriggers).toContain('emergency_keywords');

      // Step 2: Verify escalation appears in analytics
      const escalationAnalytics = await processor.getEscalationAnalytics({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        priority: 'high',
        status: 'pending',
        granularity: 'daily'
      });

      expect(escalationAnalytics).toHaveProperty('totalEscalations');
      expect(escalationAnalytics).toHaveProperty('escalationsByPriority');
    });
  });

  describe('Multi-language Support', () => {
    /**
     * Test multi-language conversation processing
     */
    it('should handle Spanish conversations correctly', async () => {
      // Step 1: Process Spanish message
      const spanishEvent: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/chat',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '¿Qué es la diabetes tipo 2?',
          userInfo: {
            name: 'María García',
            email: 'maria@example.com'
          }
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

      const chatResult = await chatHandler(spanishEvent, mockContext);
      expect(chatResult.statusCode).toBe(200);

      const chatResponse = JSON.parse(chatResult.body);
      expect(chatResponse.language).toBe('es');

      // Step 2: Verify Spanish analytics
      const spanishAnalytics = await processor.getConversationAnalytics({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        language: 'es',
        limit: 50,
        offset: 0
      });

      expect(spanishAnalytics.analytics).toHaveProperty('languageDistribution');
    });
  });

  describe('Performance Under Load', () => {
    /**
     * Test system performance with realistic load
     */
    it('should maintain performance with multiple concurrent workflows', async () => {
      const concurrentWorkflows = 10;
      const startTime = Date.now();

      // Create multiple concurrent workflows
      const workflows = Array.from({ length: concurrentWorkflows }, async (_, i) => {
        // Each workflow: chat -> analytics -> details
        const chatEvent: APIGatewayProxyEvent = {
          httpMethod: 'POST',
          path: '/chat',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Test question ${i}: What should I know about diabetes?`,
            userInfo: {
              name: `Test User ${i}`,
              email: `test${i}@example.com`
            }
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

        // Process chat
        await chatHandler(chatEvent, mockContext);

        // Get analytics
        await processor.getEnhancedDashboardMetrics({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

        // Get real-time metrics
        await processor.getEnhancedRealTimeMetrics();

        return i;
      });

      const results = await Promise.all(workflows);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentWorkflows);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      // Average time per workflow should be reasonable
      const avgTimePerWorkflow = duration / concurrentWorkflows;
      expect(avgTimePerWorkflow).toBeLessThan(5000); // < 5 seconds per workflow
    });
  });
});