#!/usr/bin/env ts-node

/**
 * Task 9 Simple API Endpoints Test
 * 
 * Tests the API endpoints by simulating Lambda events
 */

import { handler } from '../lambda/admin-analytics/index';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

interface TestCase {
  name: string;
  path: string;
  method: string;
  queryParams?: Record<string, string>;
  requirement: string;
}

class Task9SimpleAPITester {
  private results: Array<{ name: string; status: 'PASS' | 'FAIL'; error?: string; duration: number }> = [];

  /**
   * Run all Task 9 API endpoint tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Task 9 Simple API Endpoints Test');
    console.log('=' .repeat(60));

    const testCases: TestCase[] = [
      {
        name: 'Enhanced Dashboard Metrics',
        path: '/admin/dashboard',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31' },
        requirement: '1.1, 1.2'
      },
      {
        name: 'Conversation Analytics',
        path: '/admin/conversations',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31', language: 'en' },
        requirement: '1.1, 1.2'
      },
      {
        name: 'Conversation Details',
        path: '/admin/conversations/test-conversation-001',
        method: 'GET',
        requirement: '8.1'
      },
      {
        name: 'Question Analysis',
        path: '/admin/questions',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31', includeUnanswered: 'true' },
        requirement: '4.1, 5.1'
      },
      {
        name: 'Enhanced Real-time Metrics',
        path: '/admin/realtime',
        method: 'GET',
        requirement: '6.1'
      },
      {
        name: 'Enhanced FAQ Analysis',
        path: '/admin/questions/enhanced',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31', includeExtraction: 'true' },
        requirement: '4.1'
      },
      {
        name: 'Enhanced Question Ranking',
        path: '/admin/questions/ranking',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31', method: 'combined' },
        requirement: '4.1'
      },
      {
        name: 'Escalation Analytics',
        path: '/admin/escalations',
        method: 'GET',
        queryParams: { startDate: '2024-01-01', endDate: '2024-01-31', granularity: 'daily' },
        requirement: '3.1, 3.2'
      },
      {
        name: 'System Health Check',
        path: '/admin/health',
        method: 'GET',
        requirement: '6.1'
      }
    ];

    for (const testCase of testCases) {
      await this.runTest(testCase);
    }

    this.printSummary();
  }

  /**
   * Run individual test case
   */
  private async runTest(testCase: TestCase): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`\n📋 Testing: ${testCase.name}`);
      console.log(`   Path: ${testCase.method} ${testCase.path}`);
      console.log(`   Requirement: ${testCase.requirement}`);
      
      const event = this.createMockEvent(testCase.path, testCase.method, testCase.queryParams);
      const context = this.createMockContext();
      
      const result = await handler(event, context);
      const duration = Date.now() - startTime;
      
      // Validate response
      if (result.statusCode === 200) {
        const body = JSON.parse(result.body);
        if (body.success) {
          this.results.push({
            name: testCase.name,
            status: 'PASS',
            duration
          });
          console.log(`   ✅ PASS (${duration}ms)`);
          
          // Log some response details
          if (body.data) {
            this.logResponseDetails(testCase.name, body.data);
          }
        } else {
          throw new Error(`API returned success: false - ${body.error}`);
        }
      } else {
        const body = JSON.parse(result.body);
        throw new Error(`HTTP ${result.statusCode}: ${body.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: testCase.name,
        status: 'FAIL',
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log(`   ❌ FAIL (${duration}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log relevant response details for each endpoint
   */
  private logResponseDetails(testName: string, data: any): void {
    try {
      switch (testName) {
        case 'Enhanced Dashboard Metrics':
          if (data.conversationAnalytics) {
            console.log(`     📊 Total conversations: ${data.conversationAnalytics.totalConversations}`);
            console.log(`     🌐 Language distribution: EN=${data.conversationAnalytics.languageDistribution?.en || 0}, ES=${data.conversationAnalytics.languageDistribution?.es || 0}`);
          }
          break;
          
        case 'Conversation Analytics':
          if (data.analytics) {
            console.log(`     📈 Total conversations: ${data.analytics.totalConversations}`);
            console.log(`     📉 Unanswered percentage: ${data.analytics.unansweredPercentage}%`);
          }
          break;
          
        case 'Conversation Details':
          if (data) {
            console.log(`     💬 Conversation ID: ${data.conversationId}`);
            console.log(`     📝 Message count: ${data.messageCount}`);
            console.log(`     🎯 Outcome: ${data.outcome}`);
          } else {
            console.log(`     ℹ️  No conversation found (expected for test)`);
          }
          break;
          
        case 'Question Analysis':
          if (data.faq) {
            console.log(`     ❓ Total questions analyzed: ${data.faq.totalQuestionsAnalyzed}`);
            console.log(`     📊 Answer rate: ${data.summary?.answerRate || 0}%`);
          }
          break;
          
        case 'Enhanced Real-time Metrics':
          if (data.liveConversations) {
            console.log(`     🔴 Active conversations: ${data.liveConversations.active}`);
            console.log(`     👥 Active users: ${data.activeUsers?.total || 0}`);
            console.log(`     ⚡ Response time: ${data.systemPerformance?.responseTime?.p50 || 0}ms`);
          }
          break;
          
        case 'System Health Check':
          console.log(`     🏥 Overall health: ${data.overallHealth}`);
          console.log(`     🗄️  DynamoDB: ${data.dynamodbHealth ? '✅' : '❌'}`);
          console.log(`     📦 S3: ${data.s3Health ? '✅' : '❌'}`);
          console.log(`     📧 SES: ${data.sesHealth ? '✅' : '❌'}`);
          break;
          
        default:
          console.log(`     ✅ Response received successfully`);
      }
    } catch (error) {
      console.log(`     ℹ️  Response details not available`);
    }
  }

  /**
   * Create mock API Gateway event
   */
  private createMockEvent(path: string, method: string, queryParams?: Record<string, string>): APIGatewayProxyEvent {
    return {
      httpMethod: method,
      path: path,
      queryStringParameters: queryParams || null,
      headers: {
        'Content-Type': 'application/json'
      },
      body: null,
      isBase64Encoded: false,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        requestId: 'test-request-id',
        stage: 'test',
        httpMethod: method,
        path: path,
        protocol: 'HTTP/1.1',
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
        identity: {
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent'
        } as any,
        accountId: 'test-account',
        apiId: 'test-api',
        resourceId: 'test-resource',
        resourcePath: path
      } as any,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      resource: path
    };
  }

  /**
   * Create mock Lambda context
   */
  private createMockContext(): Context {
    return {
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
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TASK 9 API ENDPOINTS TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n📈 Results: ${passed}/${total} tests passed (${failed} failed)`);
    console.log(`⏱️  Total duration: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`   • ${r.name}: ${r.error}`);
        });
    }

    console.log('\n✅ Passed Tests:');
    this.results
      .filter(r => r.status === 'PASS')
      .forEach(r => {
        console.log(`   • ${r.name} - ${r.duration}ms`);
      });

    if (passed === total) {
      console.log('\n🎉 All Task 9 API endpoint tests passed!');
      console.log('✅ Enhanced dashboard API endpoints are ready for production');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review and fix issues before deployment.`);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const tester = new Task9SimpleAPITester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { Task9SimpleAPITester };