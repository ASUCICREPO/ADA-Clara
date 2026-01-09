import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
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
  public readonly chatSessionsTable: dynamodb.Table;
  public readonly analyticsTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;
  public readonly questionsTable: dynamodb.Table;

  public readonly escalationRequestsTable: dynamodb.Table;
  public readonly contentTrackingTable: dynamodb.Table;

  // Cognito
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly identityPool: cognito.CfnIdentityPool;

  // Lambda Functions
  public readonly chatProcessor: lambda.Function;
  public readonly escalationHandler: lambda.Function;
  public readonly adminAnalytics: lambda.Function;
  public readonly ragProcessor: lambda.Function;
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

  // API Gateway
  public readonly api: apigateway.RestApi;

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
    this.chatSessionsTable = new dynamodb.Table(this, 'ChatSessionsTable', {
      tableName: `ada-clara-chat-sessions${stackSuffix}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.analyticsTable = new dynamodb.Table(this, 'AnalyticsTable', {
      tableName: `ada-clara-analytics${stackSuffix}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: `ada-clara-messages${stackSuffix}`,
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.questionsTable = new dynamodb.Table(this, 'QuestionsTable', {
      tableName: `ada-clara-questions${stackSuffix}`,
      partitionKey: { name: 'questionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Add CategoryIndex GSI for querying questions by category
    this.questionsTable.addGlobalSecondaryIndex({
      indexName: 'CategoryIndex',
      partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING },
    });

    // Add UnansweredIndex GSI for querying unanswered questions by date
    this.questionsTable.addGlobalSecondaryIndex({
      indexName: 'UnansweredIndex',
      partitionKey: { name: 'date', type: dynamodb.AttributeType.STRING },
    });



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

    // Create Cognito domain with stable prefix (no stackSuffix to allow updates)
    // Domain will be: ada-clara-auth.auth.<region>.amazoncognito.com
    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: 'ada-clara-auth',
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
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
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
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
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

    // ========== LAMBDA FUNCTIONS ==========
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
              resources: ['arn:aws:bedrock:*::foundation-model/*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['comprehend:DetectDominantLanguage', 'comprehend:DetectSentiment'],
              resources: ['*'],
            }),
          ],
        }),
        SQSAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sqs:SendMessage',
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
                'sqs:GetQueueUrl'
              ],
              resources: ['*'], // Will be scoped by queue grants
            }),
          ],
        }),
        S3VectorsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3vectors:*'],
              resources: ['*'],
            }),
          ],
        }),
        BedrockAgentAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:StartIngestionJob',
                'bedrock:GetIngestionJob',
                'bedrock:ListIngestionJobs'
              ],
              resources: [
                `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
                `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}/*`
              ],
            }),
          ],
        }),
        LambdaInvokeAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['lambda:InvokeFunction'],
              resources: [`arn:aws:lambda:${region}:${accountId}:function:ada-clara-*`],
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
      role: lambdaExecutionRole,
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
      role: lambdaExecutionRole,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName, // Use stack's content bucket
        CONTENT_TRACKING_TABLE: this.contentTrackingTable.tableName, // Use stack's content tracking table
        TARGET_DOMAIN: 'diabetes.org',
        RATE_LIMIT_DELAY: '1000',
        MIN_QUALITY_THRESHOLD: '50' // Minimum quality score (0-100)
      }
    });

    // Grant SQS permissions
    this.scrapingQueue.grantSendMessages(this.domainDiscoveryFunction);
    this.scrapingQueue.grantConsumeMessages(this.contentProcessorFunction);

    // Grant S3 permissions to content processor
    this.contentBucket.grantReadWrite(this.contentProcessorFunction);

    // Grant DynamoDB permissions for content tracking
    this.contentTrackingTable.grantReadWriteData(this.domainDiscoveryFunction);
    this.contentTrackingTable.grantReadWriteData(this.contentProcessorFunction);

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
    
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `ada-clara-api${stackSuffix}`,
      description: 'ADA Clara API Gateway',
      defaultCorsPreflightOptions: {
        allowOrigins: corsOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
      },
    });

    // ========== COGNITO AUTHORIZER ==========
    // Create Cognito User Pool Authorizer for admin endpoints
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'AdminCognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: `ada-clara-admin-authorizer${stackSuffix}`,
      identitySource: 'method.request.header.Authorization',
    });

    // RAG Processor Lambda (created before chat processor to reference its function name)
    // Create log group for RAG processor function
    const ragProcessorLogGroup = new logs.LogGroup(this, 'RAGProcessorLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-rag-processor${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.ragProcessor = new lambda.Function(this, 'RAGProcessor', {
      functionName: `ada-clara-rag-processor${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/rag-processor'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: ragProcessorLogGroup,
      role: lambdaExecutionRole,
      environment: {
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        CONTENT_BUCKET: this.contentBucket.bucketName,
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        GENERATION_MODEL: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
        CONFIDENCE_THRESHOLD: '0.75',
      },
    });

    // Grant Bedrock permissions
    // Grant access to the Knowledge Base created by this stack
    this.ragProcessor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:RetrieveAndGenerate',
        'bedrock:Retrieve',
      ],
      resources: [
        `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-7-sonnet-20250219-v1:0`,
        `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
      ],
    }));

    this.contentBucket.grantRead(this.ragProcessor);

    // Create log group for chat processor
    const chatProcessorLogGroup = new logs.LogGroup(this, 'ChatProcessorLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-chat-processor${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Chat Processor Lambda
    this.chatProcessor = new lambda.Function(this, 'ChatProcessor', {
      functionName: `ada-clara-chat-processor${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      logGroup: chatProcessorLogGroup,
      role: lambdaExecutionRole,
      environment: {
        SESSIONS_TABLE: this.chatSessionsTable.tableName,
        MESSAGES_TABLE: this.messagesTable.tableName,
        ANALYTICS_TABLE: this.analyticsTable.tableName,
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        CHAT_SESSIONS_TABLE: this.chatSessionsTable.tableName,
        QUESTIONS_TABLE: this.questionsTable.tableName,
        FRONTEND_URL: frontendUrl !== '*' ? frontendUrl : '', // Pass frontend URL to Lambda for CORS
        // RAG_ENDPOINT and RAG_FUNCTION_NAME will be set using addEnvironment after all API Gateway methods are created
        // Note: CONVERSATIONS_TABLE removed - not used by chat processor
      },
    });

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
      role: lambdaExecutionRole,
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
      role: lambdaExecutionRole,
      environment: {
        ANALYTICS_TABLE: this.analyticsTable.tableName,
        QUESTIONS_TABLE: this.questionsTable.tableName,
        CHAT_SESSIONS_TABLE: this.chatSessionsTable.tableName,
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        // Note: CONVERSATIONS_TABLE removed - analytics uses CHAT_SESSIONS_TABLE instead
      },
    });

    // Grant DynamoDB permissions
    this.chatSessionsTable.grantReadWriteData(this.chatProcessor);
    this.messagesTable.grantReadWriteData(this.chatProcessor);
    this.analyticsTable.grantReadWriteData(this.chatProcessor);
    this.escalationRequestsTable.grantReadWriteData(this.escalationHandler);
    this.escalationRequestsTable.grantReadWriteData(this.chatProcessor);
    this.questionsTable.grantReadWriteData(this.chatProcessor);
    this.analyticsTable.grantReadData(this.adminAnalytics);
    // Removed: conversationsTable.grantReadData(this.adminAnalytics) - not used, analytics uses chatSessionsTable
    this.questionsTable.grantReadData(this.adminAnalytics);
    this.chatSessionsTable.grantReadData(this.adminAnalytics);
    this.escalationRequestsTable.grantReadData(this.adminAnalytics);

    // ========== API GATEWAY ROUTES ==========
    // Health endpoint
    this.api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(this.chatProcessor));

    // Chat endpoints
    const chatResource = this.api.root.addResource('chat');
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(this.chatProcessor));
    chatResource.addMethod('GET', new apigateway.LambdaIntegration(this.chatProcessor));

    // Escalation endpoints
    const escalationResource = this.api.root.addResource('escalation');
    const escalationRequestResource = escalationResource.addResource('request');
    escalationRequestResource.addMethod('POST', new apigateway.LambdaIntegration(this.escalationHandler));

    // Admin endpoints (all require Cognito authentication)
    const adminResource = this.api.root.addResource('admin');
    
    // Admin dashboard endpoint (comprehensive data)
    adminResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    // Admin health check
    const adminHealthResource = adminResource.addResource('health');
    adminHealthResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    // Admin dashboard data endpoint
    const dashboardResource = adminResource.addResource('dashboard');
    dashboardResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    // Question analytics endpoint
    const questionAnalyticsResource = adminResource.addResource('question-analytics');
    questionAnalyticsResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    // Category insights endpoint
    const categoryInsightsResource = adminResource.addResource('category-insights');
    categoryInsightsResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const metricsResource = adminResource.addResource('metrics');
    metricsResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const conversationsResource = adminResource.addResource('conversations');
    const chartResource = conversationsResource.addResource('chart');
    chartResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const languageSplitResource = adminResource.addResource('language-split');
    languageSplitResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const faqResource = adminResource.addResource('frequently-asked-questions');
    faqResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const unansweredResource = adminResource.addResource('unanswered-questions');
    unansweredResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics), {
      authorizer: cognitoAuthorizer,
    });
    
    const adminEscalationResource = adminResource.addResource('escalation-requests');
    adminEscalationResource.addMethod('GET', new apigateway.LambdaIntegration(this.escalationHandler), {
      authorizer: cognitoAuthorizer,
    });

    // RAG query endpoint
    const queryResource = this.api.root.addResource('query');
    queryResource.addMethod('POST', new apigateway.LambdaIntegration(this.ragProcessor));

    // Enhanced Web Scraper endpoints (admin-only)
    const scraperResource = this.api.root.addResource('scraper');
    
    // Manual domain discovery trigger
    scraperResource.addMethod('POST', new apigateway.LambdaIntegration(this.domainDiscoveryFunction), {
      authorizer: cognitoAuthorizer,
    });
    
    // Content processor status and health
    const scraperStatusResource = scraperResource.addResource('status');
    scraperStatusResource.addMethod('GET', new apigateway.LambdaIntegration(this.contentProcessorFunction), {
      authorizer: cognitoAuthorizer,
    });
    
    // Domain discovery endpoint
    const scraperDiscoverResource = scraperResource.addResource('discover');
    scraperDiscoverResource.addMethod('POST', new apigateway.LambdaIntegration(this.domainDiscoveryFunction), {
      authorizer: cognitoAuthorizer,
    });

    // Content processor health check
    const processorResource = scraperResource.addResource('processor');
    processorResource.addMethod('GET', new apigateway.LambdaIntegration(this.contentProcessorFunction), {
      authorizer: cognitoAuthorizer,
    });

    // Update chat processor environment with RAG endpoint and function name (AFTER all API Gateway methods are created)
    // Construct API URL manually to avoid circular dependency
    // Using Fn.join to construct URL from API Gateway ID and region avoids the circular dependency
    // Must use Fn.join for the full URL including /query path to work correctly with CloudFormation tokens
    const ragEndpoint = Fn.join('', [
      'https://',
      this.api.restApiId,
      '.execute-api.',
      this.region,
      '.amazonaws.com/prod/query'
    ]);
    this.chatProcessor.addEnvironment('RAG_ENDPOINT', ragEndpoint);
    this.chatProcessor.addEnvironment('RAG_FUNCTION_NAME', this.ragProcessor.functionName);

    // ========== AMPLIFY APP ==========
    // Amplify app is created by deploy.sh script before CDK deployment
    // We don't create it here, just reference it for outputs
    // Note: CfnApp doesn't support referencing existing apps by appId
    // The appId is passed via context and used in outputs only
    this.amplifyApp = undefined;

    // ========== OUTPUTS ==========
    new CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
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
  }
}

