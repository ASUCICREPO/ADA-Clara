#!/usr/bin/env ts-node

/**
 * Simplified handler to test the basic structure
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DataService } from '../src/services/data-service';
import { EscalationService } from '../src/services/escalation-service';
import { AnalyticsService } from '../src/services/analytics-service';

export class SimplifiedAdminAnalyticsProcessor {
  private dataService: DataService;
  private escalationService: EscalationService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.dataService = new DataService();
    this.escalationService = new EscalationService();
    this.analyticsService = new AnalyticsService();
  }

  async getConversationAnalytics(query: any): Promise<any> {
    console.log('💬 Getting conversation analytics');
    
    try {
      // Return mock data for testing
      return {
        analytics: {
          totalConversations: 100,
          conversationsByDate: [],
          languageDistribution: { en: 80, es: 20 },
          unansweredPercentage: 15,
          averageConfidenceScore: 0.85
        },
        pagination: {
          limit: query.limit || 50,
          offset: query.offset || 0,
          total: 100
        }
      };
    } catch (error) {
      console.error('Error getting conversation analytics:', error);
      throw error;
    }
  }

  async getSystemHealth(): Promise<any> {
    return {
      dynamodbHealth: true,
      s3Health: true,
      sesHealth: true,
      overallHealth: 'healthy',
      lastHealthCheck: new Date().toISOString()
    };
  }
}

export const simplifiedHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('Simplified handler invoked:', JSON.stringify(event, null, 2));

  const processor = new SimplifiedAdminAnalyticsProcessor();
  
  try {
    const path = event.path;
    const method = event.httpMethod;
    const queryParams = event.queryStringParameters || {};

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    if (method === 'GET') {
      if (path === '/admin/conversations') {
        const analytics = await processor.getConversationAnalytics(queryParams);
        
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

      if (path === '/admin/health') {
        const health = await processor.getSystemHealth();
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            data: health,
            timestamp: new Date().toISOString()
          })
        };
      }
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Route not found'
      })
    };

  } catch (error) {
    console.error('Simplified handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      })
    };
  }
};

// Test the simplified handler
async function testSimplifiedHandler(): Promise<void> {
  console.log('🧪 Testing simplified handler');
  
  const event: APIGatewayProxyEvent = {
    httpMethod: 'GET',
    path: '/admin/conversations',
    queryStringParameters: { startDate: '2024-01-01', endDate: '2024-01-31' },
    headers: { 'Content-Type': 'application/json' },
    body: null,
    isBase64Encoded: false,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      stage: 'test',
      httpMethod: 'GET',
      path: '/admin/conversations',
      protocol: 'HTTP/1.1',
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: '127.0.0.1', userAgent: 'test-agent' } as any,
      accountId: 'test-account',
      apiId: 'test-api',
      resourceId: 'test-resource',
      resourcePath: '/admin/conversations'
    } as any,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    resource: '/admin/conversations'
  };

  const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  };

  try {
    const result = await simplifiedHandler(event, context);
    console.log(`✅ Result: Status ${result.statusCode}`);
    
    if (result.statusCode === 200) {
      const body = JSON.parse(result.body);
      console.log(`📊 Success: ${body.success}`);
      console.log(`📈 Total conversations: ${body.data.analytics.totalConversations}`);
    } else {
      const body = JSON.parse(result.body);
      console.log(`❌ Error: ${body.error}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

if (require.main === module) {
  testSimplifiedHandler().catch(console.error);
}