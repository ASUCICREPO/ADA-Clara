import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

/**
 * Admin Analytics Stack for ADA Clara Chatbot
 * Provides analytics processing, monitoring, and admin dashboard APIs
 */
export class AdminAnalyticsStack extends Stack {
  public readonly analyticsLambda: lambda.Function;
  public readonly adminApi: apigateway.RestApi;
  public readonly analyticsDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ===== LAMBDA FUNCTION =====

    this.analyticsLambda = new lambda.Function(this, 'AdminAnalyticsLambda', {
      functionName: `ada-clara-admin-analytics-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/admin-analytics'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        ANALYTICS_TABLE: 'ada-clara-analytics',
        ESCALATION_QUEUE_TABLE: 'ada-clara-escalation-queue',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences',
        KNOWLEDGE_CONTENT_TABLE: 'ada-clara-knowledge-content',
        // New enhanced tables from Task 1
        CONVERSATIONS_TABLE: 'ada-clara-conversations',
        MESSAGES_TABLE: 'ada-clara-messages',
        QUESTIONS_TABLE: 'ada-clara-questions',
        // Enhanced unanswered question tracking table (Task 6)
        UNANSWERED_QUESTIONS_TABLE: 'ada-clara-unanswered-questions'
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      reservedConcurrentExecutions: 20
    });

    // ===== IAM PERMISSIONS =====

    // DynamoDB permissions for all tables
    this.analyticsLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
      ]
    }));

    // S3 permissions for health checks
    this.analyticsLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListBucket',
        's3:GetBucketLocation'
      ],
      resources: [
        `arn:aws:s3:::ada-clara-*`
      ]
    }));

    // CloudWatch permissions for metrics
    this.analyticsLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:GetMetricData',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*']
    }));

    // ===== API GATEWAY =====

    this.adminApi = new apigateway.RestApi(this, 'AdminAnalyticsAPI', {
      restApiName: `ada-clara-admin-api-${this.account}`,
      description: 'ADA Clara Admin Dashboard API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ]
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true
      }
    });

    // Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(this.analyticsLambda, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    // Admin resource
    const adminResource = this.adminApi.root.addResource('admin');

    // Dashboard endpoint (enhanced)
    const dashboardResource = adminResource.addResource('dashboard');
    dashboardResource.addMethod('GET', lambdaIntegration);
    dashboardResource.addMethod('OPTIONS', lambdaIntegration);

    // Conversations endpoint (new)
    const conversationsResource = adminResource.addResource('conversations');
    conversationsResource.addMethod('GET', lambdaIntegration);
    conversationsResource.addMethod('OPTIONS', lambdaIntegration);

    // Specific conversation endpoint (new)
    const conversationDetailResource = conversationsResource.addResource('{conversationId}');
    conversationDetailResource.addMethod('GET', lambdaIntegration);
    conversationDetailResource.addMethod('OPTIONS', lambdaIntegration);

    // Questions endpoint (existing)
    const questionsResource = adminResource.addResource('questions');
    questionsResource.addMethod('GET', lambdaIntegration);
    questionsResource.addMethod('OPTIONS', lambdaIntegration);

    // Enhanced questions endpoint (new)
    const questionsEnhancedResource = questionsResource.addResource('enhanced');
    questionsEnhancedResource.addMethod('GET', lambdaIntegration);
    questionsEnhancedResource.addMethod('OPTIONS', lambdaIntegration);

    // Question ranking endpoint (new)
    const questionsRankingResource = questionsResource.addResource('ranking');
    questionsRankingResource.addMethod('GET', lambdaIntegration);
    questionsRankingResource.addMethod('OPTIONS', lambdaIntegration);

    // Escalations endpoint (new)
    const escalationsResource = adminResource.addResource('escalations');
    escalationsResource.addMethod('GET', lambdaIntegration);
    escalationsResource.addMethod('OPTIONS', lambdaIntegration);

    // Escalation triggers endpoint (new)
    const escalationTriggersResource = escalationsResource.addResource('triggers');
    escalationTriggersResource.addMethod('GET', lambdaIntegration);
    escalationTriggersResource.addMethod('OPTIONS', lambdaIntegration);

    // Escalation reasons endpoint (new)
    const escalationReasonsResource = escalationsResource.addResource('reasons');
    escalationReasonsResource.addMethod('GET', lambdaIntegration);
    escalationReasonsResource.addMethod('OPTIONS', lambdaIntegration);

    // Real-time metrics endpoint (enhanced)
    const realtimeResource = adminResource.addResource('realtime');
    realtimeResource.addMethod('GET', lambdaIntegration);
    realtimeResource.addMethod('OPTIONS', lambdaIntegration);

    // Chat history endpoint (legacy - maintained for backward compatibility)
    const chatHistoryResource = adminResource.addResource('chat-history');
    chatHistoryResource.addMethod('GET', lambdaIntegration);
    chatHistoryResource.addMethod('OPTIONS', lambdaIntegration);

    // Health endpoint
    const healthResource = adminResource.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration);
    healthResource.addMethod('OPTIONS', lambdaIntegration);

    // ===== SCHEDULED ANALYTICS PROCESSING =====

    // EventBridge rule for periodic analytics aggregation
    const analyticsRule = new events.Rule(this, 'AnalyticsAggregationRule', {
      ruleName: `ada-clara-analytics-aggregation-${this.account}`,
      description: 'Trigger analytics aggregation every hour',
      schedule: events.Schedule.rate(Duration.hours(1))
    });

    // Add Lambda target to the rule
    analyticsRule.addTarget(new targets.LambdaFunction(this.analyticsLambda, {
      event: events.RuleTargetInput.fromObject({
        source: 'eventbridge',
        action: 'aggregate-analytics',
        timestamp: events.EventField.fromPath('$.time')
      })
    }));

    // ===== CLOUDWATCH DASHBOARD =====

    this.analyticsDashboard = new cloudwatch.Dashboard(this, 'AdminAnalyticsDashboard', {
      dashboardName: `ada-clara-admin-analytics-${this.account}`,
      widgets: [
        [
          // API Gateway metrics
          new cloudwatch.GraphWidget({
            title: 'Admin API Performance',
            left: [
              this.adminApi.metricCount(),
              this.adminApi.metricLatency(),
              this.adminApi.metricClientError(),
              this.adminApi.metricServerError()
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // Lambda metrics
          new cloudwatch.GraphWidget({
            title: 'Analytics Lambda Performance',
            left: [
              this.analyticsLambda.metricInvocations(),
              this.analyticsLambda.metricErrors(),
              this.analyticsLambda.metricDuration(),
              this.analyticsLambda.metricThrottles()
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // System overview
          new cloudwatch.SingleValueWidget({
            title: 'API Requests (24h)',
            metrics: [
              this.adminApi.metricCount({
                period: Duration.days(1),
                statistic: 'Sum'
              })
            ],
            width: 6,
            height: 3
          }),
          new cloudwatch.SingleValueWidget({
            title: 'Average Response Time',
            metrics: [
              this.adminApi.metricLatency({
                period: Duration.hours(1),
                statistic: 'Average'
              })
            ],
            width: 6,
            height: 3
          })
        ],
        [
          // Enhanced endpoint metrics
          new cloudwatch.GraphWidget({
            title: 'New Endpoint Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Count',
                dimensionsMap: {
                  ApiName: this.adminApi.restApiName,
                  Resource: '/admin/conversations'
                },
                period: Duration.minutes(5)
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Count',
                dimensionsMap: {
                  ApiName: this.adminApi.restApiName,
                  Resource: '/admin/questions'
                },
                period: Duration.minutes(5)
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Count',
                dimensionsMap: {
                  ApiName: this.adminApi.restApiName,
                  Resource: '/admin/escalations'
                },
                period: Duration.minutes(5)
              })
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // DynamoDB table metrics
          new cloudwatch.GraphWidget({
            title: 'DynamoDB Table Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: {
                  TableName: 'ada-clara-conversations'
                },
                period: Duration.minutes(5)
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: {
                  TableName: 'ada-clara-messages'
                },
                period: Duration.minutes(5)
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: {
                  TableName: 'ada-clara-questions'
                },
                period: Duration.minutes(5)
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: {
                  TableName: 'ada-clara-unanswered-questions'
                },
                period: Duration.minutes(5)
              })
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // Error rates
          new cloudwatch.SingleValueWidget({
            title: 'Error Rate (%)',
            metrics: [
              this.adminApi.metricClientError({
                period: Duration.hours(1),
                statistic: 'Sum'
              })
            ],
            width: 6,
            height: 3
          }),
          new cloudwatch.SingleValueWidget({
            title: 'Lambda Errors',
            metrics: [
              this.analyticsLambda.metricErrors({
                period: Duration.hours(1),
                statistic: 'Sum'
              })
            ],
            width: 6,
            height: 3
          })
        ]
      ]
    });

    // ===== CLOUDWATCH ALARMS =====

    // High error rate alarm
    const highErrorAlarm = new cloudwatch.Alarm(this, 'AdminAPIHighErrorRate', {
      alarmName: `ada-clara-admin-api-high-errors-${this.account}`,
      alarmDescription: 'High error rate in Admin API',
      metric: this.adminApi.metricServerError({
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // High latency alarm
    const highLatencyAlarm = new cloudwatch.Alarm(this, 'AdminAPIHighLatency', {
      alarmName: `ada-clara-admin-api-high-latency-${this.account}`,
      alarmDescription: 'High latency in Admin API',
      metric: this.adminApi.metricLatency({
        period: Duration.minutes(5)
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Lambda error alarm
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'AdminLambdaErrors', {
      alarmName: `ada-clara-admin-lambda-errors-${this.account}`,
      alarmDescription: 'Errors in Admin Analytics Lambda',
      metric: this.analyticsLambda.metricErrors({
        period: Duration.minutes(5)
      }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Enhanced monitoring alarms for new endpoints
    const conversationEndpointAlarm = new cloudwatch.Alarm(this, 'ConversationEndpointErrors', {
      alarmName: `ada-clara-conversation-endpoint-errors-${this.account}`,
      alarmDescription: 'High error rate in conversation analytics endpoint',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: this.adminApi.restApiName,
          Resource: '/admin/conversations',
          Method: 'GET'
        },
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    const questionAnalysisAlarm = new cloudwatch.Alarm(this, 'QuestionAnalysisErrors', {
      alarmName: `ada-clara-question-analysis-errors-${this.account}`,
      alarmDescription: 'High error rate in question analysis endpoints',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: this.adminApi.restApiName,
          Resource: '/admin/questions',
          Method: 'GET'
        },
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    const escalationAnalysisAlarm = new cloudwatch.Alarm(this, 'EscalationAnalysisErrors', {
      alarmName: `ada-clara-escalation-analysis-errors-${this.account}`,
      alarmDescription: 'High error rate in escalation analysis endpoints',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: this.adminApi.restApiName,
          Resource: '/admin/escalations',
          Method: 'GET'
        },
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // DynamoDB throttling alarms for new tables
    const conversationTableThrottleAlarm = new cloudwatch.Alarm(this, 'ConversationTableThrottle', {
      alarmName: `ada-clara-conversations-table-throttle-${this.account}`,
      alarmDescription: 'Throttling detected on conversations table',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: 'ada-clara-conversations'
        },
        period: Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    const messagesTableThrottleAlarm = new cloudwatch.Alarm(this, 'MessagesTableThrottle', {
      alarmName: `ada-clara-messages-table-throttle-${this.account}`,
      alarmDescription: 'Throttling detected on messages table',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: 'ada-clara-messages'
        },
        period: Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    const questionsTableThrottleAlarm = new cloudwatch.Alarm(this, 'QuestionsTableThrottle', {
      alarmName: `ada-clara-questions-table-throttle-${this.account}`,
      alarmDescription: 'Throttling detected on questions table',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: 'ada-clara-questions'
        },
        period: Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    const unansweredQuestionsTableThrottleAlarm = new cloudwatch.Alarm(this, 'UnansweredQuestionsTableThrottle', {
      alarmName: `ada-clara-unanswered-questions-table-throttle-${this.account}`,
      alarmDescription: 'Throttling detected on unanswered questions table',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: 'ada-clara-unanswered-questions'
        },
        period: Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // ===== OUTPUTS =====

    new CfnOutput(this, 'AdminAPIEndpoint', {
      value: this.adminApi.url,
      description: 'Admin Analytics API Gateway endpoint',
      exportName: 'AdaClaraAdminAPIEndpoint'
    });

    new CfnOutput(this, 'AdminDashboardURL', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.analyticsDashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL for Admin Analytics',
      exportName: 'AdaClaraAdminDashboardURL'
    });

    new CfnOutput(this, 'AdminLambdaArn', {
      value: this.analyticsLambda.functionArn,
      description: 'Admin Analytics Lambda function ARN',
      exportName: 'AdaClaraAdminLambdaArn'
    });
  }

  /**
   * Grant permissions to invoke admin analytics endpoints
   */
  public grantInvokeAdmin(grantee: iam.IGrantable): void {
    this.analyticsLambda.grantInvoke(grantee);
  }

  /**
   * Get API Gateway URL for integration
   */
  public getApiUrl(): string {
    return this.adminApi.url;
  }

  /**
   * Get Lambda function for cross-stack references
   */
  public getLambdaFunction(): lambda.Function {
    return this.analyticsLambda;
  }
}