#!/usr/bin/env ts-node

/**
 * Enhanced Crawler Deployment Validation Script
 * 
 * This script validates the complete weekly crawler scheduling system including:
 * - EventBridge rule configuration and status
 * - SNS topic setup and subscriptions  
 * - Content tracking table creation and GSI
 * - Lambda function permissions and environment variables
 * - CloudWatch dashboard and alarms
 * - Security validation and compliance features
 * - S3 Vectors GA configuration
 * 
 * Requirements validated: 1.1, 1.4, 2.1, 4.2, 4.5, 6.1-6.5
 */

import { 
  CloudFormationClient, 
  DescribeStacksCommand, 
  DescribeStackResourcesCommand 
} from '@aws-sdk/client-cloudformation';
import { 
  EventBridgeClient, 
  DescribeRuleCommand, 
  ListTargetsByRuleCommand 
} from '@aws-sdk/client-eventbridge';
import { 
  SNSClient, 
  GetTopicAttributesCommand, 
  ListSubscriptionsByTopicCommand 
} from '@aws-sdk/client-sns';
import { 
  DynamoDBClient, 
  DescribeTableCommand 
} from '@aws-sdk/client-dynamodb';
import { 
  LambdaClient, 
  GetFunctionCommand, 
  GetFunctionConfigurationCommand 
} from '@aws-sdk/client-lambda';
import { 
  CloudWatchClient, 
  DescribeAlarmsCommand, 
  ListDashboardsCommand 
} from '@aws-sdk/client-cloudwatch';
import { 
  SQSClient, 
  GetQueueAttributesCommand 
} from '@aws-sdk/client-sqs';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

class EnhancedCrawlerValidator {
  private cfClient: CloudFormationClient;
  private eventBridgeClient: EventBridgeClient;
  private snsClient: SNSClient;
  private dynamoClient: DynamoDBClient;
  private lambdaClient: LambdaClient;
  private cloudWatchClient: CloudWatchClient;
  private sqsClient: SQSClient;
  private results: ValidationResult[] = [];

  constructor() {
    const region = 'us-east-1';
    this.cfClient = new CloudFormationClient({ region });
    this.eventBridgeClient = new EventBridgeClient({ region });
    this.snsClient = new SNSClient({ region });
    this.dynamoClient = new DynamoDBClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.cloudWatchClient = new CloudWatchClient({ region });
    this.sqsClient = new SQSClient({ region });
  }

  async validateDeployment(): Promise<boolean> {
    console.log('🔍 Enhanced Crawler Deployment Validation');
    console.log('=' .repeat(80));
    console.log('📋 Validating weekly crawler scheduling system components...');
    console.log('⏰ Started:', new Date().toISOString());
    console.log('=' .repeat(80));

    try {
      // Step 1: Validate CloudFormation stack exists and is complete
      await this.validateCloudFormationStack();

      // Step 2: Validate EventBridge scheduling components
      await this.validateEventBridgeScheduling();

      // Step 3: Validate SNS notification system
      await this.validateSNSNotifications();

      // Step 4: Validate DynamoDB content tracking
      await this.validateDynamoDBContentTracking();

      // Step 5: Validate Lambda function configuration
      await this.validateLambdaConfiguration();

      // Step 6: Validate CloudWatch monitoring
      await this.validateCloudWatchMonitoring();

      // Step 7: Validate SQS dead letter queue
      await this.validateSQSDeadLetterQueue();

      // Step 8: Validate security and compliance features
      await this.validateSecurityCompliance();

      // Step 9: Validate S3 Vectors GA configuration
      await this.validateS3VectorsGA();

      // Generate validation report
      this.generateValidationReport();

      const failedValidations = this.results.filter(r => r.status === 'FAIL');
      const warningValidations = this.results.filter(r => r.status === 'WARNING');

      if (failedValidations.length > 0) {
        console.log(`\n❌ Validation FAILED: ${failedValidations.length} critical issues found`);
        return false;
      } else if (warningValidations.length > 0) {
        console.log(`\n⚠️ Validation PASSED with warnings: ${warningValidations.length} non-critical issues`);
        return true;
      } else {
        console.log('\n✅ Validation PASSED: All components configured correctly');
        return true;
      }

    } catch (error: any) {
      console.error('\n❌ Validation failed with error:', error.message);
      this.results.push({
        component: 'Validation Process',
        status: 'FAIL',
        message: `Validation process failed: ${error.message}`
      });
      return false;
    }
  }

