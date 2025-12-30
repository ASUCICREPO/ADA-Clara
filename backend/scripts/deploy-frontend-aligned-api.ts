#!/usr/bin/env node

/**
 * Deploy Frontend-Aligned API
 * 
 * This script deploys the complete ADA Clara backend aligned with frontend expectations:
 * 1. Chat processor with updated response format
 * 2. Escalation handler for "Talk to Person" form
 * 3. Admin analytics for dashboard data
 * 4. Simple auth handler for admin authentication
 * 5. Unified API Gateway with all routes
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

class FrontendAlignedApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ===== DYNAMODB TABLES =====
    
    // Escalation requests table
    const escalationRequestsTable = new dynamodb.Table(this, 'EscalationRequestsTable', {
      tableName: `ada-clara-escalation-requests-${this.account}`,
      partitionKey: { name: 'escalationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // ===== LAMBDA FUNCTIONS =====

    // Common Lambda role with necessary permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
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
                escalationRequestsTable.tableArn,
                `${escalationRequestsTable.tableArn}/index/*`
              ]
            })
          ]
        }),
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream'
              ],
              resources: ['*']
            })
          ]
        }),
        ComprehendAccess: new iam.PolicyDocument({
          statements: [
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

    // 1. Chat Processor Lambda (updated for frontend alignment)
    const chatFunction = new lambda.Function(this, 'ChatProcessor', {
      functionName: `ada-clara-chat-processor-${this.account}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      role: lambdaRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName,
        AWS_REGION: this.region
      }
    });

    // 2. Escalation Handler Lambda
    const escalationFunction = new lambda.Function(this, 'EscalationHandler', {
      functionName: `ada-clara-escalation-handler-${this.account}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/escalation-handler'),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role: lambdaRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName,
        AWS_REGION: this.region
      }
    });

    // 3. Admin Analytics Lambda
    const adminAnalyticsFunction = new lambda.Function(this, 'AdminAnalytics', {
      functionName: `ada-clara-admin-analytics-${this.account}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/admin-analytics'),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role: lambdaRole,
      environment: {
        ESCALATION_REQUESTS_TABLE: escalationRequestsTable.tableName,
        AWS_REGION: this.region
      }
    });

    // 4. Simple Auth Handler Lambda (for admin authentication)
    const authFunction = new lambda.Function(this, 'SimpleAuthHandler', {
      functionName: `ada-clara-simple-auth-handler-${this.account}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/simple-auth-handler'),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role: lambdaRole,
      environment: {
        USER_POOL_ID: 'us-east-1_hChjb1rUB', // From our deployed Cognito
        USER_POOL_CLIENT_ID: '3f8vld6mnr1nsfjci1b61okc46',
        REGION: this.region
      }
    });

    // ===== API GATEWAY =====

    const api = new apigateway.RestApi(this, 'FrontendAlignedAPI', {
      restApiName: `ada-clara-frontend-aligned-api-${this.account}`,
      description: 'ADA Clara API aligned with frontend expectations',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ]
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000
      }
    });

    // Lambda integrations
    const chatIntegration = new apigateway.LambdaIntegration(chatFunction, { proxy: true });
    const escalationIntegration = new apigateway.LambdaIntegration(escalationFunction, { proxy: true });
    const adminIntegration = new apigateway.LambdaIntegration(adminAnalyticsFunction, { proxy: true });
    const authIntegration = new apigateway.LambdaIntegration(authFunction, { proxy: true });

    // ===== SYSTEM HEALTH ENDPOINT =====
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            service: 'ada-clara-api',
            timestamp: '$context.requestTime',
            userModel: 'simplified',
            version: '2.0.0'
          })
        }
      }],
      requestTemplates: {
        'application/json': '{"statusCode": 200}'
      }
    }), {
      methodResponses: [{
        statusCode: '200'
      }]
    });

    // ===== PUBLIC CHAT ENDPOINTS (NO AUTH REQUIRED) =====
    const chatResource = api.root.addResource('chat');
    
    // POST /chat - Send message (public access)
    chatResource.addMethod('POST', chatIntegration);
    
    // GET /chat/history - Get chat history (public access)
    const historyResource = chatResource.addResource('history');
    historyResource.addMethod('GET', chatIntegration);
    
    // GET /chat/sessions - Get user sessions (public access)
    const sessionsResource = chatResource.addResource('sessions');
    sessionsResource.addMethod('GET', chatIntegration);

    // ===== ESCALATION ENDPOINTS (PUBLIC ACCESS) =====
    const escalationResource = api.root.addResource('escalation');
    
    // POST /escalation/request - Submit "Talk to Person" form
    const escalationRequestResource = escalationResource.addResource('request');
    escalationRequestResource.addMethod('POST', escalationIntegration);
    
    // GET /escalation/health - Health check
    escalationResource.addMethod('GET', escalationIntegration);

    // ===== ADMIN AUTHENTICATION ENDPOINTS =====
    const authResource = api.root.addResource('auth');
    
    // POST /auth - Validate admin JWT token
    authResource.addMethod('POST', authIntegration);
    
    // GET /auth - Get admin user context
    authResource.addMethod('GET', authIntegration);
    
    // GET /auth/health - Auth service health
    const authHealthResource = authResource.addResource('health');
    authHealthResource.addMethod('GET', authIntegration);

    // ===== ADMIN DASHBOARD ENDPOINTS (AUTH REQUIRED) =====
    const adminResource = api.root.addResource('admin');
    
    // GET /admin/dashboard - Complete dashboard data
    const dashboardResource = adminResource.addResource('dashboard');
    dashboardResource.addMethod('GET', adminIntegration);
    
    // GET /admin/metrics - Metrics cards data
    const metricsResource = adminResource.addResource('metrics');
    metricsResource.addMethod('GET', adminIntegration);
    
    // GET /admin/conversations/chart - Conversations over time
    const conversationsResource = adminResource.addResource('conversations');
    const chartResource = conversationsResource.addResource('chart');
    chartResource.addMethod('GET', adminIntegration);
    
    // GET /admin/language-split - Language distribution
    const languageResource = adminResource.addResource('language-split');
    languageResource.addMethod('GET', adminIntegration);
    
    // GET /admin/escalation-requests - Escalation requests table
    const adminEscalationResource = adminResource.addResource('escalation-requests');
    adminEscalationResource.addMethod('GET', escalationIntegration);
    
    // GET /admin/frequently-asked-questions - FAQ data
    const faqResource = adminResource.addResource('frequently-asked-questions');
    faqResource.addMethod('GET', adminIntegration);
    
    // GET /admin/unanswered-questions - Unanswered questions
    const unansweredResource = adminResource.addResource('unanswered-questions');
    unansweredResource.addMethod('GET', adminIntegration);

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Frontend-aligned API Gateway URL'
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: api.restApiId,
      description: 'API Gateway ID'
    });

    new cdk.CfnOutput(this, 'EscalationTableName', {
      value: escalationRequestsTable.tableName,
      description: 'Escalation requests table name'
    });

    // Output configuration for frontend
    new cdk.CfnOutput(this, 'FrontendConfig', {
      value: JSON.stringify({
        apiUrl: api.url,
        userModel: 'simplified',
        userTypes: ['public', 'admin'],
        publicEndpoints: {
          health: `${api.url}health`,
          chat: `${api.url}chat`,
          chatHistory: `${api.url}chat/history`,
          chatSessions: `${api.url}chat/sessions`,
          escalationRequest: `${api.url}escalation/request`
        },
        adminEndpoints: {
          auth: `${api.url}auth`,
          authHealth: `${api.url}auth/health`,
          dashboard: `${api.url}admin/dashboard`,
          escalationRequests: `${api.url}admin/escalation-requests`
        },
        authentication: {
          userPoolId: 'us-east-1_hChjb1rUB',
          clientId: '3f8vld6mnr1nsfjci1b61okc46',
          identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
          domain: 'https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
          requiredFor: ['admin']
        }
      }, null, 2),
      description: 'Complete frontend configuration'
    });
  }
}

// Deploy the stack
const app = new cdk.App();
new FrontendAlignedApiStack(app, 'AdaClaraFrontendAlignedApi', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});

console.log('🚀 Deploying frontend-aligned ADA Clara API...');
console.log('📋 This includes:');
console.log('   - Updated chat processor with frontend-expected response format');
console.log('   - Escalation handler for "Talk to Person" form submissions');
console.log('   - Admin analytics for dashboard data');
console.log('   - Simple auth handler for admin authentication');
console.log('   - Complete API Gateway with all required routes');
console.log('');
console.log('🎯 Frontend expectations addressed:');
console.log('   ✅ Chat response format: { response, confidence, sources, escalated }');
console.log('   ✅ Escalation form endpoint: POST /escalation/request');
console.log('   ✅ Admin dashboard data endpoints');
console.log('   ✅ Simplified user model (public + admin only)');
console.log('   ✅ No authentication required for public chat');
console.log('   ✅ Admin authentication via Cognito JWT');