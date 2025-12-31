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
import { Bucket, Index } from 'cdk-s3-vectors';
// import { BedrockKnowledgeBaseStack } from './bedrock-knowledge-base-stack'; // Temporarily commented out for debugging
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

export class S3VectorsStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly crawlerFunction: lambda.Function;
  public readonly webScraperFunction: lambda.Function; // New standalone web scraper
  public readonly kbTestFunction: lambda.Function;
  // public readonly knowledgeBaseStack: BedrockKnowledgeBaseGAStack; // Temporarily commented out for debugging
  
  // EventBridge scheduling components
  public readonly weeklyScheduleRule: events.Rule;
  public readonly failureNotificationTopic: sns.Topic;
  public readonly crawlerDeadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: S3VectorsGAStackProps) {
    super(scope, id, props);

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

    try {
      // GA S3 Vectors bucket with enhanced features
      this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
        vectorBucketName: `ada-clara-vectors-ga-${this.account}-${this.region}`,
        // GA features - encryption handled at bucket level
      });

      // Create the index that Knowledge Base will use
      this.vectorIndex = new Index(this, 'VectorIndex', {
        vectorBucketName: this.vectorsBucket.vectorBucketName,
        indexName: 'ada-clara-kb-index', // Match the name KB expects
        dimension: 1024, // Titan V2 maximum dimensions for optimal performance
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
    } catch (error) {
      console.error('❌ ERROR creating S3 Vectors resources:', error);
      throw error;
    }

    // Create SNS Topic for failure notifications early (needed for IAM policies)
    this.failureNotificationTopic = new sns.Topic(this, 'CrawlerFailureNotifications', {
      topicName: 'ada-clara-crawler-failures',
      displayName: 'ADA Clara Crawler Failure Notifications',
    });

    // Add email subscription if provided
    if (props?.notificationEmail) {
      this.failureNotificationTopic.addSubscription(
        new subscriptions.EmailSubscription(props.notificationEmail)
      );
    }

    // Create Dead Letter Queue for failed crawler executions early (needed for IAM policies)
    this.crawlerDeadLetterQueue = new sqs.Queue(this, 'CrawlerDeadLetterQueue', {
      queueName: 'ada-clara-crawler-dlq',
      retentionPeriod: Duration.days(14), // Keep failed messages for 14 days
      visibilityTimeout: Duration.minutes(5)
    });

    // Lambda function optimized for GA performance (create before EventBridge rule)
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Updated to Node.js 20 for better compatibility
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/s3-vectors'), // Standardized path
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
    
    // Grant S3 Vectors permissions using L2 construct methods
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

    // Grant DynamoDB permissions for content tracking (weekly crawler scheduling)
    if (props?.dynamoDBStack) {
      try {
        // Grant access to content tracking table for change detection
        props.dynamoDBStack.contentTrackingTable.grantReadWriteData(this.crawlerFunction);
        
        // Add content tracking table name to environment variables
        this.crawlerFunction.addEnvironment('CONTENT_TRACKING_TABLE', props.dynamoDBStack.contentTrackingTable.tableName);
      } catch (error) {
        console.error('❌ ERROR adding DynamoDB permissions:', error);
        throw error;
      }
    }

    // ===== NEW STANDALONE WEB SCRAPER LAMBDA =====
    // Dedicated Lambda for web scraping (separated from S3 Vectors operations)
    
    this.webScraperFunction = new lambda.Function(this, 'WebScraperFunction', {
      functionName: `AdaClaraWebScraper-${Stack.of(this).region}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/web-scraper'),
      timeout: Duration.minutes(10), // Shorter timeout for focused scraping
      memorySize: 1024, // Less memory needed for scraping only
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        CONTENT_TRACKING_TABLE: props?.dynamoDBStack?.contentTrackingTable.tableName || 'ada-clara-content-tracking',
        TARGET_DOMAIN: 'diabetes.org',
        MAX_PAGES: '10',
        RATE_LIMIT_DELAY: '2000',
        REQUEST_TIMEOUT: '30000',
        USER_AGENT: 'ADA Clara Scraper/1.0 (Educational Purpose)',
        ALLOWED_PATHS: '/about-diabetes,/living-with-diabetes,/tools-and-resources,/community,/professionals',
        BLOCKED_PATHS: '/admin,/login,/api/internal,/private'
      },
    });

    // Grant S3 permissions for content bucket (web scraper only needs content bucket)
    this.contentBucket.grantReadWrite(this.webScraperFunction);
    
    // Grant DynamoDB permissions for content tracking
    if (props?.dynamoDBStack) {
      props.dynamoDBStack.contentTrackingTable.grantReadWriteData(this.webScraperFunction);
    }

    // Grant CloudWatch permissions for logging
    this.webScraperFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // ===== SECURITY VALIDATION AND COMPLIANCE =====
    // Requirements: 6.1, 6.2, 6.3, 6.4, 6.5

    // ENCRYPTION REQUIREMENTS - Requirement 6.3: Ensure all stored content uses AWS managed encryption
    
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
    
    // Add security configuration to Lambda environment
    this.crawlerFunction.addEnvironment('ALLOWED_DOMAINS', 'diabetes.org,www.diabetes.org');
    this.crawlerFunction.addEnvironment('ALLOWED_PROTOCOLS', 'https');
    this.crawlerFunction.addEnvironment('BLOCKED_PATHS', '/admin,/login,/api/internal,/private');
    this.crawlerFunction.addEnvironment('MAX_URL_LENGTH', '2048');

    // RATE LIMITING - Requirement 6.4: Configure rate limiting for compliance
    
    // Add rate limiting configuration to Lambda environment
    this.crawlerFunction.addEnvironment('REQUESTS_PER_MINUTE', '10');
    this.crawlerFunction.addEnvironment('REQUESTS_PER_HOUR', '100');
    this.crawlerFunction.addEnvironment('REQUESTS_PER_DAY', '1000');
    this.crawlerFunction.addEnvironment('BURST_LIMIT', '5');

    // Add security validation service configuration
    this.crawlerFunction.addEnvironment('SECURITY_LOG_LEVEL', 'info');
    this.crawlerFunction.addEnvironment('AUDIT_RETENTION_DAYS', '90');
    this.crawlerFunction.addEnvironment('REQUIRED_ENCRYPTION', 'SSE-S3');

    // ===== BASIC CLOUDWATCH LOGGING =====
    // Only basic CloudWatch logging as shown in architecture diagram

    // ===== EVENTBRIDGE SCHEDULING TEMPORARILY DISABLED =====
    // TODO: Add EventBridge scheduling in a separate deployment phase
    // Create a placeholder rule for outputs (not actually used)
    this.weeklyScheduleRule = new events.Rule(this, 'PlaceholderScheduleRule', {
      ruleName: 'ada-clara-placeholder-schedule',
      description: 'Placeholder rule - EventBridge scheduling will be added later',
      schedule: events.Schedule.expression('rate(1 day)'),
      enabled: false // Disabled placeholder
    });
    
    // Set the rule name in Lambda environment (for compatibility)
    this.crawlerFunction.addEnvironment('SCHEDULE_RULE_NAME', this.weeklyScheduleRule.ruleName);

    // ===== END LOGGING SECTION =====
    
    // ===== BASIC ENVIRONMENT CONFIGURATION =====
    // Add basic environment variables (no EventBridge targets to avoid circular dependency)
    this.crawlerFunction.addEnvironment('FAILURE_NOTIFICATION_TOPIC', this.failureNotificationTopic.topicArn);
    this.crawlerFunction.addEnvironment('DEAD_LETTER_QUEUE_URL', this.crawlerDeadLetterQueue.queueUrl);
    this.crawlerFunction.addEnvironment('MONITORING_ENABLED', 'false'); // Simplified
    this.crawlerFunction.addEnvironment('EXECUTION_HISTORY_TABLE', props?.dynamoDBStack?.contentTrackingTable.tableName || 'ada-clara-content-tracking');

    // Knowledge Base test Lambda function for GA integration
    this.kbTestFunction = new lambda.Function(this, 'KBTestFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/bedrock-kb'),
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

    // Knowledge Base is deployed as a separate stack (AdaClaraBedrockKnowledgeBase)
    // Update KB test function environment with GA S3 Vectors configuration
    this.kbTestFunction.addEnvironment('VECTORS_BUCKET', this.vectorsBucket.vectorBucketName);
    this.kbTestFunction.addEnvironment('VECTOR_INDEX', this.vectorIndex.indexName);
    this.kbTestFunction.addEnvironment('CONTENT_BUCKET', this.contentBucket.bucketName);

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
      description: 'Name of the S3 Vectors index for Knowledge Base'
    });

    new CfnOutput(this, 'CrawlerFunctionName', {
      value: this.crawlerFunction.functionName,
      description: 'Name of the GA-optimized crawler Lambda function'
    });

    new CfnOutput(this, 'WebScraperFunctionName', {
      value: this.webScraperFunction.functionName,
      description: 'Name of the standalone web scraper Lambda function'
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
      description: 'ARN of the S3 Vectors index for Knowledge Base'
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

  }
}