  private async validateCloudFormationStack(): Promise<void> {
    console.log('\n📦 Validating CloudFormation Stack...');
    
    try {
      const response = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const stack = response.Stacks?.[0];
      if (!stack) {
        this.results.push({
          component: 'CloudFormation Stack',
          status: 'FAIL',
          message: 'AdaClaraS3VectorsGA stack not found'
        });
        return;
      }

      if (stack.StackStatus === 'CREATE_COMPLETE' || stack.StackStatus === 'UPDATE_COMPLETE') {
        this.results.push({
          component: 'CloudFormation Stack',
          status: 'PASS',
          message: `Stack status: ${stack.StackStatus}`,
          details: {
            stackName: stack.StackName,
            status: stack.StackStatus,
            creationTime: stack.CreationTime,
            lastUpdatedTime: stack.LastUpdatedTime
          }
        });
        console.log('   ✅ CloudFormation stack is in healthy state');
      } else {
        this.results.push({
          component: 'CloudFormation Stack',
          status: 'FAIL',
          message: `Stack in unexpected state: ${stack.StackStatus}`
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'CloudFormation Stack',
        status: 'FAIL',
        message: `Failed to describe stack: ${error.message}`
      });
    }
  }

  private async validateEventBridgeScheduling(): Promise<void> {
    console.log('\n⏰ Validating EventBridge Scheduling...');
    
    try {
      // Validate EventBridge rule exists and is enabled
      const ruleResponse = await this.eventBridgeClient.send(new DescribeRuleCommand({
        Name: 'ada-clara-weekly-crawler-schedule'
      }));

      if (ruleResponse.State === 'ENABLED') {
        this.results.push({
          component: 'EventBridge Rule',
          status: 'PASS',
          message: 'Weekly crawler schedule rule is enabled',
          details: {
            ruleName: ruleResponse.Name,
            scheduleExpression: ruleResponse.ScheduleExpression,
            state: ruleResponse.State,
            description: ruleResponse.Description
          }
        });
        console.log('   ✅ EventBridge rule is enabled and configured');
      } else {
        this.results.push({
          component: 'EventBridge Rule',
          status: 'WARNING',
          message: `EventBridge rule state: ${ruleResponse.State}`
        });
      }

      // Validate rule targets
      const targetsResponse = await this.eventBridgeClient.send(new ListTargetsByRuleCommand({
        Rule: 'ada-clara-weekly-crawler-schedule'
      }));

      if (targetsResponse.Targets && targetsResponse.Targets.length > 0) {
        const lambdaTarget = targetsResponse.Targets.find(t => t.Arn?.includes('lambda'));
        if (lambdaTarget) {
          this.results.push({
            component: 'EventBridge Targets',
            status: 'PASS',
            message: 'Lambda target configured for EventBridge rule',
            details: {
              targetCount: targetsResponse.Targets.length,
              lambdaTargetArn: lambdaTarget.Arn
            }
          });
          console.log('   ✅ EventBridge targets configured correctly');
        } else {
          this.results.push({
            component: 'EventBridge Targets',
            status: 'FAIL',
            message: 'No Lambda target found for EventBridge rule'
          });
        }
      } else {
        this.results.push({
          component: 'EventBridge Targets',
          status: 'FAIL',
          message: 'No targets configured for EventBridge rule'
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'EventBridge Scheduling',
        status: 'FAIL',
        message: `Failed to validate EventBridge: ${error.message}`
      });
    }
  }

  private async validateSNSNotifications(): Promise<void> {
    console.log('\n📧 Validating SNS Notifications...');
    
    try {
      // Get SNS topic ARN from CloudFormation outputs
      const stackResponse = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const failureTopicOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'FailureNotificationTopicArn'
      );

      if (!failureTopicOutput?.OutputValue) {
        this.results.push({
          component: 'SNS Topic',
          status: 'FAIL',
          message: 'Failure notification topic ARN not found in stack outputs'
        });
        return;
      }

      // Validate SNS topic attributes
      const topicResponse = await this.snsClient.send(new GetTopicAttributesCommand({
        TopicArn: failureTopicOutput.OutputValue
      }));

      this.results.push({
        component: 'SNS Topic',
        status: 'PASS',
        message: 'Failure notification topic exists and is accessible',
        details: {
          topicArn: failureTopicOutput.OutputValue,
          displayName: topicResponse.Attributes?.DisplayName,
          subscriptionsConfirmed: topicResponse.Attributes?.SubscriptionsConfirmed
        }
      });
      console.log('   ✅ SNS failure notification topic configured');

      // Validate subscriptions (optional - may not have email configured)
      const subscriptionsResponse = await this.snsClient.send(new ListSubscriptionsByTopicCommand({
        TopicArn: failureTopicOutput.OutputValue
      }));

      if (subscriptionsResponse.Subscriptions && subscriptionsResponse.Subscriptions.length > 0) {
        this.results.push({
          component: 'SNS Subscriptions',
          status: 'PASS',
          message: `${subscriptionsResponse.Subscriptions.length} subscription(s) configured`,
          details: {
            subscriptions: subscriptionsResponse.Subscriptions.map(sub => ({
              protocol: sub.Protocol,
              endpoint: sub.Endpoint,
              subscriptionArn: sub.SubscriptionArn
            }))
          }
        });
        console.log('   ✅ SNS subscriptions configured');
      } else {
        this.results.push({
          component: 'SNS Subscriptions',
          status: 'WARNING',
          message: 'No email subscriptions configured for failure notifications'
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'SNS Notifications',
        status: 'FAIL',
        message: `Failed to validate SNS: ${error.message}`
      });
    }
  }

  private async validateDynamoDBContentTracking(): Promise<void> {
    console.log('\n🗄️ Validating DynamoDB Content Tracking...');
    
    try {
      // Validate content tracking table
      const tableResponse = await this.dynamoClient.send(new DescribeTableCommand({
        TableName: 'ada-clara-content-tracking'
      }));

      if (tableResponse.Table?.TableStatus === 'ACTIVE') {
        this.results.push({
          component: 'DynamoDB Content Tracking Table',
          status: 'PASS',
          message: 'Content tracking table is active',
          details: {
            tableName: tableResponse.Table.TableName,
            status: tableResponse.Table.TableStatus,
            itemCount: tableResponse.Table.ItemCount,
            gsiCount: tableResponse.Table.GlobalSecondaryIndexes?.length || 0
          }
        });
        console.log('   ✅ Content tracking table is active');

        // Validate GSI for efficient queries
        const gsi = tableResponse.Table.GlobalSecondaryIndexes?.find(
          index => index.IndexName === 'GSI-LastCrawled'
        );

        if (gsi && gsi.IndexStatus === 'ACTIVE') {
          this.results.push({
            component: 'DynamoDB GSI',
            status: 'PASS',
            message: 'GSI-LastCrawled index is active',
            details: {
              indexName: gsi.IndexName,
              status: gsi.IndexStatus,
              itemCount: gsi.ItemCount
            }
          });
          console.log('   ✅ GSI for content queries is active');
        } else {
          this.results.push({
            component: 'DynamoDB GSI',
            status: 'FAIL',
            message: 'GSI-LastCrawled index not found or not active'
          });
        }

      } else {
        this.results.push({
          component: 'DynamoDB Content Tracking Table',
          status: 'FAIL',
          message: `Table status: ${tableResponse.Table?.TableStatus}`
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'DynamoDB Content Tracking',
        status: 'FAIL',
        message: `Failed to validate DynamoDB: ${error.message}`
      });
    }
  }

  private async validateLambdaConfiguration(): Promise<void> {
    console.log('\n🔧 Validating Lambda Configuration...');
    
    try {
      // Get Lambda function name from CloudFormation
      const stackResponse = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const functionOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'CrawlerFunctionName'
      );

      if (!functionOutput?.OutputValue) {
        this.results.push({
          component: 'Lambda Function',
          status: 'FAIL',
          message: 'Crawler function name not found in stack outputs'
        });
        return;
      }

      // Validate Lambda function configuration
      const functionResponse = await this.lambdaClient.send(new GetFunctionConfigurationCommand({
        FunctionName: functionOutput.OutputValue
      }));

      if (functionResponse.State === 'Active') {
        this.results.push({
          component: 'Lambda Function',
          status: 'PASS',
          message: 'Crawler Lambda function is active',
          details: {
            functionName: functionResponse.FunctionName,
            state: functionResponse.State,
            runtime: functionResponse.Runtime,
            timeout: functionResponse.Timeout,
            memorySize: functionResponse.MemorySize
          }
        });
        console.log('   ✅ Lambda function is active and configured');

        // Validate required environment variables
        const requiredEnvVars = [
          'VECTORS_BUCKET',
          'VECTOR_INDEX',
          'CONTENT_TRACKING_TABLE',
          'FAILURE_NOTIFICATION_TOPIC',
          'SCHEDULE_EXPRESSION',
          'ALLOWED_DOMAINS'
        ];

        const missingEnvVars = requiredEnvVars.filter(
          envVar => !functionResponse.Environment?.Variables?.[envVar]
        );

        if (missingEnvVars.length === 0) {
          this.results.push({
            component: 'Lambda Environment Variables',
            status: 'PASS',
            message: 'All required environment variables configured',
            details: {
              configuredVars: Object.keys(functionResponse.Environment?.Variables || {}).length,
              requiredVars: requiredEnvVars.length
            }
          });
          console.log('   ✅ Lambda environment variables configured');
        } else {
          this.results.push({
            component: 'Lambda Environment Variables',
            status: 'FAIL',
            message: `Missing environment variables: ${missingEnvVars.join(', ')}`
          });
        }

      } else {
        this.results.push({
          component: 'Lambda Function',
          status: 'FAIL',
          message: `Lambda function state: ${functionResponse.State}`
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'Lambda Configuration',
        status: 'FAIL',
        message: `Failed to validate Lambda: ${error.message}`
      });
    }
  }

  private async validateCloudWatchMonitoring(): Promise<void> {
    console.log('\n📊 Validating CloudWatch Monitoring...');
    
    try {
      // Validate CloudWatch dashboard
      const dashboardsResponse = await this.cloudWatchClient.send(new ListDashboardsCommand({}));
      
      const crawlerDashboard = dashboardsResponse.DashboardEntries?.find(
        dashboard => dashboard.DashboardName?.includes('ada-clara-crawler-monitoring')
      );

      if (crawlerDashboard) {
        this.results.push({
          component: 'CloudWatch Dashboard',
          status: 'PASS',
          message: 'Crawler monitoring dashboard exists',
          details: {
            dashboardName: crawlerDashboard.DashboardName,
            lastModified: crawlerDashboard.LastModified
          }
        });
        console.log('   ✅ CloudWatch dashboard configured');
      } else {
        this.results.push({
          component: 'CloudWatch Dashboard',
          status: 'WARNING',
          message: 'Crawler monitoring dashboard not found'
        });
      }

      // Validate CloudWatch alarms
      const alarmsResponse = await this.cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNamePrefix: 'ada-clara-crawler'
      }));

      const expectedAlarms = [
        'ada-clara-crawler-execution-failures',
        'ada-clara-crawler-high-latency',
        'ada-clara-content-detection-low-efficiency'
      ];

      const foundAlarms = alarmsResponse.MetricAlarms?.filter(alarm => 
        expectedAlarms.some(expected => alarm.AlarmName?.includes(expected))
      ) || [];

      if (foundAlarms.length >= 2) { // At least 2 of 3 expected alarms
        this.results.push({
          component: 'CloudWatch Alarms',
          status: 'PASS',
          message: `${foundAlarms.length} crawler monitoring alarms configured`,
          details: {
            alarms: foundAlarms.map(alarm => ({
              name: alarm.AlarmName,
              state: alarm.StateValue,
              threshold: alarm.Threshold
            }))
          }
        });
        console.log('   ✅ CloudWatch alarms configured');
      } else {
        this.results.push({
          component: 'CloudWatch Alarms',
          status: 'WARNING',
          message: `Only ${foundAlarms.length} crawler alarms found, expected at least 2`
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'CloudWatch Monitoring',
        status: 'FAIL',
        message: `Failed to validate CloudWatch: ${error.message}`
      });
    }
  }

  private async validateSQSDeadLetterQueue(): Promise<void> {
    console.log('\n📦 Validating SQS Dead Letter Queue...');
    
    try {
      // Get DLQ URL from CloudFormation outputs
      const stackResponse = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const dlqOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'CrawlerDeadLetterQueueUrl'
      );

      if (!dlqOutput?.OutputValue) {
        this.results.push({
          component: 'SQS Dead Letter Queue',
          status: 'FAIL',
          message: 'Dead letter queue URL not found in stack outputs'
        });
        return;
      }

      // Validate SQS queue attributes
      const queueResponse = await this.sqsClient.send(new GetQueueAttributesCommand({
        QueueUrl: dlqOutput.OutputValue,
        AttributeNames: ['All']
      }));

      this.results.push({
        component: 'SQS Dead Letter Queue',
        status: 'PASS',
        message: 'Dead letter queue is configured and accessible',
        details: {
          queueUrl: dlqOutput.OutputValue,
          messageRetentionPeriod: queueResponse.Attributes?.MessageRetentionPeriod,
          visibilityTimeout: queueResponse.Attributes?.VisibilityTimeout,
          approximateNumberOfMessages: queueResponse.Attributes?.ApproximateNumberOfMessages
        }
      });
      console.log('   ✅ SQS dead letter queue configured');

    } catch (error: any) {
      this.results.push({
        component: 'SQS Dead Letter Queue',
        status: 'FAIL',
        message: `Failed to validate SQS: ${error.message}`
      });
    }
  }

