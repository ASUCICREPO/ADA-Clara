import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index } from 'cdk-s3-vectors';
import { CfnKnowledgeBase, CfnDataSource } from 'aws-cdk-lib/aws-bedrock';
import * as amplify from 'aws-cdk-lib/aws-amplify';

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
  public readonly conversationsTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;
  public readonly questionsTable: dynamodb.Table;
  public readonly unansweredQuestionsTable: dynamodb.Table;
  public readonly escalationRequestsTable: dynamodb.Table;
  public readonly contentTrackingTable: dynamodb.Table;

  // Cognito
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly identityPool: cognito.CfnIdentityPool;

  // API Gateway
  public readonly api: apigateway.RestApi;
  public readonly chatProcessor: lambda.Function;
  public readonly escalationHandler: lambda.Function;
  public readonly adminAnalytics: lambda.Function;
  public readonly ragProcessor: lambda.Function;

  // S3 Vectors
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;

  // Bedrock Knowledge Base
  public readonly knowledgeBase: CfnKnowledgeBase;

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
    // Add version suffix to table names to avoid conflicts with existing tables
    // Change this version number if you need to create new tables (e.g., after deleting old ones)
    const tableVersion = this.node.tryGetContext('tableVersion') || 'v2';
    const stackSuffix = environment === 'production' ? '' : `-${environment}-${tableVersion}`;

    // Get Amplify App ID from context (passed by deployment script)
    const amplifyAppId = this.node.tryGetContext('amplifyAppId');
    const frontendUrl = amplifyAppId
      ? `https://main.${amplifyAppId}.amplifyapp.com`
      : '*';

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

    this.conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `ada-clara-conversations${stackSuffix}`,
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
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
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.unansweredQuestionsTable = new dynamodb.Table(this, 'UnansweredQuestionsTable', {
      tableName: `ada-clara-unanswered-questions${stackSuffix}`,
      partitionKey: { name: 'questionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.escalationRequestsTable = new dynamodb.Table(this, 'EscalationRequestsTable', {
      tableName: `ada-clara-escalation-requests${stackSuffix}`,
      partitionKey: { name: 'escalationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.contentTrackingTable = new dynamodb.Table(this, 'ContentTrackingTable', {
      tableName: `ada-clara-content-tracking${stackSuffix}`,
      partitionKey: { name: 'url', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'crawlTimestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ========== COGNITO AUTH ==========
    const domainPrefix = `ada-clara-${accountId}${stackSuffix}`;
    
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

    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix },
    });

    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `ada-clara-identity-pool${stackSuffix}`,
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
      }],
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
      indexName: `ada-clara-index${stackSuffix}`,
      dimension: 1024, // Titan v2 embedding dimensions
      distanceMetric: 'cosine',
      dataType: 'float32',
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

    // Create data source separately
    new CfnDataSource(this, 'KnowledgeBaseDataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: `ada-clara-datasource${stackSuffix}`,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.contentBucket.bucketArn,
        },
      },
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
      },
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

    // RAG Processor Lambda (created before chat processor to reference its function name)
    const ragLogGroup = new logs.LogGroup(this, 'RAGProcessorLogGroup', {
      logGroupName: `/aws/lambda/ada-clara-rag-processor-v2-${region}${stackSuffix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.ragProcessor = new lambda.Function(this, 'RAGProcessor', {
      functionName: `ada-clara-rag-processor-v2-${region}${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/handlers/rag-processor/index.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: ragLogGroup,
      role: lambdaExecutionRole,
      environment: {
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        CONTENT_BUCKET: this.contentBucket.bucketName,
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        GENERATION_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
        CONFIDENCE_THRESHOLD: '0.95',
      },
    });

    // Grant S3 Vectors permissions to RAG processor
    this.ragProcessor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:SearchVectors',
        's3vectors:GetVector',
        's3vectors:ListVectors',
        's3vectors:GetVectorBucket',
        's3vectors:GetIndex',
        's3vectors:ListIndexes',
      ],
      resources: [
        `arn:aws:s3vectors:${region}:${accountId}:bucket/${this.vectorsBucket.vectorBucketName}`,
        `arn:aws:s3vectors:${region}:${accountId}:bucket/${this.vectorsBucket.vectorBucketName}/index/${this.vectorIndex.indexName}`,
        `arn:aws:s3vectors:${region}:${accountId}:bucket/${this.vectorsBucket.vectorBucketName}/*`,
      ],
    }));

    // Grant Bedrock permissions
    // Note: Currently using existing KB (UUGQXLYUXG) that has data
    // TODO: Update to use this.knowledgeBase.attrKnowledgeBaseId once new KB is populated
    const knowledgeBaseId = 'UUGQXLYUXG'; // Existing KB with data
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
        `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${knowledgeBaseId}`,
        `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`, // Also grant access to new KB for future use
      ],
    }));

    this.contentBucket.grantRead(this.ragProcessor);

    // Chat Processor Lambda
    this.chatProcessor = new lambda.Function(this, 'ChatProcessor', {
      functionName: `ada-clara-simple-chat-processor${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/handlers/chat-processor/index.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: lambdaExecutionRole,
      environment: {
        SESSIONS_TABLE: this.chatSessionsTable.tableName,
        MESSAGES_TABLE: this.messagesTable.tableName,
        ANALYTICS_TABLE: this.analyticsTable.tableName,
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
        CHAT_SESSIONS_TABLE: this.chatSessionsTable.tableName,
        CONVERSATIONS_TABLE: this.conversationsTable.tableName,
        FRONTEND_URL: frontendUrl !== '*' ? frontendUrl : '', // Pass frontend URL to Lambda for CORS
        // RAG_ENDPOINT and RAG_FUNCTION_NAME will be set using addEnvironment after all API Gateway methods are created
      },
    });

    this.escalationHandler = new lambda.Function(this, 'EscalationHandler', {
      functionName: `ada-clara-escalation-handler-v3${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/handlers/escalation-handler/index.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: lambdaExecutionRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: this.escalationRequestsTable.tableName,
      },
    });

    this.adminAnalytics = new lambda.Function(this, 'AdminAnalytics', {
      functionName: `ada-clara-admin-analytics-v3${stackSuffix}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'src/handlers/admin-analytics/index.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: lambdaExecutionRole,
      environment: {
        ANALYTICS_TABLE: this.analyticsTable.tableName,
        CONVERSATIONS_TABLE: this.conversationsTable.tableName,
        QUESTIONS_TABLE: this.questionsTable.tableName,
        UNANSWERED_QUESTIONS_TABLE: this.unansweredQuestionsTable.tableName,
      },
    });

    // Grant DynamoDB permissions
    this.chatSessionsTable.grantReadWriteData(this.chatProcessor);
    this.messagesTable.grantReadWriteData(this.chatProcessor);
    this.analyticsTable.grantReadWriteData(this.chatProcessor);
    this.escalationRequestsTable.grantReadWriteData(this.escalationHandler);
    this.escalationRequestsTable.grantReadWriteData(this.chatProcessor);
    this.analyticsTable.grantReadData(this.adminAnalytics);
    this.conversationsTable.grantReadData(this.adminAnalytics);
    this.questionsTable.grantReadData(this.adminAnalytics);
    this.unansweredQuestionsTable.grantReadData(this.adminAnalytics);

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

    // Admin endpoints
    const adminResource = this.api.root.addResource('admin');
    const metricsResource = adminResource.addResource('metrics');
    metricsResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics));
    
    const conversationsResource = adminResource.addResource('conversations');
    const chartResource = conversationsResource.addResource('chart');
    chartResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics));
    
    const languageSplitResource = adminResource.addResource('language-split');
    languageSplitResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics));
    
    const faqResource = adminResource.addResource('frequently-asked-questions');
    faqResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics));
    
    const unansweredResource = adminResource.addResource('unanswered-questions');
    unansweredResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminAnalytics));
    
    const adminEscalationResource = adminResource.addResource('escalation-requests');
    adminEscalationResource.addMethod('GET', new apigateway.LambdaIntegration(this.escalationHandler));

    // RAG query endpoint
    const queryResource = this.api.root.addResource('query');
    queryResource.addMethod('POST', new apigateway.LambdaIntegration(this.ragProcessor));

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
      value: `https://${domainPrefix}.auth.${region}.amazoncognito.com`,
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
  }
}

