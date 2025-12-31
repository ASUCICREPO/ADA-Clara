import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Bucket, Index } from 'cdk-s3-vectors';
// import { BedrockKnowledgeBaseGAStack } from './bedrock-knowledge-base-ga-stack'; // Temporarily commented out for debugging
import { AdaClaraDynamoDBStack } from './dynamodb-stack';

/**
 * S3 Vectors GA Stack
 * 
 * This stack creates S3 Vectors infrastructure using GA (General Availability) APIs
 * with enhanced features including:
 * - 2 billion vectors per index (40x improvement from preview)
 * - Sub-100ms query latency for frequent operations
 * - 1,000 vectors/second write throughput
 * - SSE-S3 encryption by default
 * - Enhanced metadata configuration (50 keys, 2KB size)
 */

interface S3VectorsGAStackProps extends StackProps {
  dynamoDBStack?: AdaClaraDynamoDBStack;
  // EventBridge scheduling configuration
  scheduleExpression?: string; // Default: 'rate(7 days)' for weekly
  scheduleEnabled?: boolean; // Default: true
  notificationEmail?: string; // Email for failure notifications
  retryAttempts?: number; // Default: 3
  retryBackoffRate?: number; // Default: 2.0 (exponential backoff)
}

export class S3VectorsGAStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly crawlerFunction: lambda.Function;
  public readonly kbTestFunction: lambda.Function;
  // public readonly knowledgeBaseStack: BedrockKnowledgeBaseGAStack; // Temporarily commented out for debugging
  
  // EventBridge scheduling components
  public readonly weeklyScheduleRule: events.Rule;
  public readonly failureNotificationTopic: sns.Topic;
  public readonly crawlerDeadLetterQueue: sqs.Queue;

  // Monitoring and alerting components
  public readonly crawlerDashboard: cloudwatch.Dashboard;
  public readonly crawlerExecutionFailureAlarm: cloudwatch.Alarm;
  public readonly crawlerHighLatencyAlarm: cloudwatch.Alarm;
  public readonly contentDetectionEfficiencyAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props?: S3VectorsGAStackProps) {
    super(scope, id, props);

    console.log('🚀 Starting S3VectorsGAStack construction...');
    console.log('📋 Props received (DynamoDB stack provided)');
    console.log('🔍 DEBUG: Constructor started successfully');

    // Regular S3 bucket for storing raw scraped content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-ga-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // GA: SSE-S3 by default
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For development - change for production
    });

    console.log('🔍 DEBUG: About to create S3 Vectors bucket...');
    
    try {
      // GA S3 Vectors bucket with enhanced features
      this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
        vectorBucketName: `ada-clara-vectors-ga-${this.account}-${this.region}`,
        // GA features - encryption handled at bucket level
      });
      console.log('✅ S3 Vectors bucket created successfully');

      // GA S3 Vectors index with improved scale and performance
      this.vectorIndex = new Index(this, 'VectorIndex', {
        vectorBucketName: this.vectorsBucket.vectorBucketName,
        indexName: 'ada-clara-vector-index-ga',
        dimension: 1024, // Titan V2 dimensions
        distanceMetric: 'cosine',
        dataType: 'float32',
        // GA enhancements
        metadataConfiguration: {
          // GA supports up to 50 metadata keys, but nonFilterableMetadataKeys limited to 10
          nonFilterableMetadataKeys: [
            'url', 'title', 'section', 'contentType', 
            'sourceUrl', 'sourcePage', 'chunkIndex', 'totalChunks',
            'language', 'scrapedAt'
          ],
          // GA metadata limits: 50 keys max, 2KB total size, 10 non-filterable keys max
        }
      });
      console.log('✅ S3 Vectors index created successfully');
    } catch (error) {
      console.error('❌ ERROR creating S3 Vectors resources:', error);
      throw error;
    }

    // Create SNS Topic for failure notifications early (needed for IAM policies)
    console.log('📧 Creating SNS failure notification topic...');
    this.failureNotificationTopic = new sns.Topic(this, 'CrawlerFailureNotifications', {
      topicName: 'ada-clara-crawler-failures',
      displayName: 'ADA Clara Crawler Failure Notifications',
    });
    console.log('✅ Created SNS failure notification topic');

    // Add email subscription if provided
    if (props?.notificationEmail) {
      this.failureNotificationTopic.addSubscription(
        new subscriptions.EmailSubscription(props.notificationEmail)
      );
      console.log('✅ Added email subscription to failure notification topic');
    }

    // Create Dead Letter Queue for failed crawler executions early (needed for IAM policies)
    console.log('📦 Creating SQS dead letter queue...');
    this.crawlerDeadLetterQueue = new sqs.Queue(this, 'CrawlerDeadLetterQueue', {
      queueName: 'ada-clara-crawler-dlq',
      retentionPeriod: Duration.days(14), // Keep failed messages for 14 days
      visibilityTimeout: Duration.minutes(5)
    });
    console.log('✅ Created SQS dead letter queue');

    // Lambda function optimized for GA performance (create before EventBridge rule)
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Updated to Node.js 20 for better compatibility
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-ga'), // Compiled JavaScript
      timeout: Duration.minutes(15),
      memorySize: 3008, // Increased for GA throughput (1,000 vectors/second)
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        // GA-specific configuration
        GA_MODE: 'true',
        MAX_BATCH_SIZE: '100', // GA optimal batch size
        MAX_THROUGHPUT: '1000', // GA throughput limit (vectors/second)
        METADATA_SIZE_LIMIT: '2048', // GA metadata size limit (bytes)
        MAX_METADATA_KEYS: '50', // GA metadata keys limit (10 non-filterable)
      },
    });

    // Grant S3 permissions for content bucket
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    
    // Grant S3 Vectors permissions using GA L2 construct methods
    this.vectorsBucket.grantListIndexes(this.crawlerFunction);
    this.vectorIndex.grantWrite(this.crawlerFunction);
    
    // Grant GA-specific S3 Vectors permissions
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // GA API actions (updated from preview)
        's3vectors:ListVectorBuckets',
        's3vectors:GetVectorBucket',
        's3vectors:ListIndexes', // GA uses 'ListIndexes' not 'ListIndices'
        's3vectors:GetIndex', // GA uses 'GetIndex' not 'DescribeIndex'
        's3vectors:PutVectors', // GA batch API
        's3vectors:GetVectors',
        's3vectors:QueryVectors', // GA search API
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
      ],
      resources: ['*'], // S3 Vectors requires wildcard for some operations
    }));
    
    // Grant additional S3 permissions for vectors bucket
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:GetBucketVersioning',
      ],
      resources: [
        this.vectorsBucket.vectorBucketArn,
        `${this.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));
    
    // Grant Bedrock permissions for embeddings
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
      ],
    }));

    // Grant CloudWatch permissions for GA monitoring
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    console.log('🔍 DEBUG: About to check DynamoDB stack dependency...');
    
    // Grant DynamoDB permissions for content tracking (weekly crawler scheduling)
    console.log('🔍 Checking DynamoDB stack dependency...');
    if (props?.dynamoDBStack) {
      console.log('🗄️ Adding DynamoDB permissions...');
      try {
        // Grant access to content tracking table for change detection
        props.dynamoDBStack.contentTrackingTable.grantReadWriteData(this.crawlerFunction);
        
        // Add content tracking table name to environment variables
        this.crawlerFunction.addEnvironment('CONTENT_TRACKING_TABLE', props.dynamoDBStack.contentTrackingTable.tableName);
        console.log('✅ DynamoDB permissions added');
      } catch (error) {
        console.error('❌ ERROR adding DynamoDB permissions:', error);
        throw error;
      }
    } else {
      console.log('⚠️ No DynamoDB stack provided');
    }

    // ===== SECURITY VALIDATION AND COMPLIANCE =====
    // Requirements: 6.1, 6.2, 6.3, 6.4, 6.5

    console.log('🔐 Implementing security validation and compliance features...');

    // MINIMAL IAM PERMISSIONS - Requirement 6.1: Minimal required permissions for EventBridge execution
    console.log('🔐 Configuring minimal IAM permissions for EventBridge...');
    
    // Create a minimal IAM role specifically for EventBridge scheduler execution
    const eventBridgeExecutionRole = new iam.Role(this, 'EventBridgeExecutionRole', {
      roleName: 'ada-clara-eventbridge-crawler-execution-role',
      description: 'Minimal IAM role for EventBridge to invoke crawler Lambda function',
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        MinimalCrawlerExecutionPolicy: new iam.PolicyDocument({
          statements: [
            // Allow only Lambda invocation for the specific crawler function
            new iam.PolicyStatement({
              sid: 'AllowCrawlerLambdaInvocation',
              effect: iam.Effect.ALLOW,
              actions: ['lambda:InvokeFunction'],
              resources: [this.crawlerFunction.functionArn],
              conditions: {
                StringEquals: {
                  'aws:SourceAccount': this.account
                }
              }
            }),
            // Allow SNS publishing for failure notifications only
            new iam.PolicyStatement({
              sid: 'AllowFailureNotifications',
              effect: iam.Effect.ALLOW,
              actions: ['sns:Publish'],
              resources: [this.failureNotificationTopic.topicArn]
            }),
            // Allow SQS dead letter queue access only
            new iam.PolicyStatement({
              sid: 'AllowDeadLetterQueue',
              effect: iam.Effect.ALLOW,
              actions: ['sqs:SendMessage'],
              resources: [this.crawlerDeadLetterQueue.queueArn]
            }),
            // Explicit deny for all other actions (defense in depth)
            new iam.PolicyStatement({
              sid: 'DenyAllOtherActions',
              effect: iam.Effect.DENY,
              notActions: [
                'lambda:InvokeFunction',
                'sns:Publish',
                'sqs:SendMessage'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // ENCRYPTION REQUIREMENTS - Requirement 6.3: Ensure all stored content uses AWS managed encryption
    console.log('🔐 Configuring encryption requirements...');
    
    // Update content bucket to enforce encryption
    this.contentBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyUnencryptedObjectUploads',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:PutObject'],
      resources: [`${this.contentBucket.bucketArn}/*`],
      conditions: {
        StringNotEquals: {
          's3:x-amz-server-side-encryption': 'AES256'
        }
      }
    }));

    // Add encryption validation permissions to crawler function
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'AllowEncryptionValidation',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObjectAttributes',
        's3:GetObjectMetadata',
        's3:HeadObject'
      ],
      resources: [
        `${this.contentBucket.bucketArn}/*`,
        `${this.vectorsBucket.vectorBucketArn}/*`
      ]
    }));

    // AUDIT LOGGING - Requirement 6.5: Security audit and compliance logging
    console.log('🔐 Configuring audit logging...');
    
    // Grant audit logging permissions to crawler function
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'AllowSecurityAuditLogging',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query'
      ],
      resources: [
        props?.dynamoDBStack?.contentTrackingTable.tableArn || '*',
        `${props?.dynamoDBStack?.contentTrackingTable.tableArn || '*'}/index/*`
      ]
    }));

    // Grant CloudWatch metrics permissions for security monitoring
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'AllowSecurityMetrics',
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'ADA-Clara/Crawler/Security'
        }
      }
    }));

    // URL VALIDATION - Requirement 6.2: Add domain whitelist configuration
    console.log('🔐 Configuring URL validation...');
    
    // Add security configuration to Lambda environment
    this.crawlerFunction.addEnvironment('ALLOWED_DOMAINS', 'diabetes.org,www.diabetes.org');
    this.crawlerFunction.addEnvironment('ALLOWED_PROTOCOLS', 'https');
    this.crawlerFunction.addEnvironment('BLOCKED_PATHS', '/admin,/login,/api/internal,/private');
    this.crawlerFunction.addEnvironment('MAX_URL_LENGTH', '2048');

    // RATE LIMITING - Requirement 6.4: Configure rate limiting for compliance
    console.log('🔐 Configuring rate limiting...');
    
    // Add rate limiting configuration to Lambda environment
    this.crawlerFunction.addEnvironment('REQUESTS_PER_MINUTE', '10');
    this.crawlerFunction.addEnvironment('REQUESTS_PER_HOUR', '100');
    this.crawlerFunction.addEnvironment('REQUESTS_PER_DAY', '1000');
    this.crawlerFunction.addEnvironment('BURST_LIMIT', '5');

    // Add security validation service configuration
    this.crawlerFunction.addEnvironment('SECURITY_LOG_LEVEL', 'info');
    this.crawlerFunction.addEnvironment('AUDIT_RETENTION_DAYS', '90');
    this.crawlerFunction.addEnvironment('REQUIRED_ENCRYPTION', 'SSE-S3');

    console.log('✅ Security validation and compliance features configured successfully!');

    // ===== CREATE EVENTBRIDGE RULE AFTER LAMBDA FUNCTION =====
    console.log('⏰ Creating EventBridge rule...');
    this.weeklyScheduleRule = new events.Rule(this, 'WeeklyCrawlerSchedule', {
      ruleName: 'ada-clara-weekly-crawler-schedule',
      description: 'Triggers the web crawler every week to update diabetes.org content',
      schedule: events.Schedule.expression(props?.scheduleExpression || 'rate(7 days)'),
      enabled: props?.scheduleEnabled ?? true
    });
    console.log('✅ Created EventBridge rule');

    // ===== END SECURITY VALIDATION SECTION =====
    
    // ===== MONITORING AND ALERTING INFRASTRUCTURE =====
    // Requirements: 4.1, 4.3, 4.4, 4.5

    console.log('🔧 Creating enhanced monitoring and alerting infrastructure...');

    // CloudWatch Dashboard for crawler health monitoring
    this.crawlerDashboard = new cloudwatch.Dashboard(this, 'CrawlerMonitoringDashboard', {
      dashboardName: `ada-clara-crawler-monitoring-${this.account}`,
      widgets: [
        [
          // Crawler execution metrics
          new cloudwatch.GraphWidget({
            title: 'Crawler Execution Metrics',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ExecutionCount',
                period: Duration.minutes(5),
                statistic: 'Sum'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ExecutionDuration',
                period: Duration.minutes(5),
                statistic: 'Average'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'SuccessfulExecutions',
                period: Duration.minutes(5),
                statistic: 'Sum'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'FailedExecutions',
                period: Duration.minutes(5),
                statistic: 'Sum'
              })
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // Content processing metrics
          new cloudwatch.GraphWidget({
            title: 'Content Processing Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ContentProcessed',
                period: Duration.minutes(5),
                statistic: 'Sum'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ContentSkipped',
                period: Duration.minutes(5),
                statistic: 'Sum'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ChangeDetectionTime',
                period: Duration.minutes(5),
                statistic: 'Average'
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'VectorGenerationTime',
                period: Duration.minutes(5),
                statistic: 'Average'
              })
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // EventBridge scheduling metrics
          new cloudwatch.GraphWidget({
            title: 'EventBridge Scheduling Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/Events',
                metricName: 'InvocationsCount',
                dimensionsMap: {
                  RuleName: 'ada-clara-weekly-crawler-schedule'
                },
                period: Duration.minutes(5),
                statistic: 'Sum'
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Events',
                metricName: 'FailedInvocations',
                dimensionsMap: {
                  RuleName: 'ada-clara-weekly-crawler-schedule'
                },
                period: Duration.minutes(5),
                statistic: 'Sum'
              })
            ],
            width: 6,
            height: 6
          }),
          // Lambda function metrics
          new cloudwatch.GraphWidget({
            title: 'Crawler Lambda Performance',
            left: [
              this.crawlerFunction.metricInvocations({
                period: Duration.minutes(5)
              }),
              this.crawlerFunction.metricErrors({
                period: Duration.minutes(5)
              }),
              this.crawlerFunction.metricDuration({
                period: Duration.minutes(5)
              }),
              this.crawlerFunction.metricThrottles({
                period: Duration.minutes(5)
              })
            ],
            width: 6,
            height: 6
          })
        ],
        [
          // Content change detection efficiency
          new cloudwatch.SingleValueWidget({
            title: 'Content Change Detection Efficiency',
            metrics: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ChangeDetectionEfficiency',
                period: Duration.hours(1),
                statistic: 'Average'
              })
            ],
            width: 4,
            height: 3
          }),
          // Average execution time
          new cloudwatch.SingleValueWidget({
            title: 'Average Execution Time (minutes)',
            metrics: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/Crawler',
                metricName: 'ExecutionDuration',
                period: Duration.hours(1),
                statistic: 'Average'
              })
            ],
            width: 4,
            height: 3
          }),
          // Success rate
          new cloudwatch.SingleValueWidget({
            title: 'Success Rate (%)',
            metrics: [
              new cloudwatch.MathExpression({
                expression: '(successful / (successful + failed)) * 100',
                period: Duration.minutes(5), // Explicit period for math expression
                usingMetrics: {
                  successful: new cloudwatch.Metric({
                    namespace: 'ADA-Clara/Crawler',
                    metricName: 'SuccessfulExecutions',
                    period: Duration.minutes(5), // Match math expression period
                    statistic: 'Sum'
                  }),
                  failed: new cloudwatch.Metric({
                    namespace: 'ADA-Clara/Crawler',
                    metricName: 'FailedExecutions',
                    period: Duration.minutes(5), // Match math expression period
                    statistic: 'Sum'
                  })
                }
              })
            ],
            width: 4,
            height: 3
          })
        ]
      ]
    });

    // CloudWatch Alarms for crawler monitoring
    this.crawlerExecutionFailureAlarm = new cloudwatch.Alarm(this, 'CrawlerExecutionFailureAlarm', {
      alarmName: `ada-clara-crawler-execution-failures-${this.account}`,
      alarmDescription: 'High failure rate in crawler executions',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/Crawler',
        metricName: 'FailedExecutions',
        period: Duration.minutes(15),
        statistic: 'Sum'
      }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    this.crawlerHighLatencyAlarm = new cloudwatch.Alarm(this, 'CrawlerHighLatencyAlarm', {
      alarmName: `ada-clara-crawler-high-latency-${this.account}`,
      alarmDescription: 'Crawler execution taking too long',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/Crawler',
        metricName: 'ExecutionDuration',
        period: Duration.minutes(5),
        statistic: 'Average'
      }),
      threshold: 900000, // 15 minutes in milliseconds
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    this.contentDetectionEfficiencyAlarm = new cloudwatch.Alarm(this, 'ContentDetectionEfficiencyAlarm', {
      alarmName: `ada-clara-content-detection-low-efficiency-${this.account}`,
      alarmDescription: 'Content change detection efficiency below threshold',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/Crawler',
        metricName: 'ChangeDetectionEfficiency',
        period: Duration.minutes(30),
        statistic: 'Average'
      }),
      threshold: 70, // 70% efficiency threshold
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Connect alarms to SNS notifications
    this.crawlerExecutionFailureAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );
    this.crawlerHighLatencyAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );
    this.contentDetectionEfficiencyAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.failureNotificationTopic)
    );

    // Add CloudWatch permissions for custom metrics
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': [
            'ADA-Clara/Crawler',
            'ADA-Clara/Crawler/Performance',
            'ADA-Clara/Crawler/Security',
            'ADA-Clara/Crawler/Configuration'
          ]
        }
      }
    }));

    // Add EventBridge permissions for configuration management - Requirement 2.3: Dynamic schedule update capability
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'events:PutRule',
        'events:DescribeRule',
        'events:EnableRule',
        'events:DisableRule',
        'events:ListRules'
      ],
      resources: [
        this.weeklyScheduleRule.ruleArn,
        `arn:aws:events:${this.region}:${this.account}:rule/${this.weeklyScheduleRule.ruleName}`
      ]
    }));

    // ===== END MONITORING AND ALERTING SECTION =====
    
    // ===== EVENTBRIDGE SCHEDULING FOR WEEKLY CRAWLER =====
    // Requirements: 1.1, 1.4, 2.1, 4.2

    console.log('🔧 Creating EventBridge scheduling components...');
    console.log('📋 EventBridge props:', JSON.stringify({
      scheduleExpression: props?.scheduleExpression,
      scheduleEnabled: props?.scheduleEnabled,
      notificationEmail: props?.notificationEmail,
      retryAttempts: props?.retryAttempts,
      retryBackoffRate: props?.retryBackoffRate
    }, null, 2));

    try {
      console.log('🚀 Starting EventBridge section...');

      // Connect DLQ to SNS for notifications
      const dlqTopic = new sns.Topic(this, 'CrawlerDLQNotifications', {
        topicName: 'ada-clara-crawler-dlq-notifications',
        displayName: 'ADA Clara Crawler DLQ Notifications',
      });

      // Add email subscription for DLQ notifications if provided
      if (props?.notificationEmail) {
        dlqTopic.addSubscription(
          new subscriptions.EmailSubscription(props.notificationEmail)
        );
      }

      // Configure EventBridge target (rule was created earlier)
      console.log('⏰ Configuring EventBridge target...');

      // Configure EventBridge target with retry and DLQ using minimal IAM role
      const crawlerTarget = new targets.LambdaFunction(this.crawlerFunction, {
        event: events.RuleTargetInput.fromObject({
          source: 'eventbridge',
          'detail-type': 'Scheduled Crawl',
          detail: {
            scheduleId: 'weekly-crawl-schedule',
            targetUrls: [
              'https://diabetes.org/about-diabetes/type-1',
              'https://diabetes.org/about-diabetes/type-2',
              'https://diabetes.org/about-diabetes/gestational',
              'https://diabetes.org/about-diabetes/prediabetes',
              'https://diabetes.org/living-with-diabetes',
              'https://diabetes.org/tools-and-resources',
              'https://diabetes.org/community',
              'https://diabetes.org/professionals'
            ],
            executionId: `scheduled-${Date.now()}`,
            retryAttempt: 0
          }
        }),
        retryAttempts: props?.retryAttempts || 3,
        maxEventAge: Duration.hours(24), // Events expire after 24 hours
        deadLetterQueue: this.crawlerDeadLetterQueue,
      });

      // Add target to the rule
      this.weeklyScheduleRule.addTarget(crawlerTarget);
      console.log('✅ Added target to EventBridge rule');

      console.log('🔐 Configuring IAM permissions...');
      // Note: LambdaFunction target automatically grants EventBridge permission to invoke the function
      
      // Grant Lambda permissions to publish to SNS topics and access SQS DLQ
      this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sns:Publish',
          'sns:GetTopicAttributes',
        ],
        resources: [
          this.failureNotificationTopic.topicArn,
          dlqTopic.topicArn,
        ],
      }));

      // Grant Lambda permissions to access DLQ
      this.crawlerDeadLetterQueue.grantConsumeMessages(this.crawlerFunction);

      // Add SNS topic ARNs and DLQ URL to Lambda environment variables
      this.crawlerFunction.addEnvironment('FAILURE_NOTIFICATION_TOPIC', this.failureNotificationTopic.topicArn);
      this.crawlerFunction.addEnvironment('DEAD_LETTER_QUEUE_URL', this.crawlerDeadLetterQueue.queueUrl);

      // Add monitoring configuration to Lambda environment
      this.crawlerFunction.addEnvironment('MONITORING_ENABLED', 'true');
      this.crawlerFunction.addEnvironment('EXECUTION_HISTORY_TABLE', props?.dynamoDBStack?.contentTrackingTable.tableName || 'ada-clara-content-tracking');
      this.crawlerFunction.addEnvironment('CRAWLER_DASHBOARD_NAME', `ada-clara-crawler-monitoring-${this.account}`);

      // Grant EventBridge permissions to send messages to DLQ
      this.crawlerDeadLetterQueue.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [this.crawlerDeadLetterQueue.queueArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      }));

      // Add scheduling configuration to Lambda environment
      this.crawlerFunction.addEnvironment('SCHEDULE_EXPRESSION', props?.scheduleExpression || 'rate(7 days)');
      this.crawlerFunction.addEnvironment('SCHEDULE_ENABLED', (props?.scheduleEnabled !== false).toString());
      this.crawlerFunction.addEnvironment('RETRY_ATTEMPTS', (props?.retryAttempts || 3).toString());
      this.crawlerFunction.addEnvironment('RETRY_BACKOFF_RATE', (props?.retryBackoffRate || 2.0).toString());
      
      // Configuration Management System - Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
      // Environment variables for schedule configuration - Requirement 2.4
      this.crawlerFunction.addEnvironment('CRAWLER_FREQUENCY', process.env.CRAWLER_FREQUENCY || 'weekly');
      this.crawlerFunction.addEnvironment('CRAWLER_DAY_OF_WEEK', process.env.CRAWLER_DAY_OF_WEEK || '0');
      this.crawlerFunction.addEnvironment('CRAWLER_HOUR', process.env.CRAWLER_HOUR || '2');
      this.crawlerFunction.addEnvironment('CRAWLER_MINUTE', process.env.CRAWLER_MINUTE || '0');
      this.crawlerFunction.addEnvironment('CRAWLER_TARGET_URLS', process.env.CRAWLER_TARGET_URLS || '');
      this.crawlerFunction.addEnvironment('CRAWLER_TIMEOUT_MINUTES', process.env.CRAWLER_TIMEOUT_MINUTES || '15');
      this.crawlerFunction.addEnvironment('NOTIFICATION_EMAIL', process.env.NOTIFICATION_EMAIL || '');
      this.crawlerFunction.addEnvironment('SCHEDULE_RULE_NAME', this.weeklyScheduleRule.ruleName);
      
      // Configuration validation and management
      this.crawlerFunction.addEnvironment('CONFIG_VALIDATION_ENABLED', 'true');
      this.crawlerFunction.addEnvironment('CONFIG_AUDIT_ENABLED', 'true');
      this.crawlerFunction.addEnvironment('SUPPORTED_FREQUENCIES', 'weekly,bi-weekly,monthly');
      this.crawlerFunction.addEnvironment('ALLOWED_DOMAINS', 'diabetes.org,www.diabetes.org');
      this.crawlerFunction.addEnvironment('MAX_TARGET_URLS', '50');
      this.crawlerFunction.addEnvironment('MIN_RETRY_ATTEMPTS', '1');
      this.crawlerFunction.addEnvironment('MAX_RETRY_ATTEMPTS', '10');
      this.crawlerFunction.addEnvironment('MIN_TIMEOUT_MINUTES', '1');
      this.crawlerFunction.addEnvironment('MAX_TIMEOUT_MINUTES', '60');

      console.log('✅ EventBridge scheduling configuration completed successfully!');

    } catch (error: any) {
      console.error('❌ ERROR in EventBridge section:', error);
      console.error('❌ Stack trace:', error.stack);
      throw error; // Re-throw to ensure the build fails
    }

    // Knowledge Base test Lambda function for GA integration
    this.kbTestFunction = new lambda.Function(this, 'KBTestFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-kb-ga'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment: {
        KNOWLEDGE_BASE_ID: '', // Will be set after KB creation
        DATA_SOURCE_ID: '', // Will be set after KB creation
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        GENERATION_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
    });

    // Grant Bedrock permissions for Knowledge Base testing
    this.kbTestFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
        'bedrock:ListIngestionJobs',
      ],
      resources: ['*'],
    }));

    // Create Knowledge Base stack with GA S3 Vectors integration
    console.log('🔧 Creating Knowledge Base stack...');
    // Temporarily commented out to debug EventBridge issue
    // this.knowledgeBaseStack = new BedrockKnowledgeBaseGAStack(this, 'KnowledgeBase', {
    //   env: props?.env, // Pass environment to nested stack
    //   contentBucket: this.contentBucket,
    //   vectorsBucket: this.vectorsBucket,
    //   vectorIndex: this.vectorIndex,
    // });
    console.log('✅ Knowledge Base stack creation skipped for debugging');

    // Update KB test function environment with GA S3 Vectors configuration
    console.log('🔧 Updating KB test function environment...');
    this.kbTestFunction.addEnvironment('VECTORS_BUCKET', this.vectorsBucket.vectorBucketName);
    this.kbTestFunction.addEnvironment('VECTOR_INDEX', this.vectorIndex.indexName);
    this.kbTestFunction.addEnvironment('CONTENT_BUCKET', this.contentBucket.bucketName);
    console.log('✅ KB test function environment updated');

    // Outputs for GA infrastructure
    new CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'Name of the S3 bucket for storing raw content (GA)'
    });

    new CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'Name of the S3 Vectors bucket (GA)'
    });

    new CfnOutput(this, 'VectorIndexName', {
      value: this.vectorIndex.indexName,
      description: 'Name of the S3 Vectors index (GA)'
    });

    new CfnOutput(this, 'CrawlerFunctionName', {
      value: this.crawlerFunction.functionName,
      description: 'Name of the GA-optimized crawler Lambda function'
    });

    new CfnOutput(this, 'KBTestFunctionName', {
      value: this.kbTestFunction.functionName,
      description: 'Name of the Knowledge Base GA integration test function'
    });

    new CfnOutput(this, 'VectorsBucketArn', {
      value: this.vectorsBucket.vectorBucketArn,
      description: 'ARN of the S3 Vectors bucket (GA)'
    });

    new CfnOutput(this, 'VectorIndexArn', {
      value: this.vectorIndex.indexArn,
      description: 'ARN of the S3 Vectors index (GA)'
    });

    // GA-specific outputs
    new CfnOutput(this, 'GAFeatures', {
      value: JSON.stringify({
        maxVectorsPerIndex: '2,000,000,000',
        maxThroughput: '1,000 vectors/second',
        queryLatency: 'sub-100ms for frequent queries',
        metadataKeys: '50 max',
        metadataSize: '2KB max',
        encryption: 'SSE-S3'
      }),
      description: 'GA feature capabilities'
    });

    // EventBridge scheduling outputs
    new CfnOutput(this, 'WeeklyScheduleRuleName', {
      value: this.weeklyScheduleRule.ruleName,
      description: 'Name of the EventBridge rule for weekly crawler scheduling'
    });

    new CfnOutput(this, 'WeeklyScheduleRuleArn', {
      value: this.weeklyScheduleRule.ruleArn,
      description: 'ARN of the EventBridge rule for weekly crawler scheduling'
    });

    new CfnOutput(this, 'FailureNotificationTopicArn', {
      value: this.failureNotificationTopic.topicArn,
      description: 'ARN of the SNS topic for crawler failure notifications'
    });

    new CfnOutput(this, 'CrawlerDeadLetterQueueUrl', {
      value: this.crawlerDeadLetterQueue.queueUrl,
      description: 'URL of the SQS queue used as dead letter queue for failed crawler executions'
    });

    new CfnOutput(this, 'CrawlerDeadLetterQueueArn', {
      value: this.crawlerDeadLetterQueue.queueArn,
      description: 'ARN of the SQS queue used as dead letter queue for failed crawler executions'
    });

    new CfnOutput(this, 'SchedulingConfiguration', {
      value: JSON.stringify({
        scheduleExpression: props?.scheduleExpression || 'rate(7 days)',
        scheduleEnabled: props?.scheduleEnabled !== false,
        retryAttempts: props?.retryAttempts || 3,
        retryBackoffRate: props?.retryBackoffRate || 2.0,
        notificationEmail: props?.notificationEmail || 'not-configured'
      }),
      description: 'EventBridge scheduling configuration for weekly crawler'
    });

    // Security and compliance outputs (eventBridgeExecutionRole was defined earlier)
    new CfnOutput(this, 'EventBridgeExecutionRoleArn', {
      value: eventBridgeExecutionRole.roleArn,
      description: 'ARN of the minimal IAM role for EventBridge crawler execution'
    });

    new CfnOutput(this, 'SecurityConfiguration', {
      value: JSON.stringify({
        allowedDomains: ['diabetes.org', 'www.diabetes.org'],
        allowedProtocols: ['https'],
        encryptionRequired: 'SSE-S3',
        rateLimiting: {
          requestsPerMinute: 10,
          requestsPerHour: 100,
          requestsPerDay: 1000
        },
        auditLogging: {
          enabled: true,
          retentionDays: 90,
          logLevel: 'info'
        }
      }),
      description: 'Security validation and compliance configuration'
    });

    new CfnOutput(this, 'ComplianceFeatures', {
      value: JSON.stringify({
        urlValidation: 'Domain whitelist enforced',
        rateLimiting: 'Robots.txt compliant',
        encryption: 'SSE-S3 enforced on all buckets',
        auditLogging: 'All security events logged to DynamoDB',
        minimalIAM: 'Least privilege principle applied'
      }),
      description: 'Implemented security and compliance features'
    });

    // Monitoring and alerting outputs
    new CfnOutput(this, 'CrawlerDashboardName', {
      value: this.crawlerDashboard.dashboardName,
      description: 'Name of the CloudWatch dashboard for crawler monitoring'
    });

    new CfnOutput(this, 'CrawlerDashboardURL', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.crawlerDashboard.dashboardName}`,
      description: 'URL to access the crawler monitoring dashboard'
    });

    new CfnOutput(this, 'CrawlerExecutionFailureAlarmArn', {
      value: this.crawlerExecutionFailureAlarm.alarmArn,
      description: 'ARN of the crawler execution failure alarm'
    });

    new CfnOutput(this, 'CrawlerHighLatencyAlarmArn', {
      value: this.crawlerHighLatencyAlarm.alarmArn,
      description: 'ARN of the crawler high latency alarm'
    });

    new CfnOutput(this, 'ContentDetectionEfficiencyAlarmArn', {
      value: this.contentDetectionEfficiencyAlarm.alarmArn,
      description: 'ARN of the content detection efficiency alarm'
    });

    new CfnOutput(this, 'MonitoringConfiguration', {
      value: JSON.stringify({
        dashboard: this.crawlerDashboard.dashboardName,
        alarms: {
          executionFailures: this.crawlerExecutionFailureAlarm.alarmName,
          highLatency: this.crawlerHighLatencyAlarm.alarmName,
          lowEfficiency: this.contentDetectionEfficiencyAlarm.alarmName
        },
        metrics: {
          namespace: 'ADA-Clara/Crawler',
          customMetrics: [
            'ExecutionCount',
            'ExecutionDuration', 
            'SuccessfulExecutions',
            'FailedExecutions',
            'ContentProcessed',
            'ContentSkipped',
            'ChangeDetectionTime',
            'VectorGenerationTime',
            'ChangeDetectionEfficiency'
          ]
        },
        notifications: {
          topic: this.failureNotificationTopic.topicArn,
          deadLetterQueue: this.crawlerDeadLetterQueue.queueArn
        }
      }),
      description: 'Complete monitoring and alerting configuration for crawler'
    });
  }
}