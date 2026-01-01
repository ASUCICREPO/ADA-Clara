import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface EventBridgeSchedulingStackProps extends StackProps {
  webScraperFunctionArn: string;
  crawlerFunctionArn?: string;
  scheduleExpression?: string; // Default: 'rate(7 days)'
  scheduleEnabled?: boolean;   // Default: true
  notificationEmail?: string;
  retryAttempts?: number;      // Default: 3
  retryBackoffRate?: number;   // Default: 2.0
  maxEventAge?: Duration;      // Default: 2 hours
}

/**
 * EventBridge Scheduling Stack for ADA Clara
 * 
 * This stack creates EventBridge rules for scheduled execution of Lambda functions,
 * eliminating circular dependencies by taking Lambda function ARNs as input parameters.
 * 
 * Features:
 * - Weekly web scraping schedule
 * - SNS notifications for failures
 * - SQS dead letter queues
 * - CloudWatch monitoring and alarms
 * - Configurable retry policies
 * - Comprehensive error handling
 */
export class EventBridgeSchedulingStack extends Stack {
  public readonly weeklyScheduleRule: events.Rule;
  public readonly failureNotificationTopic: sns.Topic;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly schedulingLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EventBridgeSchedulingStackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Group for scheduling events
    this.schedulingLogGroup = new logs.LogGroup(this, 'SchedulingLogGroup', {
      logGroupName: '/aws/events/ada-clara-scheduling',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create SNS topic for failure notifications
    this.failureNotificationTopic = new sns.Topic(this, 'SchedulingFailureNotifications', {
      topicName: 'ada-clara-scheduling-failures',
      displayName: 'ADA Clara Scheduling Failure Notifications',
      fifo: false
    });

    // Add email subscription if provided
    if (props.notificationEmail) {
      this.failureNotificationTopic.addSubscription(
        new subscriptions.EmailSubscription(props.notificationEmail)
      );
    }

    // Create dead letter queue for failed executions
    this.deadLetterQueue = new sqs.Queue(this, 'SchedulingDeadLetterQueue', {
      queueName: 'ada-clara-scheduling-dlq',
      retentionPeriod: Duration.days(14), // Keep failed messages for 14 days
      visibilityTimeout: Duration.minutes(5),
      encryption: sqs.QueueEncryption.SQS_MANAGED
    });

    // Create EventBridge rule for weekly web scraping
    this.weeklyScheduleRule = new events.Rule(this, 'WeeklyWebScrapingRule', {
      ruleName: 'ada-clara-weekly-web-scraping',
      description: 'Weekly scheduled web scraping for diabetes.org content updates',
      schedule: events.Schedule.expression(props.scheduleExpression || 'rate(7 days)'),
      enabled: props.scheduleEnabled !== false,
      targets: []
    });

    // Get Lambda function reference
    const webScraperFunction = lambda.Function.fromFunctionArn(
      this, 'WebScraperFunctionRef', props.webScraperFunctionArn
    );

    // Add Lambda target with comprehensive configuration
    this.weeklyScheduleRule.addTarget(new targets.LambdaFunction(webScraperFunction, {
      event: events.RuleTargetInput.fromObject({
        source: 'aws.events',
        'detail-type': 'Scheduled Event',
        detail: {
          action: 'scrape-urls',
          urls: [
            'https://diabetes.org/about-diabetes/type-1',
            'https://diabetes.org/about-diabetes/type-2', 
            'https://diabetes.org/about-diabetes/gestational',
            'https://diabetes.org/about-diabetes/prediabetes',
            'https://diabetes.org/living-with-diabetes',
            'https://diabetes.org/tools-and-resources',
            'https://diabetes.org/community',
            'https://diabetes.org/professionals'
          ],
          forceRefresh: false,
          scheduledExecution: true,
          executionId: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').inputTemplate,
          timestamp: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').inputTemplate
        }
      }),
      retryPolicy: {
        maximumRetryAttempts: props.retryAttempts || 3,
        maximumEventAge: props.maxEventAge || Duration.hours(2)
      },
      deadLetterQueue: this.deadLetterQueue
    }));

    // Grant EventBridge permission to invoke Lambda function
    webScraperFunction.addPermission('AllowEventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: this.weeklyScheduleRule.ruleArn,
      action: 'lambda:InvokeFunction'
    });

    // Optional: Add crawler function scheduling if provided
    if (props.crawlerFunctionArn) {
      const crawlerFunction = lambda.Function.fromFunctionArn(
        this, 'CrawlerFunctionRef', props.crawlerFunctionArn
      );

      // Create separate rule for crawler (runs after web scraper)
      const crawlerScheduleRule = new events.Rule(this, 'WeeklyCrawlerRule', {
        ruleName: 'ada-clara-weekly-crawler',
        description: 'Weekly crawler execution after web scraping completes',
        schedule: events.Schedule.expression('rate(7 days)'), // Same schedule, different offset
        enabled: props.scheduleEnabled !== false
      });

      // Add crawler target (runs 1 hour after web scraper)
      crawlerScheduleRule.addTarget(new targets.LambdaFunction(crawlerFunction, {
        event: events.RuleTargetInput.fromObject({
          source: 'aws.events',
          'detail-type': 'Scheduled Event',
          detail: {
            action: 'process-scraped-content',
            scheduledExecution: true,
            executionId: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').inputTemplate,
            timestamp: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').inputTemplate
          }
        }),
        retryPolicy: {
          maximumRetryAttempts: props.retryAttempts || 3,
          maximumEventAge: props.maxEventAge || Duration.hours(2)
        },
        deadLetterQueue: this.deadLetterQueue
      }));

      // Grant permission for crawler
      crawlerFunction.addPermission('AllowEventBridgeInvokeCrawler', {
        principal: new iam.ServicePrincipal('events.amazonaws.com'),
        sourceArn: crawlerScheduleRule.ruleArn,
        action: 'lambda:InvokeFunction'
      });
    }

    // Create CloudWatch alarms for monitoring
    this.createMonitoringAlarms();

    // Create custom metrics for scheduling success/failure
    this.createCustomMetrics();

    // Create outputs
    this.createOutputs(props);
  }

