#!/usr/bin/env node

/**
 * Deploy Chat API with Authentication Endpoints
 * 
 * This script redeploys the chat API stack with authentication endpoints included.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class ChatApiWithAuthStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly chatFunction: lambda.Function;
  public readonly authFunction: lambda.IFunction;
  public readonly membershipFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing Lambda functions
    this.authFunction = lambda.Function.fromFunctionName(this, 'AuthFunction', 'ada-clara-auth-handler');
    this.membershipFunction = lambda.Function.fromFunctionName(this, 'MembershipFunction', 'ada-clara-membership-verification');

    // Create log group for chat function
    const chatLogGroup = new logs.LogGroup(this, 'ChatProcessorLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-chat-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create chat processing Lambda function
    this.chatFunction = new lambda.Function(this, 'ChatProcessorFunction', {
      functionName: 'ada-clara-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      logGroup: chatLogGroup,
      environment: {
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        ANALYTICS_TABLE: 'ada-clara-analytics',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences',
        ESCALATION_QUEUE_TABLE: 'ada-clara-escalation-queue',
        KNOWLEDGE_CONTENT_TABLE: 'ada-clara-knowledge-content',
        // Enhanced analytics tables
        CONVERSATIONS_TABLE: 'ada-clara-conversations',
        MESSAGES_TABLE: 'ada-clara-messages',
        QUESTIONS_TABLE: 'ada-clara-questions',
        UNANSWERED_QUESTIONS_TABLE: 'ada-clara-unanswered-questions',
        CONTENT_BUCKET: 'ada-clara-content-simple-023336033519-us-east-1',
        VECTORS_BUCKET: 'ada-clara-vectors-simple-023336033519-us-east-1'
      }
    });

    // Grant DynamoDB permissions to chat function
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
      ]
    }));

    // Grant Bedrock permissions for AI responses
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`
      ]
    }));

    // Grant Comprehend permissions for language detection
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'comprehend:DetectDominantLanguage'
      ],
      resources: ['*']
    }));

    // Create a simple test Lambda function for non-chat endpoints
    const testFunction = new lambda.Function(this, 'TestFunction', {
      functionName: 'ada-clara-chat-test-function', // Different name to avoid conflicts
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: JSON.stringify({
              message: 'ADA Clara API is working!',
              timestamp: new Date().toISOString(),
              path: event.path,
              method: event.httpMethod,
              note: 'Chat and Authentication endpoints are now available!'
            })
          };
        };
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'AdaClaraAPI', {
      restApiName: 'ada-clara-api',
      description: 'ADA Clara API - Chat and Authentication functionality',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key']
      }
    });

    // Create Lambda integrations
    const chatIntegration = new apigateway.LambdaIntegration(this.chatFunction, {
      proxy: true
    });

    const testIntegration = new apigateway.LambdaIntegration(testFunction, {
      proxy: true
    });

    const authIntegration = new apigateway.LambdaIntegration(this.authFunction, {
      proxy: true
    });

    const membershipIntegration = new apigateway.LambdaIntegration(this.membershipFunction, {
      proxy: true
    });

    // ===== AUTHENTICATION ENDPOINTS =====
    const authResource = this.api.root.addResource('auth');
    
    // POST /auth - Validate JWT token
    authResource.addMethod('POST', authIntegration);
    
    // GET /auth - Get user context from token
    authResource.addMethod('GET', authIntegration);

    // GET /auth/user - Get user context (alias)
    const userResource = authResource.addResource('user');
    userResource.addMethod('GET', authIntegration);

    // GET /auth/health - Auth service health check
    const authHealthResource = authResource.addResource('health');
    authHealthResource.addMethod('GET', authIntegration);

    // POST /auth/verify-professional - Verify professional credentials
    const verifyProfessionalResource = authResource.addResource('verify-professional');
    verifyProfessionalResource.addMethod('POST', membershipIntegration);

    // ===== CHAT ENDPOINTS =====
    const chatResource = this.api.root.addResource('chat');
    
    // POST /chat - Send chat message
    chatResource.addMethod('POST', chatIntegration);
    
    // GET /chat/history - Get user sessions
    const historyResource = chatResource.addResource('history');
    historyResource.addMethod('GET', chatIntegration);
    
    // GET /chat/history/{sessionId} - Get session messages
    const sessionResource = historyResource.addResource('{sessionId}');
    sessionResource.addMethod('GET', chatIntegration);

    // GET /chat/sessions - Alias for history
    const sessionsResource = chatResource.addResource('sessions');
    sessionsResource.addMethod('GET', chatIntegration);

    // ===== TEST ENDPOINTS =====
    const testResource = this.api.root.addResource('test');
    testResource.addMethod('GET', testIntegration);
    testResource.addMethod('POST', testIntegration);

    // ===== HEALTH CHECK =====
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            service: 'ada-clara-api',
            timestamp: '$context.requestTime',
            features: ['chat', 'auth', 'test', 'health'],
            version: '2.0.0'
          })
        }
      }],
      requestTemplates: {
        'application/json': '{ "statusCode": 200 }'
      }
    }), {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        }
      }]
    });

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'ADA Clara API URL',
      exportName: 'ADA-Clara-API-URL'
    });

    new cdk.CfnOutput(this, 'ChatEndpoint', {
      value: `${this.api.url}chat`,
      description: 'Chat endpoint URL'
    });

    new cdk.CfnOutput(this, 'ChatHistoryEndpoint', {
      value: `${this.api.url}chat/history`,
      description: 'Chat history endpoint URL'
    });

    new cdk.CfnOutput(this, 'AuthEndpoint', {
      value: `${this.api.url}auth`,
      description: 'Authentication endpoint URL'
    });

    new cdk.CfnOutput(this, 'AuthUserEndpoint', {
      value: `${this.api.url}auth/user`,
      description: 'Auth user context endpoint URL'
    });

    new cdk.CfnOutput(this, 'VerifyProfessionalEndpoint', {
      value: `${this.api.url}auth/verify-professional`,
      description: 'Professional verification endpoint URL'
    });

    new cdk.CfnOutput(this, 'HealthEndpoint', {
      value: `${this.api.url}health`,
      description: 'Health check endpoint URL'
    });

    new cdk.CfnOutput(this, 'TestEndpoint', {
      value: `${this.api.url}test`,
      description: 'Test endpoint URL'
    });

    // Complete configuration for frontend team
    new cdk.CfnOutput(this, 'FrontendConfig', {
      value: JSON.stringify({
        apiUrl: this.api.url,
        endpoints: {
          // Core endpoints
          health: `${this.api.url}health`,
          test: `${this.api.url}test`,
          // Chat endpoints
          chat: `${this.api.url}chat`,
          chatHistory: `${this.api.url}chat/history`,
          chatSessions: `${this.api.url}chat/sessions`,
          // Auth endpoints
          auth: `${this.api.url}auth`,
          authUser: `${this.api.url}auth/user`,
          authHealth: `${this.api.url}auth/health`,
          verifyProfessional: `${this.api.url}auth/verify-professional`
        },
        features: ['health', 'test', 'chat', 'history', 'sessions', 'auth', 'professional-verification'],
        version: '2.0.0',
        authentication: {
          userPoolId: 'us-east-1_hChjb1rUB',
          clientId: '3f8vld6mnr1nsfjci1b61okc46',
          identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
          domain: 'https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com'
        }
      }),
      description: 'Complete frontend configuration with authentication'
    });
  }
}

async function deployChatApiWithAuth() {
  console.log('🚀 Starting Chat API with Authentication deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy chat API with auth stack
    console.log('🌐 Deploying Chat API with Authentication stack...');
    const apiStack = new ChatApiWithAuthStack(app, 'AdaClaraChatAPI', {
      env,
      description: 'ADA Clara API - Chat and Authentication functionality'
    });

    console.log('✅ Chat API with Authentication stack defined successfully');
    console.log('📋 Available endpoints:');
    console.log('  🔐 Authentication Endpoints:');
    console.log('    POST /auth - Validate JWT token');
    console.log('    GET  /auth - Get user context from token');
    console.log('    GET  /auth/user - Get user context (alias)');
    console.log('    GET  /auth/health - Auth service health check');
    console.log('    POST /auth/verify-professional - Verify professional credentials');
    console.log('');
    console.log('  🗣️  Chat Endpoints:');
    console.log('    POST /chat - Send chat message');
    console.log('    GET  /chat/history - Get user sessions');
    console.log('    GET  /chat/history/{sessionId} - Get session messages');
    console.log('    GET  /chat/sessions - Get user sessions (alias)');
    console.log('');
    console.log('  🔧 System Endpoints:');
    console.log('    GET  /health - Health check');
    console.log('    GET  /test - Test endpoint');
    console.log('    POST /test - Test endpoint');
    console.log('');
    console.log('🔑 Authentication Configuration:');
    console.log('  - User Pool ID: us-east-1_hChjb1rUB');
    console.log('  - Client ID: 3f8vld6mnr1nsfjci1b61okc46');
    console.log('  - Identity Pool ID: us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c');
    console.log('  - Domain: https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com');
    console.log('');
    console.log('📝 After deployment, test with:');
    console.log('  curl https://YOUR_API_URL/health');
    console.log('  curl https://YOUR_API_URL/auth/health');
    console.log('  curl -X POST https://YOUR_API_URL/auth -H "Content-Type: application/json" -d \'{"token":"YOUR_JWT_TOKEN"}\'');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployChatApiWithAuth().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});