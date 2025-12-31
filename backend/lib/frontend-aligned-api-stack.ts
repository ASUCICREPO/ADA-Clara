import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * Frontend-Aligned API Stack
 * 
 * This stack creates all the Lambda functions and API Gateway routes
 * that were manually deployed for frontend alignment.
 * 
 * Includes:
 * - Simple Chat Processor Lambda
 * - Escalation Handler Lambda  
 * - Admin Analytics Lambda
 * - Complete API Gateway with all routes
 * - DynamoDB tables
 * - Proper permissions and CORS
 */
export class FrontendAlignedApiStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly chatProcessor: lambda.Function;
  public readonly escalationHandler: lambda.Function;
  public readonly adminAnalytics: lambda.Function;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
      ]
    });

    // Simple Chat Processor Lambda
    this.chatProcessor = new lambda.Function(this, 'SimpleChatProcessor', {
      functionName: 'ada-clara-simple-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaExecutionRole,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Simple chat processor with frontend-aligned responses'
    });

    // Escalation Handler Lambda
    this.escalationHandler = new lambda.Function(this, 'EscalationHandler', {
      functionName: 'ada-clara-escalation-handler-v2',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/escalation-handler'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaExecutionRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles Talk to Person form submissions'
    });

    // Admin Analytics Lambda
    this.adminAnalytics = new lambda.Function(this, 'AdminAnalytics', {
      functionName: 'ada-clara-admin-analytics-v2',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/admin-analytics'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaExecutionRole,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Provides admin dashboard analytics data'
    });

    // Grant DynamoDB permissions
    escalationRequestsTable.grantReadWriteData(this.escalationHandler);

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
    const escalationIntegration = new apigateway.LambdaIntegration(this.escalationHandler);
    
    escalationRequestResource.addMethod('POST', escalationIntegration);

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
    adminEscalationResource.addMethod('GET', new apigateway.LambdaIntegration(this.escalationHandler));
    
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