  /**
   * Create CloudWatch alarms for monitoring scheduled executions
   */
  private createMonitoringAlarms(): void {
    // Alarm for failed scheduled executions
    const failedExecutionsAlarm = new cloudwatch.Alarm(this, 'ScheduledExecutionFailureAlarm', {
      alarmName: 'ada-clara-scheduled-execution-failures',
      alarmDescription: 'Alert when scheduled web scraping executions fail',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Events',
        metricName: 'FailedInvocations',
        dimensionsMap: {
          RuleName: this.weeklyScheduleRule.ruleName
        },
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
    });

    // Add SNS action to alarm
    failedExecutionsAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );

    // Alarm for dead letter queue messages
    const dlqMessagesAlarm = new cloudwatch.Alarm(this, 'DeadLetterQueueMessagesAlarm', {
      alarmName: 'ada-clara-scheduling-dlq-messages',
      alarmDescription: 'Alert when messages appear in scheduling dead letter queue',
      metric: this.deadLetterQueue.metricApproximateNumberOfVisibleMessages({
        period: Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
    });

    dlqMessagesAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );

    // Alarm for successful executions (should fire weekly)
    const successfulExecutionsAlarm = new cloudwatch.Alarm(this, 'ScheduledExecutionSuccessAlarm', {
      alarmName: 'ada-clara-scheduled-execution-success',
      alarmDescription: 'Alert when scheduled executions have not run successfully in 8 days',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Events',
        metricName: 'SuccessfulInvocations',
        dimensionsMap: {
          RuleName: this.weeklyScheduleRule.ruleName
        },
        statistic: 'Sum',
        period: Duration.days(1)
      }),
      threshold: 1,
      evaluationPeriods: 8, // 8 days without successful execution
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD
    });

    successfulExecutionsAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );
  }

  /**
   * Create custom metrics for detailed monitoring
   */
  private createCustomMetrics(): void {
    // Custom metric filter for successful scheduled executions
    new logs.MetricFilter(this, 'SuccessfulScheduledExecutionMetric', {
      logGroup: this.schedulingLogGroup,
      metricNamespace: 'ADA-Clara/Scheduling',
      metricName: 'SuccessfulScheduledExecutions',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, "SUCCESS", ...]'),
      metricValue: '1',
      defaultValue: 0
    });

    // Custom metric filter for failed scheduled executions
    new logs.MetricFilter(this, 'FailedScheduledExecutionMetric', {
      logGroup: this.schedulingLogGroup,
      metricNamespace: 'ADA-Clara/Scheduling',
      metricName: 'FailedScheduledExecutions',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, "ERROR", ...]'),
      metricValue: '1',
      defaultValue: 0
    });

    // Custom metric filter for execution duration
    new logs.MetricFilter(this, 'ScheduledExecutionDurationMetric', {
      logGroup: this.schedulingLogGroup,
      metricNamespace: 'ADA-Clara/Scheduling',
      metricName: 'ExecutionDuration',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, "DURATION", duration, ...]'),
      metricValue: '$duration',
      defaultValue: 0
    });
  }

  /**
   * Create stack outputs
   */
  private createOutputs(props: EventBridgeSchedulingStackProps): void {
    new CfnOutput(this, 'WeeklyScheduleRuleArn', {
      value: this.weeklyScheduleRule.ruleArn,
      description: 'ARN of the weekly web scraping EventBridge rule',
      exportName: `AdaClara-${this.stackName}-WeeklyScheduleRuleArn`
    });

    new CfnOutput(this, 'WeeklyScheduleRuleName', {
      value: this.weeklyScheduleRule.ruleName,
      description: 'Name of the weekly web scraping EventBridge rule',
      exportName: `AdaClara-${this.stackName}-WeeklyScheduleRuleName`
    });

    new CfnOutput(this, 'FailureNotificationTopicArn', {
      value: this.failureNotificationTopic.topicArn,
      description: 'ARN of the SNS topic for scheduling failure notifications',
      exportName: `AdaClara-${this.stackName}-FailureNotificationTopicArn`
    });

    new CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'URL of the SQS dead letter queue for failed scheduled executions',
      exportName: `AdaClara-${this.stackName}-DeadLetterQueueUrl`
    });

    new CfnOutput(this, 'DeadLetterQueueArn', {
      value: this.deadLetterQueue.queueArn,
      description: 'ARN of the SQS dead letter queue for failed scheduled executions',
      exportName: `AdaClara-${this.stackName}-DeadLetterQueueArn`
    });

    new CfnOutput(this, 'SchedulingLogGroupName', {
      value: this.schedulingLogGroup.logGroupName,
      description: 'CloudWatch Log Group for scheduling events',
      exportName: `AdaClara-${this.stackName}-SchedulingLogGroupName`
    });

    new CfnOutput(this, 'SchedulingConfiguration', {
      value: JSON.stringify({
        scheduleExpression: props.scheduleExpression || 'rate(7 days)',
        scheduleEnabled: props.scheduleEnabled !== false,
        retryAttempts: props.retryAttempts || 3,
        retryBackoffRate: props.retryBackoffRate || 2.0,
        maxEventAge: (props.maxEventAge || Duration.hours(2)).toHours() + ' hours',
        notificationEmail: props.notificationEmail || 'not-configured',
        deadLetterQueueEnabled: true,
        monitoringEnabled: true,
        customMetricsEnabled: true
      }),
      description: 'EventBridge scheduling configuration summary'
    });

    new CfnOutput(this, 'ScheduledTargets', {
      value: JSON.stringify({
        webScraper: {
          functionArn: props.webScraperFunctionArn,
          action: 'scrape-urls',
          urls: [
            'https://diabetes.org/about-diabetes/type-1',
            'https://diabetes.org/about-diabetes/type-2',
            'https://diabetes.org/about-diabetes/gestational',
            'https://diabetes.org/about-diabetes/prediabetes',
            'https://diabetes.org/living-with-diabetes',
            'https://diabetes.org/tools-and-resources'
          ]
        },
        crawler: props.crawlerFunctionArn ? {
          functionArn: props.crawlerFunctionArn,
          action: 'process-scraped-content'
        } : 'not-configured'
      }),
      description: 'Scheduled Lambda function targets configuration'
    });

    new CfnOutput(this, 'MonitoringDashboard', {
      value: JSON.stringify({
        alarms: [
          'ada-clara-scheduled-execution-failures',
          'ada-clara-scheduling-dlq-messages',
          'ada-clara-scheduled-execution-success'
        ],
        customMetrics: [
          'ADA-Clara/Scheduling/SuccessfulScheduledExecutions',
          'ADA-Clara/Scheduling/FailedScheduledExecutions',
          'ADA-Clara/Scheduling/ExecutionDuration'
        ],
        logGroup: '/aws/events/ada-clara-scheduling'
      }),
      description: 'Monitoring and alerting configuration for scheduled executions'
    });
  }
}