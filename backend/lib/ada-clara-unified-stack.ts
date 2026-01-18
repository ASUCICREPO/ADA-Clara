import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Bucket, Index } from 'cdk-s3-vectors';
import { CfnKnowledgeBase, CfnDataSource } from 'aws-cdk-lib/aws-bedrock';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

/**
 * Unified Stack for ADA Clara
 * 
 * Combines all backend and frontend infrastructure into a single stack
 * for simplified deployment. All values are dynamic - no hardcoded values.
 */
export class AdaClaraUnifiedStack extends Stack {
  // DynamoDB Tables
  public readonly escalationRequestsTable: dynamodb.Table;
  public readonly contentTrackingTable: dynamodb.Table;

  // Consolidated data table (replaces chat-sessions, analytics, messages, questions)
  public readonly dataTable: dynamodb.Table;

  // Cognito
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly identityPool: cognito.CfnIdentityPool;

  // Lambda Functions
  public readonly chatHandler: lambda.Function;
  public readonly analyticsProcessor: lambda.Function;
  public readonly escalationHandler: lambda.Function;
  public readonly adminAnalytics: lambda.Function;
  public readonly domainDiscoveryFunction: lambda.Function;
  public readonly contentProcessorFunction: lambda.Function;

  // SQS Queue for Web Scraper
  public readonly scrapingQueue: sqs.Queue;

  // S3 Vectors
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;

  // Bedrock Knowledge Base
  public readonly knowledgeBase: CfnKnowledgeBase;
  public readonly dataSource: CfnDataSource;

  // EventBridge
  public readonly webScraperScheduleRule: events.Rule;

  // API Gateway (HTTP API v2)
  public readonly api: apigatewayv2.HttpApi;

  // Amplify App (created but deployment handled by buildspec)
  public readonly amplifyApp?: amplify.CfnApp;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountId = this.account;
    // Region must be provided via CDK_DEFAULT_REGION or AWS_REGION environment variable
    // No hardcoded fallback - will fail if not set (forces explicit configuration)
    const region = this.region;
    if (!region) {
      throw new Error('AWS region must be set via CDK_DEFAULT_REGION or AWS_REGION environment variable');
    }
    const environment = this.node.tryGetContext('environment') || 'dev';
    // No version suffix - use clean naming
    const stackSuffix = environment === 'production' ? '' : `-${environment}`;

    // Get Amplify App ID from context (passed by deployment script)
    const amplifyAppId = this.node.tryGetContext('amplifyAppId');
    let frontendUrl = amplifyAppId
      ? `https://main.${amplifyAppId}.amplifyapp.com`
      : '*';

    // Normalize: remove trailing slash for CORS consistency
    if (frontendUrl !== '*' && frontendUrl.endsWith('/')) {
      frontendUrl = frontendUrl.slice(0, -1);
    }

    console.log(`Deploying to region: ${region}, account: ${accountId}`);
    console.log(`Frontend URL for CORS: ${frontendUrl}`);

