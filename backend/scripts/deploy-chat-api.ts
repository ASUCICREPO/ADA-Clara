#!/usr/bin/env node

/**
 * Deploy Chat-Enabled API Stack
 * 
 * This script deploys the unified API with working chat functionality.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class ChatEnabledApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly chatFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
              note: 'Chat endpoints are now available!'
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
      description: 'ADA Clara API - Chat functionality enabled',
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
            features: ['chat', 'test', 'health'],
            version: '1.1.0'
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

    new cdk.CfnOutput(this, 'HealthEndpoint', {
      value: `${this.api.url}health`,
      description: 'Health check endpoint URL'
    });

    new cdk.CfnOutput(this, 'TestEndpoint', {
      value: `${this.api.url}test`,
      description: 'Test endpoint URL'
    });

    // Configuration summary for frontend team
    new cdk.CfnOutput(this, 'FrontendConfig', {
      value: JSON.stringify({
        apiUrl: this.api.url,
        endpoints: {
          chat: `${this.api.url}chat`,
          chatHistory: `${this.api.url}chat/history`,
          chatSessions: `${this.api.url}chat/sessions`,
          health: `${this.api.url}health`,
          test: `${this.api.url}test`
        },
        features: ['chat', 'history', 'sessions', 'health', 'test'],
        version: '1.1.0'
      }),
      description: 'Complete frontend configuration'
    });
  }
}

async function deployChatApi() {
  console.log('🚀 Starting Chat-Enabled API deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy chat-enabled API stack
    console.log('🌐 Deploying Chat-Enabled API stack...');
    const apiStack = new ChatEnabledApiStack(app, 'AdaClaraChatAPI', {
      env,
      description: 'ADA Clara API - Chat functionality enabled'
    });

    console.log('✅ Chat-Enabled API stack defined successfully');
    console.log('📋 Available endpoints:');
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
    console.log('📝 After deployment, test with:');
    console.log('  curl https://YOUR_API_URL/health');
    console.log('  curl -X POST https://YOUR_API_URL/chat -H "Content-Type: application/json" -d \'{"message":"Hello!","userId":"test-user"}\'');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployChatApi().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});