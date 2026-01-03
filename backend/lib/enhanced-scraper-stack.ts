import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { S3VectorsStack } from './s3-vectors-stack';
import { AdaClaraDynamoDBStack } from './dynamodb-stack';

/**
 * Enhanced Web Scraper Stack
 * 
 * This stack creates the Enhanced Web Scraper Lambda function that integrates
 * all enhanced services (Domain Discovery, Structured Content Extraction,
 * Content Enhancement, Intelligent Chunking, etc.) with the existing S3 Vectors
 * GA infrastructure.
 * 
 * Key Features:
 * - Imports Foundation Stack resources (S3 Vectors, buckets, etc.)
 * - Enhanced Lambda with all services integrated
 * - EventBridge scheduling for automated crawls
 * - CloudWatch monitoring and alerting
 * - Performance optimization for 10+ pages/minute processing
 * - S3 Vectors GA throughput (1,000 vectors/second)
 */

export interface EnhancedScraperStackProps extends StackProps {
  foundationStack: S3VectorsStack;
  dynamoDBStack: AdaClaraDynamoDBStack;
  
  // Enhanced scraper configuration
  targetDomain?: string;
  maxPages?: number;
  rateLimitDelay?: number;
  batchSize?: number;
  
  // Scheduling configuration
  scheduleExpression?: string; // Default: 'rate(7 days)' for weekly
  scheduleEnabled?: boolean; // Default: true
  
  // Performance configuration
  enableContentEnhancement?: boolean; // Default: true
  enableIntelligentChunking?: boolean; // Default: true
  enableStructuredExtraction?: boolean; // Default: true
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid'; // Default: 'hybrid'
  
  // Quality and monitoring
  qualityThreshold?: number; // Default: 0.7
  maxRetries?: number; // Default: 3
  notificationEmail?: string; // For failure notifications
}