    // ========== DYNAMODB TABLES ==========
    this.escalationRequestsTable = new dynamodb.Table(this, 'EscalationRequestsTable', {
      tableName: `ada-clara-escalation-requests${stackSuffix}`,
      partitionKey: { name: 'escalationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Add GSI for efficient querying by source type (form_submit vs chat_escalation)
    this.escalationRequestsTable.addGlobalSecondaryIndex({
      indexName: 'SourceIndex',
      partitionKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    this.contentTrackingTable = new dynamodb.Table(this, 'ContentTrackingTable', {
      tableName: `ada-clara-content-tracking${stackSuffix}`,
      partitionKey: { name: 'url', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'crawlTimestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // Enable TTL for automatic cleanup
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ========== CONSOLIDATED DATA TABLE ==========
    // Consolidates chat-sessions, messages, analytics, and questions into single table
    // Using flexible PK/SK pattern for efficient queries
    this.dataTable = new dynamodb.Table(this, 'DataTable', {
      tableName: `ada-clara-data-table${stackSuffix}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI for time-based analytics queries
    this.dataTable.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: { name: 'EntityType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Optional: GSI for admin lookups by sessionId
    this.dataTable.addGlobalSecondaryIndex({
      indexName: 'SessionIndex',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========== COGNITO AUTH ==========
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `ada-clara-users${stackSuffix}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `ada-clara-web-client${stackSuffix}`,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true, custom: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [frontendUrl !== '*' ? `${frontendUrl}/auth/callback` : 'http://localhost:3000/auth/callback'],
        logoutUrls: [frontendUrl !== '*' ? frontendUrl : 'http://localhost:3000'],
      },
    });

    // Create Cognito domain with account-specific prefix to ensure global uniqueness
    // Domain format: ada-clara-<account-suffix>.auth.<region>.amazoncognito.com
    // Uses last 8 digits of account ID to keep domain name readable and unique
    const cognitoDomainPrefix = `ada-clara-${accountId.slice(-8)}`;

    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix,
      },
    });

    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `ada-clara-identity-pool${stackSuffix}`,
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
      }],
    });

