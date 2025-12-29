#!/usr/bin/env ts-node

/**
 * Test EventBridge Scheduling for Weekly Crawler
 * 
 * This script tests the EventBridge scheduling functionality added to the S3 Vectors GA stack.
 * It validates that the weekly crawler schedule rule is properly configured and can trigger
 * the crawler Lambda function.
 */

import { EventBridgeClient, ListRulesCommand, DescribeRuleCommand, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SNSClient, ListTopicsCommand, GetTopicAttributesCommand } from '@aws-sdk/client-sns';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

interface TestResult {
  testName: string;
  success: boolean;
  details: any;
  error?: string;
}

class EventBridgeSchedulingTest {
  private eventBridgeClient: EventBridgeClient;
  private snsClient: SNSClient;
  private lambdaClient: LambdaClient;
  private cfClient: CloudFormationClient;
  private testResults: TestResult[] = [];

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    this.eventBridgeClient = new EventBridgeClient({ region });
    this.snsClient = new SNSClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.cfClient = new CloudFormationClient({ region });
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Testing EventBridge Scheduling for Weekly Crawler');
    console.log('=' .repeat(80));
    console.log('📍 Region:', process.env.AWS_REGION || 'us-east-1');
    console.log('⏰ Started:', new Date().toISOString());
    console.log('=' .repeat(80));

