import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

/**
 * SES Escalation Stack for ADA Clara Chatbot
 * Handles email escalation workflow with SQS queuing and monitoring
 */
export class SESEscalationStack extends Stack {
  public readonly escalationQueue: sqs.Queue;
  public readonly escalationDLQ: sqs.Queue;
  public readonly escalationLambda: lambda.Function;
  public readonly escalationTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ===== SQS QUEUES =====

    // Dead Letter Queue for failed escalations
    this.escalationDLQ = new sqs.Queue(this, 'EscalationDLQ', {
      queueName: `ada-clara-escalation-dlq-${this.account}-${this.region}`,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Main escalation queue with DLQ
    this.escalationQueue = new sqs.Queue(this, 'EscalationQueue', {
      queueName: `ada-clara-escalation-queue-${this.account}-${this.region}`,
      visibilityTimeout: Duration.minutes(5),
      retentionPeriod: Duration.days(7),
      deadLetterQueue: {
        queue: this.escalationDLQ,
        maxReceiveCount: 3
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    // ===== SNS TOPIC FOR URGENT NOTIFICATIONS =====

    this.escalationTopic = new sns.Topic(this, 'EscalationTopic', {
      topicName: `ada-clara-escalation-alerts-${this.account}-${this.region}`,
      displayName: 'ADA Clara Escalation Alerts'
    });

    // ===== SES CONFIGURATION =====

    // Create SES configuration set for tracking
    const configurationSet = new ses.ConfigurationSet(this, 'EscalationConfigSet', {
      configurationSetName: `ada-clara-escalation-${this.account}`,
      // Note: deliveryOptions removed as it's not available in current CDK version
    });

    // Add event destination for bounce/complaint tracking
    configurationSet.addEventDestination('EscalationEvents', {
      destination: ses.EventDestination.snsTopic(this.escalationTopic),
      events: [
        ses.EmailSendingEvent.SEND,
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.DELIVERY
      ]
    });

    // ===== LAMBDA FUNCTION =====

    // Create CloudWatch Log Group for escalation Lambda
    const escalationLogGroup = new logs.LogGroup(this, 'EscalationLambdaLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-ses-escalation',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    });

    this.escalationLambda = new lambda.Function(this, 'EscalationLambda', {
      functionName: `ada-clara-ses-escalation-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ses-escalation'),
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        ESCALATION_QUEUE_URL: this.escalationQueue.queueUrl,
        ESCALATION_TOPIC_ARN: this.escalationTopic.topicArn,
        SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || 'support@ada-clara.org',
        FROM_EMAIL: process.env.FROM_EMAIL || 'noreply@ada-clara.org',
        SES_CONFIGURATION_SET: configurationSet.configurationSetName,
        AWS_REGION: this.region
      },
      logGroup: escalationLogGroup,
      deadLetterQueue: this.escalationDLQ,
      reservedConcurrentExecutions: 5
    });

    // ===== SQS EVENT SOURCE =====

    // Connect SQS queue to Lambda
    this.escalationLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(this.escalationQueue, {
        batchSize: 5,
        maxBatchingWindow: Duration.seconds(10),
        reportBatchItemFailures: true
      })
    );

    // ===== IAM PERMISSIONS =====

    // SES permissions
    this.escalationLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ses:SendEmail',
        'ses:SendTemplatedEmail',
        'ses:SendRawEmail',
        'ses:GetSendQuota',
        'ses:GetSendStatistics'
      ],
      resources: ['*']
    }));

    // SNS permissions for urgent notifications
    this.escalationLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sns:Publish'
      ],
      resources: [this.escalationTopic.topicArn]
    }));

    // DynamoDB permissions for audit logging
    this.escalationLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:GetItem',
        'dynamodb:Query'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`
      ]
    }));

    // ===== CLOUDWATCH MONITORING =====

    // Lambda error alarm
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'EscalationLambdaErrors', {
      alarmName: `ada-clara-escalation-lambda-errors-${this.account}`,
      alarmDescription: 'Escalation Lambda function errors',
      metric: this.escalationLambda.metricErrors({
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // SQS DLQ alarm
    const dlqAlarm = new cloudwatch.Alarm(this, 'EscalationDLQAlarm', {
      alarmName: `ada-clara-escalation-dlq-messages-${this.account}`,
      alarmDescription: 'Messages in escalation dead letter queue',
      metric: this.escalationDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Queue depth alarm
    const queueDepthAlarm = new cloudwatch.Alarm(this, 'EscalationQueueDepth', {
      alarmName: `ada-clara-escalation-queue-depth-${this.account}`,
      alarmDescription: 'High number of messages in escalation queue',
      metric: this.escalationQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5)
      }),
      threshold: 50,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Send alarms to SNS topic
    lambdaErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.escalationTopic)
    );
    dlqAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.escalationTopic)
    );
    queueDepthAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.escalationTopic)
    );

    // ===== DASHBOARD =====

    const dashboard = new cloudwatch.Dashboard(this, 'EscalationDashboard', {
      dashboardName: `ada-clara-escalation-${this.account}`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Escalation Queue Metrics',
            left: [
              this.escalationQueue.metricApproximateNumberOfMessagesVisible(),
              this.escalationQueue.metricNumberOfMessagesSent(),
              this.escalationQueue.metricNumberOfMessagesReceived()
            ],
            width: 12,
            height: 6
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Lambda Performance',
            left: [
              this.escalationLambda.metricInvocations(),
              this.escalationLambda.metricErrors(),
              this.escalationLambda.metricDuration()
            ],
            width: 12,
            height: 6
          })
        ],
        [
          new cloudwatch.SingleValueWidget({
            title: 'DLQ Messages',
            metrics: [
              this.escalationDLQ.metricApproximateNumberOfMessagesVisible()
            ],
            width: 6,
            height: 3
          }),
          new cloudwatch.SingleValueWidget({
            title: 'Lambda Success Rate',
            metrics: [
              this.escalationLambda.metricInvocations().with({
                statistic: 'Sum'
              })
            ],
            width: 6,
            height: 3
          })
        ]
      ]
    });
  }

  /**
   * Add email subscription to escalation alerts
   */
  public addEmailSubscription(email: string): void {
    this.escalationTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(email)
    );
  }

  /**
   * Add SMS subscription to escalation alerts
   */
  public addSmsSubscription(phoneNumber: string): void {
    this.escalationTopic.addSubscription(
      new snsSubscriptions.SmsSubscription(phoneNumber)
    );
  }

  /**
   * Grant permissions to publish to escalation queue
   */
  public grantPublishToQueue(grantee: iam.IGrantable): void {
    this.escalationQueue.grantSendMessages(grantee);
  }

  /**
   * Get queue URL for other stacks
   */
  public getQueueUrl(): string {
    return this.escalationQueue.queueUrl;
  }

  /**
   * Get topic ARN for other stacks
   */
  public getTopicArn(): string {
    return this.escalationTopic.topicArn;
  }
}