    // Create IAM roles for Identity Pool
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        ApiGatewayAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['execute-api:Invoke'],
              resources: ['*'], // Will be scoped to specific API after it's created
            }),
          ],
        }),
      },
    });

    const unauthenticatedRole = new iam.Role(this, 'CognitoUnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        ApiGatewayAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['execute-api:Invoke'],
              resources: ['*'], // Will be scoped to specific API after it's created
            }),
          ],
        }),
      },
    });

    // Attach roles to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    // ========== S3 VECTORS ==========
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content${stackSuffix}-${accountId}-${region}`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
      vectorBucketName: `ada-clara-vectors${stackSuffix}-${accountId}-${region}`,
    });

    this.vectorIndex = new Index(this, 'VectorIndex', {
      vectorBucketName: this.vectorsBucket.vectorBucketName,
      indexName: `ada-clara-index${stackSuffix}`, // Clean index name
      dimension: 1024, // Titan v2 embedding dimensions
      distanceMetric: 'cosine',
      dataType: 'float32',
      metadataConfiguration: {
        nonFilterableMetadataKeys: [
          'AMAZON_BEDROCK_TEXT', 
          'AMAZON_BEDROCK_METADATA', // Bedrock-generated metadata fields
          'url',                     // Web scraper metadata fields
          'title',
          'scraped', 
          'domain'
        ]
      }
    });

    // ========== BEDROCK KNOWLEDGE BASE ==========
    const kbRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ],
    });

    this.contentBucket.grantRead(kbRole);
    // Note: S3 Vectors permissions are handled via IAM policy below
    // The vectors bucket is managed by S3 Vectors service, not standard S3

    // Grant S3 Vectors permissions
    kbRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3vectors:*'],
      resources: ['*'],
    }));

    // Grant Bedrock model invocation permissions for embeddings
    kbRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v1:0`
      ],
    }));

    this.knowledgeBase = new CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `ada-clara-kb${stackSuffix}`,
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          // AWS CloudFormation schema: Provide IndexArn and VectorBucketArn
          // Using IndexArn (not IndexName) to avoid conditional schema conflicts
          indexArn: this.vectorIndex.indexArn,
          vectorBucketArn: `arn:aws:s3vectors:${region}:${accountId}:bucket/${this.vectorsBucket.vectorBucketName}`,
        },
      } as any, // Type assertion needed for CDK type compatibility
    });

    // Create data source separately with chunking configuration
    this.dataSource = new CfnDataSource(this, 'KnowledgeBaseDataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: `ada-clara-datasource${stackSuffix}`,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.contentBucket.bucketArn,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 20,
          },
        },
      },
      // Add data deletion policy to prevent deletion issues
      dataDeletionPolicy: 'RETAIN',
    });

    // ========== LAMBDA EXECUTION ROLES ==========
    // Split Lambda roles by responsibility to break circular dependencies
    // Each role has only the permissions needed for its specific Lambda functions

    // Chat Handler Role - For chat endpoint Lambda
    const chatHandlerRole = new iam.Role(this, 'ChatHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
              resources: ['arn:aws:bedrock:*::foundation-model/*'],
            }),
          ],
        }),
      },
    });

    // Analytics Processor Role - For analytics Lambda
    const analyticsProcessorRole = new iam.Role(this, 'AnalyticsProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Admin API Role - For admin dashboard endpoints (Cognito auth required)
    // Note: Permissions are granted AFTER resources are created to avoid circular dependencies
    const adminApiRole = new iam.Role(this, 'AdminApiRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Background Jobs Role - For scheduled tasks and async processing
    // Note: Permissions are granted AFTER resources are created to avoid circular dependencies
    const backgroundJobsRole = new iam.Role(this, 'BackgroundJobsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        S3VectorsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3vectors:*'],
              resources: ['*'],
            }),
          ],
        }),
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
                'bedrock:RetrieveAndGenerate',
                'bedrock:Retrieve',
                'bedrock:StartIngestionJob',
                'bedrock:GetIngestionJob',
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/*',
                `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
              ],
            }),
          ],
        }),
      },
    });

    // ========== ENHANCED WEB SCRAPER ARCHITECTURE ==========
    // Two-lambda architecture with SQS decoupling for scalable content processing
    
    // Dead Letter Queue for failed scraping batches
    const scrapingDLQ = new sqs.Queue(this, 'ScrapingDLQ', {
      queueName: `ada-clara-scraping-dlq${stackSuffix}`,
      retentionPeriod: Duration.days(14),
    });

    // Main scraping queue for URL batches
    this.scrapingQueue = new sqs.Queue(this, 'ScrapingQueue', {
      queueName: `ada-clara-scraping-queue${stackSuffix}`,
      visibilityTimeout: Duration.minutes(15), // Match content processor timeout
      retentionPeriod: Duration.days(14),
      receiveMessageWaitTime: Duration.seconds(20), // Long polling for efficiency
      deadLetterQueue: {
        queue: scrapingDLQ,
        maxReceiveCount: 3 // After 3 failed attempts, move to DLQ
      }
    });

    // CloudWatch Alarm for DLQ messages
    const dlqAlarm = new cloudwatch.Alarm(this, 'ScrapingDLQAlarm', {
      alarmName: `ada-clara-scraping-dlq-alarm${stackSuffix}`,
      alarmDescription: 'Alert when messages appear in scraping dead letter queue',
      metric: scrapingDLQ.metric('ApproximateNumberOfMessages'),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Domain Discovery Lambda - Intelligent URL discovery and batch coordination
    // Create log group for domain discovery function
    const domainDiscoveryLogGroup = new logs.LogGroup(this, 'DomainDiscoveryLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-domain-discovery${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.domainDiscoveryFunction = new lambda.Function(this, 'DomainDiscoveryFunction', {
      functionName: `ada-clara-domain-discovery${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/domain-discovery'),
      timeout: Duration.minutes(15), // Increased for comprehensive discovery
      memorySize: 1024, // Increased for XML parsing and URL processing
      logGroup: domainDiscoveryLogGroup,
      role: backgroundJobsRole,
      environment: {
        SCRAPING_QUEUE_URL: this.scrapingQueue.queueUrl,
        CONTENT_TRACKING_TABLE: this.contentTrackingTable.tableName,
        TARGET_DOMAIN: 'diabetes.org',
        MAX_URLS_PER_BATCH: '15', // Optimized batch size for cost efficiency
        MAX_DISCOVERY_URLS: '1200' // Capture all high-quality URLs (priority 50+)
      }
    });

    // Content Processor Lambda - Enhanced content processing with quality assessment
    // Create log group for content processor function
    const contentProcessorLogGroup = new logs.LogGroup(this, 'ContentProcessorLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-content-processor${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.contentProcessorFunction = new lambda.Function(this, 'ContentProcessorFunction', {
      functionName: `ada-clara-content-processor${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/content-processor'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      logGroup: contentProcessorLogGroup,
      role: backgroundJobsRole,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName, // Use stack's content bucket
        CONTENT_TRACKING_TABLE: this.contentTrackingTable.tableName, // Use stack's content tracking table
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId, // For automatic KB ingestion
        DATA_SOURCE_ID: this.dataSource.attrDataSourceId, // For automatic KB ingestion
        TARGET_DOMAIN: 'diabetes.org',
        RATE_LIMIT_DELAY: '1000',
        MIN_QUALITY_THRESHOLD: '50' // Minimum quality score (0-100)
      }
    });

    // Note: SQS, S3, and DynamoDB permissions are now granted to backgroundJobsRole
    // See "GRANT PERMISSIONS TO LAMBDA ROLES" section below

    // Grant Bedrock ingestion permissions to Content Processor for automatic KB sync
    this.contentProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
      ],
      resources: [
        `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
      ],
    }));

    // Configure Content Processor to be triggered by SQS messages
    this.contentProcessorFunction.addEventSource(new SqsEventSource(this.scrapingQueue, {
      batchSize: 1, // Process one message at a time (each message contains multiple URLs)
      maxBatchingWindow: Duration.seconds(5),
      reportBatchItemFailures: true // Enable partial batch failure reporting
    }));

    // EventBridge Rule for weekly scraping (Every Sunday at 2 AM UTC)
    this.webScraperScheduleRule = new events.Rule(this, 'WebScraperScheduleRule', {
      ruleName: `ada-clara-web-scraper-schedule${stackSuffix}`,
      description: 'Weekly scheduled web scraping for diabetes.org content',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        weekDay: 'SUN', // Every Sunday at 2 AM UTC
      }),
      enabled: true,
    });

    // Add Domain Discovery Lambda target to EventBridge rule
    this.webScraperScheduleRule.addTarget(new targets.LambdaFunction(this.domainDiscoveryFunction, {
      event: events.RuleTargetInput.fromObject({
        source: 'aws.events',
        'detail-type': 'Scheduled Web Scraping',
        detail: {
          action: 'discover-domain',
          comprehensive: true,
          sources: ['sitemap', 'seed-urls'],
          maxUrls: 1200,
          priorityFilter: 50,
          scheduledExecution: true,
          executionId: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').toString(),
          timestamp: events.RuleTargetInput.fromText('${aws.events.event.ingestion-time}').toString(),
        },
      }),
    }));

    // Grant EventBridge permission to invoke Domain Discovery Lambda
    this.domainDiscoveryFunction.addPermission('AllowEventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: this.webScraperScheduleRule.ruleArn,
    });

    // Create API Gateway first (needed for RAG endpoint reference)
    // Handle CORS origins: cannot mix '*' with specific origins
    // Always include localhost for development, and Amplify URL when available
    // For production, always use specific origins (not ALL_ORIGINS) for security
    const corsOrigins = frontendUrl === '*'
      ? ['http://localhost:3000', 'https://localhost:3000']  // Development only
      : [frontendUrl, 'http://localhost:3000', 'https://localhost:3000'];
    
    console.log(`CORS Origins configured: ${JSON.stringify(corsOrigins)}`);

    // ========== HTTP API (V2) ==========
    // Using HTTP API instead of REST API to avoid circular dependency issues
    // HTTP APIs have simpler permission models and don't create as many implicit dependencies
    this.api = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `ada-clara-api${stackSuffix}`,
      description: 'ADA Clara HTTP API Gateway',
      corsPreflight: {
        allowOrigins: corsOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
        allowCredentials: true,
      },
    });

    // ========== COGNITO AUTHORIZER ==========
    // Create JWT Authorizer for Cognito User Pool (admin endpoints)
    const cognitoAuthorizer = new HttpJwtAuthorizer('CognitoAuthorizer',
      `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}`,
      {
        jwtAudience: [this.userPoolClient.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      }
    );

    // ========== ANALYTICS PROCESSOR LAMBDA ==========
    // Async analytics and data processing (renamed from chat-data-processor)
    const analyticsProcessorLogGroup = new logs.LogGroup(this, 'AnalyticsProcessorLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-analytics-processor${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.analyticsProcessor = new lambda.Function(this, 'AnalyticsProcessor', {
      functionName: `ada-clara-analytics-processor${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/analytics-processor'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      logGroup: analyticsProcessorLogGroup,
      role: analyticsProcessorRole,
      environment: {
        DATA_TABLE: this.dataTable.tableName,
        FRONTEND_URL: frontendUrl !== '*' ? frontendUrl : '',
        API_GATEWAY_URL: '', // Set by buildspec post-deployment to avoid circular dependency
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        IDENTITY_POOL_ID: this.identityPool.ref,
        COGNITO_DOMAIN: `https://${this.userPoolDomain.domainName}.auth.${region}.amazoncognito.com`,
      },
    });

    // ========== CHAT HANDLER LAMBDA ==========
    // Unified chat processing (replaces orchestrator + session-manager + rag-processor + response-handler)
    const chatHandlerLogGroup = new logs.LogGroup(this, 'ChatHandlerLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-chat-handler${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.chatHandler = new lambda.Function(this, 'ChatHandler', {
      functionName: `ada-clara-chat-handler${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-handler'),
      timeout: Duration.minutes(5), // For Claude invocation
      memorySize: 1536, // More memory for AWS SDK + Bedrock
      logGroup: chatHandlerLogGroup,
      role: chatHandlerRole,
      environment: {
        DATA_TABLE: this.dataTable.tableName,
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        // Bedrock model ID format: provider.model-version
        // To update model: Change this ID and the IAM policy below (line 689)
        // Find model IDs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
        GENERATION_MODEL: 'anthropic.claude-3-5-haiku-20241022-v1:0',
        CONFIDENCE_THRESHOLD: '0.75',
        ANALYTICS_PROCESSOR_ARN: '', // Will be set after analytics processor is created
      },
    });

    // Set analytics processor ARN after both functions are created
    this.chatHandler.addEnvironment('ANALYTICS_PROCESSOR_ARN', this.analyticsProcessor.functionArn);

    // Grant Bedrock permissions
    this.chatHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:Retrieve',
      ],
      resources: [
        `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0`,
        `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
      ],
    }));

    // Grant permission to invoke analytics processor
    this.chatHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [this.analyticsProcessor.functionArn],
    }));

    // Grant S3 read access
    this.contentBucket.grantRead(this.chatHandler);

    // Create log group for escalation handler
    const escalationHandlerLogGroup = new logs.LogGroup(this, 'EscalationHandlerLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-escalation-handler${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.escalationHandler = new lambda.Function(this, 'EscalationHandler', {
      functionName: `ada-clara-escalation-handler${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/escalation-handler'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      logGroup: escalationHandlerLogGroup,
      role: adminApiRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        FRONTEND_URL: frontendUrl !== '*' ? frontendUrl : '', // Pass frontend URL for CORS
      },
    });

    // Create log group for admin analytics
    const adminAnalyticsLogGroup = new logs.LogGroup(this, 'AdminAnalyticsLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-admin-analytics${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.adminAnalytics = new lambda.Function(this, 'AdminAnalytics', {
      functionName: `ada-clara-admin-analytics${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/admin-analytics'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      logGroup: adminAnalyticsLogGroup,
      role: adminApiRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        DATA_TABLE: this.dataTable.tableName,
      },
    });

    // Note: DynamoDB permissions are now granted to roles, not individual Lambda functions
    // See "GRANT PERMISSIONS TO LAMBDA ROLES" section below for role-based grants

    // ========== HTTP API ROUTES ==========
    // HTTP API uses routes instead of resources/methods
    // Routes are defined with method + path, integrations are Lambda functions

    // Public endpoints (no auth required)
    this.api.addRoutes({
      path: '/config',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ConfigIntegration', this.analyticsProcessor),
    });

    this.api.addRoutes({
      path: '/chat',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChatIntegration', this.chatHandler),
    });

    this.api.addRoutes({
      path: '/chat/history',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChatHistoryIntegration', this.analyticsProcessor),
    });

    this.api.addRoutes({
      path: '/chat/sessions',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChatSessionsIntegration', this.analyticsProcessor),
    });

    this.api.addRoutes({
      path: '/escalation/request',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('EscalationRequestIntegration', this.escalationHandler),
    });

    // Admin endpoints (require Cognito JWT authentication)
    this.api.addRoutes({
      path: '/admin',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminDashboardIntegration', this.adminAnalytics),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/admin/dashboard',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminDashboardDataIntegration', this.adminAnalytics),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/admin/metrics',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('MetricsIntegration', this.adminAnalytics),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/admin/conversations/chart',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ConversationsChartIntegration', this.adminAnalytics),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/admin/language-split',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('LanguageSplitIntegration', this.adminAnalytics),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/admin/escalation-requests',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminEscalationRequestsIntegration', this.escalationHandler),
      authorizer: cognitoAuthorizer,
    });

    // Scraper endpoints (admin-only)
    this.api.addRoutes({
      path: '/scraper',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ScraperTriggerIntegration', this.domainDiscoveryFunction),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/scraper/status',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ScraperStatusIntegration', this.contentProcessorFunction),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/scraper/discover',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ScraperDiscoverIntegration', this.domainDiscoveryFunction),
      authorizer: cognitoAuthorizer,
    });

    this.api.addRoutes({
      path: '/scraper/processor',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ScraperProcessorIntegration', this.contentProcessorFunction),
      authorizer: cognitoAuthorizer,
    });

    // Note: chat-handler invokes analytics-processor asynchronously via Lambda SDK
    // Uses InvocationType: 'Event' for fire-and-forget pattern (non-blocking)

    // ========== GRANT PERMISSIONS TO LAMBDA ROLES ==========
    // Grant permissions AFTER all resources are created to avoid circular dependencies

    // Chat Handler Role permissions - grant access to DynamoDB tables, Knowledge Base, and Analytics Lambda
    chatHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:*'],
      resources: [
        this.escalationRequestsTable.tableArn,
        `${this.escalationRequestsTable.tableArn}/index/*`, // GSI access for SourceIndex
        this.dataTable.tableArn,
        `${this.dataTable.tableArn}/index/*`, // GSI access for TimestampIndex and SessionIndex
      ],
    }));

    chatHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:Retrieve'],
      resources: [this.knowledgeBase.attrKnowledgeBaseArn],
    }));

    chatHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [this.analyticsProcessor.functionArn],
    }));

    // Analytics Processor Role permissions - grant access to DynamoDB tables only
    analyticsProcessorRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:GetItem', 'dynamodb:Query'],
      resources: [
        this.dataTable.tableArn,
        `${this.dataTable.tableArn}/index/*`, // GSI access for TimestampIndex and SessionIndex
      ],
    }));

    // Admin API Role permissions - grant access to DynamoDB tables
    adminApiRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
      resources: [
        this.escalationRequestsTable.tableArn,
        `${this.escalationRequestsTable.tableArn}/index/*`, // GSI access for SourceIndex
        this.dataTable.tableArn,
        `${this.dataTable.tableArn}/index/*`, // GSI access for TimestampIndex and SessionIndex
      ],
    }));

    // Background Jobs Role permissions - grant access to content tracking table
    backgroundJobsRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:*'],
      resources: [this.contentTrackingTable.tableArn],
    }));
    backgroundJobsRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
      resources: [this.scrapingQueue.queueArn],
    }));
    backgroundJobsRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
      resources: [
        this.contentBucket.bucketArn,
        `${this.contentBucket.bucketArn}/*`,
      ],
    }));

    // ========== AMPLIFY APP ==========
    // Amplify app is created by deploy.sh script before CDK deployment
    // We don't create it here, just reference it for outputs
    // Note: CfnApp doesn't support referencing existing apps by appId
    // The appId is passed via context and used in outputs only
    this.amplifyApp = undefined;

    // ========== OUTPUTS ==========
    new CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url!,  // HTTP API URL is always defined after deployment
      description: 'HTTP API Gateway URL',
      exportName: `AdaClara-ApiGatewayUrl-${region}`,
    });

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `AdaClara-UserPoolId-${region}`,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `AdaClara-UserPoolClientId-${region}`,
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `AdaClara-IdentityPoolId-${region}`,
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${this.userPoolDomain.domainName}.auth.${region}.amazoncognito.com`,
      description: 'Cognito Domain URL',
      exportName: `AdaClara-CognitoDomain-${region}`,
    });

    if (amplifyAppId) {
      new CfnOutput(this, 'AmplifyAppId', {
        value: amplifyAppId,
        description: 'Amplify App ID (created by deploy.sh)',
        exportName: `AdaClara-AmplifyAppId-${region}`,
      });
    }

    new CfnOutput(this, 'Region', {
      value: region,
      description: 'AWS Region',
      exportName: `AdaClara-Region-${region}`,
    });

    new CfnOutput(this, 'DomainDiscoveryFunctionName', {
      value: this.domainDiscoveryFunction.functionName,
      description: 'Domain Discovery Lambda Function Name',
      exportName: `AdaClara-DomainDiscoveryFunction-${region}`,
    });

    new CfnOutput(this, 'ContentProcessorFunctionName', {
      value: this.contentProcessorFunction.functionName,
      description: 'Content Processor Lambda Function Name',
      exportName: `AdaClara-ContentProcessorFunction-${region}`,
    });

    new CfnOutput(this, 'ScrapingQueueUrl', {
      value: this.scrapingQueue.queueUrl,
      description: 'SQS Queue URL for scraping batches',
      exportName: `AdaClara-ScrapingQueueUrl-${region}`,
    });

    new CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'S3 Vectors Bucket Name',
      exportName: `AdaClara-VectorsBucket-${region}`,
    });

    new CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.attrKnowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
      exportName: `AdaClara-KnowledgeBaseId-${region}`,
    });

    new CfnOutput(this, 'DataSourceId', {
      value: this.dataSource.attrDataSourceId,
      description: 'Bedrock Knowledge Base Data Source ID',
      exportName: `AdaClara-DataSourceId-${region}`,
    });

    new CfnOutput(this, 'ChatHandlerFunctionName', {
      value: this.chatHandler.functionName,
      description: 'Chat Handler Lambda Function Name (unified chat processing)',
      exportName: `AdaClara-ChatHandlerFunction-${region}`,
    });

    new CfnOutput(this, 'AnalyticsProcessorFunctionName', {
      value: this.analyticsProcessor.functionName,
      description: 'Analytics Processor Lambda Function Name (async data processing)',
      exportName: `AdaClara-AnalyticsProcessorFunction-${region}`,
    });

    new CfnOutput(this, 'DataTableName', {
      value: this.dataTable.tableName,
      description: 'Consolidated Data Table Name',
      exportName: `AdaClara-DataTableName-${region}`,
    });

    new CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'S3 Content Bucket Name for scraped content',
      exportName: `AdaClara-ContentBucket-${region}`,
    });

    new CfnOutput(this, 'ContentTrackingTableName', {
      value: this.contentTrackingTable.tableName,
      description: 'Content Tracking DynamoDB Table Name',
      exportName: `AdaClara-ContentTrackingTable-${region}`,
    });

    new CfnOutput(this, 'EscalationRequestsTableName', {
      value: this.escalationRequestsTable.tableName,
      description: 'Escalation Requests DynamoDB Table Name',
      exportName: `AdaClara-EscalationRequestsTable-${region}`,
    });
  }
}

