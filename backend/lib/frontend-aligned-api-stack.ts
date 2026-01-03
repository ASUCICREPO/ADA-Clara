import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { AdaClaraDynamoDBStack } from './dynamodb-stack';

export interface FrontendAlignedApiStackProps extends StackProps {
  dynamoDBStack: AdaClaraDynamoDBStack;
  ragProcessorEndpoint?: string; // Optional - RAG processor API endpoint
}

/**
 * Frontend-Aligned API Stack
 * 
 * This stack creates all the Lambda functions and API Gateway routes
 * that were manually deployed for frontend alignment.
 * 
 * Includes:
 * - Simple Chat Processor Lambda (NEW ARCHITECTURE)
 * - Escalation Handler Lambda  
 * - Admin Analytics Lambda
 * - Complete API Gateway with all routes
 * - Proper permissions and CORS
 */
export class FrontendAlignedApiStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly chatProcessor: lambda.Function;
  public readonly escalationHandler: lambda.Function;
  public readonly adminAnalytics: lambda.Function;

  constructor(scope: Construct, id: string, props: FrontendAlignedApiStackProps) {
    super(scope, id, props);

    const { dynamoDBStack } = props;

    // DynamoDB Tables
    const escalationRequestsTable = new dynamodb.Table(this, 'EscalationRequestsTable', {
      tableName: 'ada-clara-escalation-requests',
      partitionKey: { name: 'escalationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl'
    });

    // IAM Role for Lambda functions
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess')
      ],
      inlinePolicies: {
        BedrockAndComprehendAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream'
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/*'
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'comprehend:DetectDominantLanguage',
                'comprehend:DetectSentiment'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // CloudWatch Log Groups for Lambda functions
    const chatProcessorLogGroup = new logs.LogGroup(this, 'ChatProcessorLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-simple-chat-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const escalationHandlerLogGroup = new logs.LogGroup(this, 'EscalationHandlerLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-escalation-handler-v2',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const adminAnalyticsLogGroup = new logs.LogGroup(this, 'AdminAnalyticsLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-admin-analytics-v2',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Simple Chat Processor Lambda (NEW ARCHITECTURE)
    this.chatProcessor = new lambda.Function(this, 'SimpleChatProcessor', {
      functionName: 'ada-clara-simple-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/chat-processor/index.handler', // Updated handler path
      code: lambda.Code.fromAsset('dist'), // Include entire dist directory for service dependencies
      timeout: Duration.seconds(30),
      memorySize: 512, // Increased for bundled code
      role: lambdaExecutionRole,
      logGroup: chatProcessorLogGroup,
      description: 'Chat processor with clean architecture - TypeScript bundled',
      environment: {
        SESSIONS_TABLE: dynamoDBStack.chatSessionsTable.tableName,
        MESSAGES_TABLE: dynamoDBStack.messagesTable.tableName,
        ANALYTICS_TABLE: dynamoDBStack.analyticsTable.tableName,
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName,
        // Add correct table names for the service
        CHAT_SESSIONS_TABLE: dynamoDBStack.chatSessionsTable.tableName,
        CONVERSATIONS_TABLE: dynamoDBStack.conversationsTable.tableName,
        // RAG processor endpoint for 95% confidence requirement
        RAG_ENDPOINT: props.ragProcessorEndpoint || '',
        // RAG Lambda function name (for direct Lambda invocation)
        RAG_FUNCTION_NAME: 'ada-clara-rag-processor-v2-us-east-1'
      }
    });

    // Escalation Handler Lambda (NEW ARCHITECTURE)
    this.escalationHandler = new lambda.Function(this, 'EscalationHandler', {
      functionName: 'ada-clara-escalation-handler-v3',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/escalation-handler/index.handler', // Updated handler path
      code: lambda.Code.fromAsset('dist'), // Include entire dist directory for service dependencies
      timeout: Duration.seconds(30),
      memorySize: 512, // Increased for bundled code
      role: lambdaExecutionRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName
      },
      logGroup: escalationHandlerLogGroup,
      description: 'Escalation handler with clean architecture - TypeScript bundled'
    });

    // Admin Analytics Lambda (NEW ARCHITECTURE)
    this.adminAnalytics = new lambda.Function(this, 'AdminAnalytics', {
      functionName: 'ada-clara-admin-analytics-v3',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handlers/admin-analytics/index.handler', // Updated handler path
      code: lambda.Code.fromAsset('dist'), // Include entire dist directory for service dependencies
      timeout: Duration.seconds(30),
      memorySize: 512, // Increased for bundled code
      role: lambdaExecutionRole,
      logGroup: adminAnalyticsLogGroup,
      description: 'Admin analytics with clean architecture - TypeScript bundled',
      environment: {
        ANALYTICS_TABLE: dynamoDBStack.analyticsTable.tableName,
        CONVERSATIONS_TABLE: dynamoDBStack.conversationsTable.tableName,
        QUESTIONS_TABLE: dynamoDBStack.questionsTable.tableName,
        UNANSWERED_QUESTIONS_TABLE: dynamoDBStack.unansweredQuestionsTable.tableName
      }
    });

    // Grant DynamoDB permissions
    escalationRequestsTable.grantReadWriteData(this.escalationHandler);
    
    // Grant access to DynamoDB tables from the main stack
    dynamoDBStack.grantFullAccess(this.chatProcessor);
    dynamoDBStack.grantReadAccess(this.adminAnalytics);

    // API Gateway
    this.api = new apigateway.RestApi(this, 'FrontendAlignedApi', {
      restApiName: 'ada-clara-frontend-aligned-api',
      description: 'ADA Clara API with frontend-aligned endpoints',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000
      }
    });

    // Health endpoint
    const healthIntegration = new apigateway.LambdaIntegration(this.chatProcessor);
    this.api.root.addResource('health').addMethod('GET', healthIntegration);

    // Chat endpoints
    const chatResource = this.api.root.addResource('chat');
    const chatIntegration = new apigateway.LambdaIntegration(this.chatProcessor);
    
    chatResource.addMethod('POST', chatIntegration);
    chatResource.addMethod('GET', chatIntegration); // Health check
    
    const chatHistoryResource = chatResource.addResource('history');
    chatHistoryResource.addMethod('GET', chatIntegration);
    
    const chatSessionsResource = chatResource.addResource('sessions');
    chatSessionsResource.addMethod('GET', chatIntegration);

    // Escalation endpoints
    const escalationResource = this.api.root.addResource('escalation');
    const escalationRequestResource = escalationResource.addResource('request');
    const escalationRequestsResource = escalationResource.addResource('requests');
    const escalationHealthResource = escalationResource.addResource('health');
    const escalationIntegration = new apigateway.LambdaIntegration(this.escalationHandler);
    
    // Escalation request submission (public)
    escalationRequestResource.addMethod('POST', escalationIntegration);
    
    // Escalation requests list (for admin)
    escalationRequestsResource.addMethod('GET', escalationIntegration);
    
    // Escalation health check
    escalationHealthResource.addMethod('GET', escalationIntegration);
    escalationResource.addMethod('GET', escalationIntegration); // Health check at /escalation

    // Admin endpoints
    const adminResource = this.api.root.addResource('admin');
    const adminIntegration = new apigateway.LambdaIntegration(this.adminAnalytics);
    
    // Admin dashboard
    const dashboardResource = adminResource.addResource('dashboard');
    dashboardResource.addMethod('GET', adminIntegration);
    
    // Admin metrics
    const metricsResource = adminResource.addResource('metrics');
    metricsResource.addMethod('GET', adminIntegration);
    
    // Admin escalation requests
    const adminEscalationResource = adminResource.addResource('escalation-requests');
    adminEscalationResource.addMethod('GET', escalationIntegration); // Use escalation integration for proper handling
    
    // Additional admin endpoints
    const conversationsResource = adminResource.addResource('conversations');
    const chartResource = conversationsResource.addResource('chart');
    chartResource.addMethod('GET', adminIntegration);
    
    const languageSplitResource = adminResource.addResource('language-split');
    languageSplitResource.addMethod('GET', adminIntegration);
    
    const faqResource = adminResource.addResource('frequently-asked-questions');
    faqResource.addMethod('GET', adminIntegration);
    
    const unansweredResource = adminResource.addResource('unanswered-questions');
    unansweredResource.addMethod('GET', adminIntegration);

    // Stack Outputs
    this.exportValue(this.api.url, {
      name: 'FrontendAlignedApiUrl',
      description: 'URL of the frontend-aligned API Gateway'
    });

    this.exportValue(escalationRequestsTable.tableName, {
      name: 'EscalationRequestsTableName',
      description: 'Name of the escalation requests DynamoDB table'
    });
  }
}