export class EnhancedScraperStack extends Stack {
  public readonly enhancedScraperFunction: lambda.Function;
  public readonly scheduledRule?: events.Rule;
  public readonly performanceAlarm: cloudwatch.Alarm;
  public readonly qualityAlarm: cloudwatch.Alarm;
  public readonly throughputAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: EnhancedScraperStackProps) {
    super(scope, id, props);

    // Environment-based configuration
    const environment = this.node.tryGetContext('environment') || 'development';
    const stackSuffix = environment === 'production' ? '' : '-dev';

    // Configuration with defaults
    const config = {
      targetDomain: props.targetDomain || 'diabetes.org',
      maxPages: props.maxPages || 50,
      rateLimitDelay: props.rateLimitDelay || 2000,
      batchSize: props.batchSize || 5,
      scheduleExpression: props.scheduleExpression || 'rate(7 days)',
      scheduleEnabled: props.scheduleEnabled ?? true,
      enableContentEnhancement: props.enableContentEnhancement ?? true,
      enableIntelligentChunking: props.enableIntelligentChunking ?? true,
      enableStructuredExtraction: props.enableStructuredExtraction ?? true,
      chunkingStrategy: props.chunkingStrategy || 'hybrid',
      qualityThreshold: props.qualityThreshold || 0.7,
      maxRetries: props.maxRetries || 3
    };

    // ===== ENHANCED WEB SCRAPER LAMBDA FUNCTION =====
    // This function integrates all enhanced services with S3 Vectors GA infrastructure
    
    this.enhancedScraperFunction = new lambda.Function(this, 'EnhancedScraperFunction', {
      functionName: `AdaClaraEnhancedScraper-${Stack.of(this).region}${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/enhanced-web-scraper'), // Built enhanced scraper assets
      timeout: Duration.minutes(15), // Extended timeout for enhanced processing
      memorySize: 3008, // Maximum memory for optimal performance
      
      // Enhanced service configuration
      environment: {
        // Foundation Stack resources (imported)
        CONTENT_BUCKET: props.foundationStack.contentBucket.bucketName,
        VECTORS_BUCKET: props.foundationStack.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: props.foundationStack.vectorIndex.indexName,
        
        // DynamoDB resources
        CONTENT_TRACKING_TABLE: props.dynamoDBStack.contentTrackingTable.tableName,
        ANALYTICS_TABLE: props.dynamoDBStack.analyticsTable.tableName,
        AUDIT_LOGS_TABLE: props.dynamoDBStack.auditLogsTable.tableName,
        
        // Enhanced scraper configuration
        TARGET_DOMAIN: config.targetDomain,
        MAX_PAGES: config.maxPages.toString(),
        RATE_LIMIT_DELAY: config.rateLimitDelay.toString(),
        BATCH_SIZE: config.batchSize.toString(),
        
        // Enhanced processing configuration
        ENABLE_CONTENT_ENHANCEMENT: config.enableContentEnhancement.toString(),
        ENABLE_INTELLIGENT_CHUNKING: config.enableIntelligentChunking.toString(),
        ENABLE_STRUCTURED_EXTRACTION: config.enableStructuredExtraction.toString(),
        CHUNKING_STRATEGY: config.chunkingStrategy,
        
        // Quality and performance settings
        QUALITY_THRESHOLD: config.qualityThreshold.toString(),
        MAX_RETRIES: config.maxRetries.toString(),
        
        // Bedrock models
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        ENHANCEMENT_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
        
        // S3 Vectors GA configuration
        GA_MODE: 'true',
        MAX_BATCH_SIZE: '100', // GA optimal batch size
        MAX_THROUGHPUT: '1000', // GA throughput limit (vectors/second)
        METADATA_SIZE_LIMIT: '2048', // GA metadata size limit (bytes)
        MAX_METADATA_KEYS: '50', // GA metadata keys limit
        
        // Performance monitoring
        PERFORMANCE_TARGET_PAGES_PER_MINUTE: '10',
        THROUGHPUT_TARGET_VECTORS_PER_SECOND: '1000',
        
        // Change detection configuration
        CHANGE_DETECTION_ENABLED: 'true',
        SKIP_UNCHANGED_CONTENT: 'true',
        MAX_CONTENT_AGE_HOURS: '168', // 7 days
        FORCE_REFRESH_ON_SCHEDULE: 'false',
        
        // Notification configuration
        FAILURE_NOTIFICATION_TOPIC: props.foundationStack.failureNotificationTopic.topicArn,
        DEAD_LETTER_QUEUE_URL: props.foundationStack.crawlerDeadLetterQueue.queueUrl,
        
        // Security and compliance
        ALLOWED_DOMAINS: 'diabetes.org,www.diabetes.org',
        ALLOWED_PROTOCOLS: 'https',
        BLOCKED_PATHS: '/admin,/login,/api/internal,/private',
        SECURITY_LOG_LEVEL: 'info',
        AUDIT_RETENTION_DAYS: '90',
        REQUIRED_ENCRYPTION: 'SSE-S3'
      },
      
      description: 'Enhanced Web Scraper with Domain Discovery, Content Enhancement, and Intelligent Chunking'
    });

    // ===== PERMISSIONS AND ACCESS GRANTS =====
    
    // Grant access to Foundation Stack resources
    props.foundationStack.contentBucket.grantReadWrite(this.enhancedScraperFunction);
    props.foundationStack.vectorsBucket.grantListIndexes(this.enhancedScraperFunction);
    props.foundationStack.vectorIndex.grantWrite(this.enhancedScraperFunction);
    
    // Grant S3 Vectors GA permissions
    this.enhancedScraperFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // GA API actions
        's3vectors:ListVectorBuckets',
        's3vectors:GetVectorBucket',
        's3vectors:ListIndexes',
        's3vectors:GetIndex',
        's3vectors:PutVectors', // GA batch API
        's3vectors:GetVectors',
        's3vectors:QueryVectors', // GA search API
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
      ],
      resources: ['*'], // S3 Vectors requires wildcard for some operations
    }));
    
    // Grant additional S3 permissions for vectors bucket
    this.enhancedScraperFunction.addToRolePolicy(new iam.PolicyStatement({
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
        props.foundationStack.vectorsBucket.vectorBucketArn,
        `${props.foundationStack.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));
    
    // Grant Bedrock permissions for embeddings and content enhancement
    this.enhancedScraperFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0',
      ],
    }));

    // Grant DynamoDB permissions for enhanced data operations
    props.dynamoDBStack.contentTrackingTable.grantReadWriteData(this.enhancedScraperFunction);
    props.dynamoDBStack.analyticsTable.grantReadWriteData(this.enhancedScraperFunction);
    props.dynamoDBStack.auditLogsTable.grantReadWriteData(this.enhancedScraperFunction);
    
    // Grant CloudWatch permissions for enhanced monitoring
    this.enhancedScraperFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // Grant SNS and SQS permissions for notifications
    props.foundationStack.failureNotificationTopic.grantPublish(this.enhancedScraperFunction);
    props.foundationStack.crawlerDeadLetterQueue.grantSendMessages(this.enhancedScraperFunction);

    // ===== EVENTBRIDGE SCHEDULING FOR AUTOMATED CRAWLS =====
    
    if (config.scheduleEnabled) {
      this.scheduledRule = new events.Rule(this, 'EnhancedScraperSchedule', {
        ruleName: `ada-clara-enhanced-scraper-schedule${stackSuffix}`,
        description: 'Automated scheduling for enhanced web scraper with domain discovery',
        schedule: events.Schedule.expression(config.scheduleExpression),
        enabled: true,
      });

      // Add Lambda target with enhanced discovery and change detection configuration
      this.scheduledRule.addTarget(new targets.LambdaFunction(this.enhancedScraperFunction, {
        event: events.RuleTargetInput.fromObject({
          action: 'discoverAndScrape',
          domain: config.targetDomain,
          maxUrls: config.maxPages,
          enhancedProcessing: {
            enableContentEnhancement: config.enableContentEnhancement,
            enableIntelligentChunking: config.enableIntelligentChunking,
            enableStructuredExtraction: config.enableStructuredExtraction,
            chunkingStrategy: config.chunkingStrategy,
            qualityThreshold: config.qualityThreshold
          },
          changeDetection: {
            enabled: true,
            skipUnchangedContent: true,
            forceRefresh: false,
            maxAgeHours: 168 // 7 days - only process content older than this
          },
          scheduledExecution: true,
          executionType: 'weekly-change-detection',
          timestamp: events.RuleTargetInput.fromText('$aws.events.event.ingestion-time')
        })
      }));

      // Grant EventBridge permissions to invoke the function
      this.enhancedScraperFunction.addPermission('AllowEventBridgeInvoke', {
        principal: new iam.ServicePrincipal('events.amazonaws.com'),
        action: 'lambda:InvokeFunction',
        sourceArn: this.scheduledRule.ruleArn,
      });
    }

    // ===== CLOUDWATCH MONITORING AND ALERTING =====
    
    // Performance monitoring - Pages per minute
    this.performanceAlarm = new cloudwatch.Alarm(this, 'EnhancedScraperPerformanceAlarm', {
      alarmName: `ada-clara-enhanced-scraper-performance${stackSuffix}`,
      alarmDescription: 'Enhanced scraper processing speed below target (10+ pages/minute)',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/EnhancedScraper',
        metricName: 'PagesPerMinute',
        dimensionsMap: {
          FunctionName: this.enhancedScraperFunction.functionName
        },
        statistic: 'Average',
        period: Duration.minutes(5)
      }),
      threshold: 10,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING
    });

    // Quality monitoring - Average quality score
    this.qualityAlarm = new cloudwatch.Alarm(this, 'EnhancedScraperQualityAlarm', {
      alarmName: `ada-clara-enhanced-scraper-quality${stackSuffix}`,
      alarmDescription: 'Enhanced scraper content quality below threshold',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/EnhancedScraper',
        metricName: 'AverageQualityScore',
        dimensionsMap: {
          FunctionName: this.enhancedScraperFunction.functionName
        },
        statistic: 'Average',
        period: Duration.minutes(15)
      }),
      threshold: config.qualityThreshold,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Throughput monitoring - Vectors per second
    this.throughputAlarm = new cloudwatch.Alarm(this, 'EnhancedScraperThroughputAlarm', {
      alarmName: `ada-clara-enhanced-scraper-throughput${stackSuffix}`,
      alarmDescription: 'S3 Vectors throughput below GA target (1,000 vectors/second)',
      metric: new cloudwatch.Metric({
        namespace: 'ADA-Clara/EnhancedScraper',
        metricName: 'VectorsPerSecond',
        dimensionsMap: {
          FunctionName: this.enhancedScraperFunction.functionName
        },
        statistic: 'Average',
        period: Duration.minutes(5)
      }),
      threshold: 1000,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Add SNS notifications for alarms if email provided
    if (props.notificationEmail) {
      this.performanceAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(props.foundationStack.failureNotificationTopic)
      );
      this.qualityAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(props.foundationStack.failureNotificationTopic)
      );
      this.throughputAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(props.foundationStack.failureNotificationTopic)
      );
    }

    // ===== CLOUDWATCH DASHBOARD FOR ENHANCED MONITORING =====
    
    const dashboard = new cloudwatch.Dashboard(this, 'EnhancedScraperDashboard', {
      dashboardName: `ada-clara-enhanced-scraper${stackSuffix}`,
      widgets: [
        [
          // Performance metrics
          new cloudwatch.GraphWidget({
            title: 'Enhanced Scraper Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'PagesPerMinute',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'ProcessingTime',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              })
            ],
            width: 12,
            height: 6
          }),
          
          // Quality metrics
          new cloudwatch.GraphWidget({
            title: 'Content Quality Metrics',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'AverageQualityScore',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'MedicalRelevanceScore',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              })
            ],
            width: 12,
            height: 6
          })
        ],
        [
          // S3 Vectors throughput
          new cloudwatch.GraphWidget({
            title: 'S3 Vectors GA Throughput',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'VectorsPerSecond',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'TotalVectorsStored',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              })
            ],
            width: 12,
            height: 6
          }),
          
          // Enhanced services metrics
          new cloudwatch.GraphWidget({
            title: 'Enhanced Services Performance',
            left: [
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'DomainDiscoveryTime',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'ContentEnhancementTime',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              }),
              new cloudwatch.Metric({
                namespace: 'ADA-Clara/EnhancedScraper',
                metricName: 'IntelligentChunkingTime',
                dimensionsMap: { FunctionName: this.enhancedScraperFunction.functionName }
              })
            ],
            width: 12,
            height: 6
          })
        ]
      ]
    });

    // ===== OUTPUTS =====
    
    new CfnOutput(this, 'EnhancedScraperFunctionName', {
      value: this.enhancedScraperFunction.functionName,
      description: 'Enhanced Web Scraper Lambda function name',
      exportName: `ADA-Clara-Enhanced-Scraper-Function-${Stack.of(this).region}`
    });

    new CfnOutput(this, 'EnhancedScraperFunctionArn', {
      value: this.enhancedScraperFunction.functionArn,
      description: 'Enhanced Web Scraper Lambda function ARN',
      exportName: `ADA-Clara-Enhanced-Scraper-Function-ARN-${Stack.of(this).region}`
    });

    if (config.scheduleEnabled && this.scheduledRule) {
      new CfnOutput(this, 'ScheduledRuleArn', {
        value: this.scheduledRule.ruleArn,
        description: 'EventBridge rule ARN for automated enhanced scraping',
        exportName: `ADA-Clara-Enhanced-Scraper-Schedule-${Stack.of(this).region}`
      });
    }

    new CfnOutput(this, 'CloudWatchDashboardUrl', {
      value: `https://${Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${Stack.of(this).region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL for enhanced scraper monitoring'
    });

    // Enhanced configuration summary
    new CfnOutput(this, 'EnhancedScraperConfiguration', {
      value: JSON.stringify({
        targetDomain: config.targetDomain,
        maxPages: config.maxPages,
        processingTarget: '10+ pages/minute',
        throughputTarget: '1,000 vectors/second',
        enhancedServices: {
          domainDiscovery: 'Comprehensive URL discovery with relevance scoring',
          structuredExtraction: config.enableStructuredExtraction ? 'Medical fact extraction enabled' : 'Disabled',
          contentEnhancement: config.enableContentEnhancement ? 'AI-powered medical accuracy improvement' : 'Disabled',
          intelligentChunking: config.enableIntelligentChunking ? `${config.chunkingStrategy} chunking strategy` : 'Disabled'
        },
        qualityThreshold: config.qualityThreshold,
        scheduling: config.scheduleEnabled ? config.scheduleExpression : 'Disabled',
        monitoring: 'CloudWatch dashboard with performance, quality, and throughput metrics',
        s3VectorsGA: {
          maxVectorsPerIndex: '2,000,000,000',
          maxThroughput: '1,000 vectors/second',
          queryLatency: 'sub-100ms',
          metadataKeys: '50 max',
          encryption: 'SSE-S3'
        }
      }),
      description: 'Enhanced Web Scraper configuration and capabilities'
    });

    new CfnOutput(this, 'IntegrationStatus', {
      value: JSON.stringify({
        foundationStack: 'S3 Vectors GA infrastructure imported successfully',
        dynamoDBStack: 'Content tracking and analytics tables integrated',
        eventBridgeScheduling: config.scheduleEnabled ? 'Automated crawls enabled' : 'Manual execution only',
        cloudWatchMonitoring: 'Performance, quality, and throughput alarms configured',
        enhancedServices: 'All services integrated and configured',
        s3VectorsIntegration: 'GA throughput and metadata capabilities enabled'
      }),
      description: 'Enhanced Scraper Stack integration status'
    });
  }
}