  private async validateSecurityCompliance(): Promise<void> {
    console.log('\n🔐 Validating Security and Compliance...');
    
    try {
      // Get security configuration from CloudFormation outputs
      const stackResponse = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const securityOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'SecurityConfiguration'
      );

      const eventBridgeRoleOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'EventBridgeExecutionRoleArn'
      );

      if (securityOutput?.OutputValue && eventBridgeRoleOutput?.OutputValue) {
        const securityConfig = JSON.parse(securityOutput.OutputValue);
        
        this.results.push({
          component: 'Security Configuration',
          status: 'PASS',
          message: 'Security and compliance features configured',
          details: {
            allowedDomains: securityConfig.allowedDomains,
            encryptionRequired: securityConfig.encryptionRequired,
            rateLimiting: securityConfig.rateLimiting,
            auditLogging: securityConfig.auditLogging,
            eventBridgeRole: eventBridgeRoleOutput.OutputValue
          }
        });
        console.log('   ✅ Security and compliance features configured');

        // Validate specific security requirements
        if (securityConfig.allowedDomains?.includes('diabetes.org')) {
          this.results.push({
            component: 'URL Validation',
            status: 'PASS',
            message: 'Domain whitelist includes diabetes.org'
          });
        } else {
          this.results.push({
            component: 'URL Validation',
            status: 'FAIL',
            message: 'Domain whitelist does not include diabetes.org'
          });
        }

        if (securityConfig.encryptionRequired === 'SSE-S3') {
          this.results.push({
            component: 'Encryption Validation',
            status: 'PASS',
            message: 'SSE-S3 encryption enforced'
          });
        } else {
          this.results.push({
            component: 'Encryption Validation',
            status: 'WARNING',
            message: 'Encryption configuration may not be optimal'
          });
        }

      } else {
        this.results.push({
          component: 'Security Configuration',
          status: 'WARNING',
          message: 'Security configuration outputs not found in stack'
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'Security Compliance',
        status: 'FAIL',
        message: `Failed to validate security: ${error.message}`
      });
    }
  }

  private async validateS3VectorsGA(): Promise<void> {
    console.log('\n🗂️ Validating S3 Vectors GA Configuration...');
    
    try {
      // Get S3 Vectors configuration from CloudFormation outputs
      const stackResponse = await this.cfClient.send(new DescribeStacksCommand({
        StackName: 'AdaClaraS3VectorsGA'
      }));

      const vectorsBucketOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'VectorsBucketName'
      );

      const vectorIndexOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'VectorIndexName'
      );

      const gaFeaturesOutput = stackResponse.Stacks?.[0]?.Outputs?.find(
        output => output.OutputKey === 'GAFeatures'
      );

      if (vectorsBucketOutput?.OutputValue && vectorIndexOutput?.OutputValue) {
        this.results.push({
          component: 'S3 Vectors GA',
          status: 'PASS',
          message: 'S3 Vectors GA bucket and index configured',
          details: {
            bucketName: vectorsBucketOutput.OutputValue,
            indexName: vectorIndexOutput.OutputValue,
            gaFeatures: gaFeaturesOutput?.OutputValue ? JSON.parse(gaFeaturesOutput.OutputValue) : null
          }
        });
        console.log('   ✅ S3 Vectors GA configuration validated');

        // Validate GA-specific features
        if (gaFeaturesOutput?.OutputValue) {
          const gaFeatures = JSON.parse(gaFeaturesOutput.OutputValue);
          
          if (gaFeatures.maxVectorsPerIndex === '2,000,000,000') {
            this.results.push({
              component: 'S3 Vectors GA Features',
              status: 'PASS',
              message: 'GA scale features configured (2B vectors per index)'
            });
          }

          if (gaFeatures.queryLatency === 'sub-100ms for frequent queries') {
            this.results.push({
              component: 'S3 Vectors GA Performance',
              status: 'PASS',
              message: 'GA performance features configured (sub-100ms latency)'
            });
          }
        }

      } else {
        this.results.push({
          component: 'S3 Vectors GA',
          status: 'FAIL',
          message: 'S3 Vectors GA bucket or index not found in stack outputs'
        });
      }

    } catch (error: any) {
      this.results.push({
        component: 'S3 Vectors GA',
        status: 'FAIL',
        message: `Failed to validate S3 Vectors GA: ${error.message}`
      });
    }
  }

  private generateValidationReport(): void {
    console.log('\n📊 Enhanced Crawler Deployment Validation Report');
    console.log('=' .repeat(80));

    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;
    const warnCount = this.results.filter(r => r.status === 'WARNING').length;

    console.log(`📈 Summary: ${passCount} PASS, ${failCount} FAIL, ${warnCount} WARNING`);
    console.log('=' .repeat(80));

    // Group results by status
    const groupedResults = {
      PASS: this.results.filter(r => r.status === 'PASS'),
      FAIL: this.results.filter(r => r.status === 'FAIL'),
      WARNING: this.results.filter(r => r.status === 'WARNING')
    };

    // Display results by status
    Object.entries(groupedResults).forEach(([status, results]) => {
      if (results.length > 0) {
        const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`\n${icon} ${status} (${results.length}):`);
        
        results.forEach(result => {
          console.log(`   • ${result.component}: ${result.message}`);
          if (result.details && Object.keys(result.details).length > 0) {
            console.log(`     Details: ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n     ')}`);
          }
        });
      }
    });

    // Save detailed report to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: passCount,
        failed: failCount,
        warnings: warnCount
      },
      results: this.results,
      overallStatus: failCount > 0 ? 'FAILED' : warnCount > 0 ? 'PASSED_WITH_WARNINGS' : 'PASSED'
    };

    const reportPath = `ENHANCED_CRAWLER_VALIDATION_REPORT_${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Detailed report saved: ${reportPath}`);
    console.log('⏰ Completed:', new Date().toISOString());
  }
}

// CLI interface
async function main() {
  const validator = new EnhancedCrawlerValidator();
  const success = await validator.validateDeployment();
  
  if (success) {
    console.log('\n🎉 Enhanced crawler deployment validation completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Enhanced crawler deployment validation failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { EnhancedCrawlerValidator };