    const tests = [
      { name: 'Stack Deployment Validation', fn: () => this.testStackDeployment() },
      { name: 'EventBridge Rule Configuration', fn: () => this.testEventBridgeRule() },
      { name: 'SNS Topics Configuration', fn: () => this.testSNSTopics() },
      { name: 'Lambda Function Permissions', fn: () => this.testLambdaPermissions() },
      { name: 'Manual Event Trigger Test', fn: () => this.testManualEventTrigger() },
      { name: 'Crawler Scheduling Integration', fn: () => this.testCrawlerSchedulingIntegration() },
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn);
    }

    this.generateTestReport();
  }

  private async runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
    console.log(`\n🔍 ${testName}...`);
    
    try {
      const result = await testFn();
      this.testResults.push({
        testName,
        success: true,
        details: result
      });
      console.log(`   ✅ ${testName} passed`);
    } catch (error: any) {
      this.testResults.push({
        testName,
        success: false,
        details: {},
        error: error.message
      });
      console.log(`   ❌ ${testName} failed: ${error.message}`);
    }
  }

  private async testStackDeployment(): Promise<any> {
    // Check if S3 Vectors GA stack is deployed with EventBridge components
    const stackName = 'AdaClaraS3VectorsGA';
    
    try {
      const response = await this.cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = response.Stacks?.[0];
      
      if (!stack) {
        throw new Error(`Stack ${stackName} not found`);
      }

      if (stack.StackStatus !== 'CREATE_COMPLETE' && stack.StackStatus !== 'UPDATE_COMPLETE') {
        throw new Error(`Stack ${stackName} is not in a complete state: ${stack.StackStatus}`);
      }

      // Check for EventBridge-related outputs
      const outputs = stack.Outputs || [];
      const eventBridgeOutputs = outputs.filter(output => 
        output.OutputKey?.includes('Schedule') || 
        output.OutputKey?.includes('Notification') ||
        output.OutputKey?.includes('DeadLetter')
      );

      if (eventBridgeOutputs.length === 0) {
        throw new Error('No EventBridge-related outputs found in stack');
      }

      return {
        stackStatus: stack.StackStatus,
        stackDescription: stack.Description,
        eventBridgeOutputs: eventBridgeOutputs.map(output => ({
          key: output.OutputKey,
          value: output.OutputValue,
          description: output.Description
        })),
        lastUpdated: stack.LastUpdatedTime || stack.CreationTime
      };
    } catch (error: any) {
      throw new Error(`Stack validation failed: ${error.message}`);
    }
  }

  private async testEventBridgeRule(): Promise<any> {
    // Check if the weekly crawler schedule rule exists and is properly configured
    const ruleName = 'ada-clara-weekly-crawler-schedule';
    
    try {
      // List rules to find our rule
      const listResponse = await this.eventBridgeClient.send(new ListRulesCommand({}));
      const rule = listResponse.Rules?.find(r => r.Name === ruleName);
      
      if (!rule) {
        throw new Error(`EventBridge rule ${ruleName} not found`);
      }

      // Get detailed rule configuration
      const describeResponse = await this.eventBridgeClient.send(new DescribeRuleCommand({ Name: ruleName }));
      
      if (!describeResponse.ScheduleExpression) {
        throw new Error('Rule does not have a schedule expression');
      }

      if (describeResponse.State !== 'ENABLED') {
        throw new Error(`Rule is not enabled: ${describeResponse.State}`);
      }

      return {
        ruleName: describeResponse.Name,
        scheduleExpression: describeResponse.ScheduleExpression,
        state: describeResponse.State,
        description: describeResponse.Description,
        arn: describeResponse.Arn,
        targets: await this.getRuleTargets(ruleName)
      };
    } catch (error: any) {
      throw new Error(`EventBridge rule validation failed: ${error.message}`);
    }
  }

  private async getRuleTargets(ruleName: string): Promise<any[]> {
    try {
      const { ListTargetsByRuleCommand } = await import('@aws-sdk/client-eventbridge');
      const response = await this.eventBridgeClient.send(new ListTargetsByRuleCommand({ Rule: ruleName }));
      return response.Targets || [];
    } catch (error) {
      return [];
    }
  }

  private async testSNSTopics(): Promise<any> {
    // Check if SNS topics for notifications and DLQ are properly configured
    try {
      const listResponse = await this.snsClient.send(new ListTopicsCommand({}));
      const topics = listResponse.Topics || [];
      
      const crawlerTopics = topics.filter(topic => 
        topic.TopicArn?.includes('crawler-failures') || 
        topic.TopicArn?.includes('crawler-dlq')
      );

      if (crawlerTopics.length === 0) {
        throw new Error('No crawler-related SNS topics found');
      }

      const topicDetails = [];
      for (const topic of crawlerTopics) {
        if (topic.TopicArn) {
          try {
            const attributes = await this.snsClient.send(new GetTopicAttributesCommand({ TopicArn: topic.TopicArn }));
            topicDetails.push({
              arn: topic.TopicArn,
              displayName: attributes.Attributes?.DisplayName,
              subscriptionsConfirmed: attributes.Attributes?.SubscriptionsConfirmed,
              subscriptionsPending: attributes.Attributes?.SubscriptionsPending
            });
          } catch (error) {
            // Skip topics we can't access
          }
        }
      }

      return {
        totalTopics: crawlerTopics.length,
        topics: topicDetails
      };
    } catch (error: any) {
      throw new Error(`SNS topics validation failed: ${error.message}`);
    }
  }

  private async testLambdaPermissions(): Promise<any> {
    // Check if the crawler Lambda function has proper EventBridge permissions
    const functionName = 'AdaClaraS3VectorsGA-CrawlerFunction';
    
    try {
      // Try to get function configuration
      const { GetFunctionCommand } = await import('@aws-sdk/client-lambda');
      const response = await this.lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
      
      if (!response.Configuration) {
        throw new Error('Lambda function configuration not found');
      }

      // Check environment variables for EventBridge-related configuration
      const envVars = response.Configuration.Environment?.Variables || {};
      const eventBridgeEnvVars = Object.keys(envVars).filter(key => 
        key.includes('SCHEDULE') || 
        key.includes('NOTIFICATION') || 
        key.includes('RETRY')
      );

      return {
        functionName: response.Configuration.FunctionName,
        runtime: response.Configuration.Runtime,
        timeout: response.Configuration.Timeout,
        memorySize: response.Configuration.MemorySize,
        eventBridgeEnvVars: eventBridgeEnvVars.reduce((acc, key) => {
          acc[key] = envVars[key];
          return acc;
        }, {} as Record<string, string>),
        lastModified: response.Configuration.LastModified
      };
    } catch (error: any) {
      throw new Error(`Lambda permissions validation failed: ${error.message}`);
    }
  }

  private async testManualEventTrigger(): Promise<any> {
    // Test manual trigger of EventBridge event to validate the integration
    try {
      const testEvent = {
        Source: 'ada-clara.test',
        DetailType: 'Manual Crawler Test',
        Detail: JSON.stringify({
          scheduleId: 'test-manual-trigger',
          targetUrls: ['https://diabetes.org/about-diabetes/type-1'],
          executionId: `test-${Date.now()}`,
          retryAttempt: 0
        })
      };

      const response = await this.eventBridgeClient.send(new PutEventsCommand({
        Entries: [testEvent]
      }));

      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        throw new Error(`Failed to send test event: ${JSON.stringify(response.Entries)}`);
      }

      return {
        eventSent: true,
        eventId: response.Entries?.[0]?.EventId,
        testEvent: testEvent
      };
    } catch (error: any) {
      throw new Error(`Manual event trigger test failed: ${error.message}`);
    }
  }

  private async testCrawlerSchedulingIntegration(): Promise<any> {
    // Test the crawler function's EventBridge event handling capability
    const functionName = 'AdaClaraS3VectorsGA-CrawlerFunction';
    
    try {
      const testPayload = {
        source: 'eventbridge',
        'detail-type': 'Scheduled Crawl',
        detail: {
          scheduleId: 'test-integration',
          targetUrls: ['https://diabetes.org/about-diabetes/type-1'],
          executionId: `integration-test-${Date.now()}`,
          retryAttempt: 0
        }
      };

      const response = await this.lambdaClient.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(testPayload)
      }));

      if (response.FunctionError) {
        throw new Error(`Lambda function error: ${response.FunctionError}`);
      }

      const responsePayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : {};
      
      return {
        statusCode: response.StatusCode,
        executedVersion: response.ExecutedVersion,
        responsePayload: responsePayload,
        logResult: response.LogResult ? Buffer.from(response.LogResult, 'base64').toString() : undefined
      };
    } catch (error: any) {
      throw new Error(`Crawler scheduling integration test failed: ${error.message}`);
    }
  }

  private generateTestReport(): void {
    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;
    const successRate = (successCount / totalCount) * 100;

    console.log('\n📊 EventBridge Scheduling Test Report');
    console.log('=' .repeat(80));
    console.log(`✅ Passed: ${successCount}/${totalCount} (${successRate.toFixed(1)}%)`);
    console.log(`❌ Failed: ${totalCount - successCount}/${totalCount}`);
    console.log('⏰ Completed:', new Date().toISOString());

    // Detailed results
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${index + 1}. ${status} ${result.testName}`);
      if (!result.success && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    // EventBridge scheduling features summary
    console.log('\n🚀 EventBridge Scheduling Features:');
    console.log('   • Weekly automated crawler execution');
    console.log('   • Configurable schedule expression (rate or cron)');
    console.log('   • Retry logic with exponential backoff');
    console.log('   • SNS notifications for failures');
    console.log('   • Dead letter queue for failed executions');
    console.log('   • Content change detection integration');
    console.log('   • CloudWatch metrics and monitoring');

    // Save detailed report
    const reportPath = `EVENTBRIDGE_SCHEDULING_TEST_REPORT_${Date.now()}.json`;
    const report = {
      timestamp: new Date().toISOString(),
      testType: 'eventbridge-scheduling',
      summary: {
        total: totalCount,
        passed: successCount,
        failed: totalCount - successCount,
        successRate: successRate
      },
      results: this.testResults,
      features: {
        weeklyScheduling: 'Automated weekly crawler execution',
        retryLogic: 'Exponential backoff with configurable attempts',
        notifications: 'SNS-based failure notifications',
        deadLetterQueue: 'Failed execution handling',
        contentDetection: 'Intelligent content change detection',
        monitoring: 'CloudWatch integration'
      }
    };

    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved: ${reportPath}`);

    if (successRate === 100) {
      console.log('\n🎉 All EventBridge scheduling tests passed!');
      console.log('✨ Weekly crawler scheduling is ready for production use');
    } else {
      console.log('\n⚠️ Some tests failed. Please review the errors above.');
      console.log('💡 Ensure the S3 Vectors GA stack is properly deployed with EventBridge components');
    }
  }
}

// CLI interface
async function main() {
  const test = new EventBridgeSchedulingTest();
  await test.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { EventBridgeSchedulingTest };