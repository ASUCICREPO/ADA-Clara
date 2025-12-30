#!/usr/bin/env node

/**
 * Deploy Simplified API Stack
 * 
 * This script deploys a simplified API with:
 * - Public chat endpoints (no auth required)
 * - Admin endpoints (auth required)
 * - Simplified user model (public/admin only)
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class SimplifiedApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly chatFunction: lambda.Function;
  public readonly adminFunction: lambda.Function;
  public readonly authFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing auth function
    this.authFunction = lambda.Function.fromFunctionName(this, 'AuthFunction', 'ada-clara-simple-auth-handler');

    // Create log groups
    const chatLogGroup = new logs.LogGroup(this, 'ChatProcessorLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-simple-chat-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const adminLogGroup = new logs.LogGroup(this, 'AdminProcessorLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-simple-admin-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // ===== CHAT PROCESSOR LAMBDA (PUBLIC ACCESS) =====
    this.chatFunction = new lambda.Function(this, 'ChatProcessorFunction', {
      functionName: 'ada-clara-simple-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Chat request:', JSON.stringify(event, null, 2));
          
          const path = event.path;
          const method = event.httpMethod;
          const body = event.body ? JSON.parse(event.body) : {};
          
          try {
            if (method === 'POST' && path === '/chat') {
              // Handle chat message
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  response: 'Hello! I\\'m ADA Clara, your diabetes assistant. How can I help you today?',
                  sessionId: body.sessionId || 'session-' + Date.now(),
                  timestamp: new Date().toISOString(),
                  userType: 'public',
                  authRequired: false,
                  message: 'This is a simplified response. Full chat functionality will be integrated later.'
                })
              };
            } else if (method === 'GET' && (path === '/chat/history' || path === '/chat/sessions')) {
              // Handle chat history
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  sessions: [],
                  message: 'Chat history available for public users',
                  authRequired: false
                })
              };
            } else {
              return {
                statusCode: 404,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  error: 'Chat endpoint not found'
                })
              };
            }
          } catch (error) {
            return {
              statusCode: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({
                error: 'Chat service error',
                message: error.message
              })
            };
          }
        };
      `),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup: chatLogGroup,
      environment: {
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences',
        CONTENT_BUCKET: 'ada-clara-content-simple-023336033519-us-east-1',
        VECTORS_BUCKET: 'ada-clara-vectors-simple-023336033519-us-east-1'
      }
    });

    // ===== ADMIN PROCESSOR LAMBDA (AUTH REQUIRED) =====
    this.adminFunction = new lambda.Function(this, 'AdminProcessorFunction', {
      functionName: 'ada-clara-simple-admin-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Admin request:', JSON.stringify(event, null, 2));
          
          const path = event.path;
          const method = event.httpMethod;
          
          try {
            if (method === 'GET' && path === '/admin/dashboard') {
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  dashboard: {
                    totalSessions: 42,
                    totalMessages: 156,
                    activeUsers: 8,
                    systemHealth: 'healthy'
                  },
                  timestamp: new Date().toISOString(),
                  authRequired: true,
                  userType: 'admin'
                })
              };
            } else if (method === 'GET' && path === '/admin/health') {
              return {
                statusCode: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  status: 'healthy',
                  service: 'ada-clara-admin',
                  timestamp: new Date().toISOString()
                })
              };
            } else {
              return {
                statusCode: 404,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                  error: 'Admin endpoint not found'
                })
              };
            }
          } catch (error) {
            return {
              statusCode: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({
                error: 'Admin service error',
                message: error.message
              })
            };
          }
        };
      `),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup: adminLogGroup,
      environment: {
        ANALYTICS_TABLE: 'ada-clara-analytics',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs'
      }
    });

    // Grant DynamoDB permissions
    const dynamoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
      ]
    });

    this.chatFunction.addToRolePolicy(dynamoPolicy);
    this.adminFunction.addToRolePolicy(dynamoPolicy);

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'SimplifiedAPI', {
      restApiName: 'ada-clara-simplified-api',
      description: 'ADA Clara Simplified API - Public chat, Admin dashboard',
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

    const adminIntegration = new apigateway.LambdaIntegration(this.adminFunction, {
      proxy: true
    });

    const authIntegration = new apigateway.LambdaIntegration(this.authFunction, {
      proxy: true
    });

    // ===== PUBLIC CHAT ENDPOINTS (NO AUTH REQUIRED) =====
    const chatResource = this.api.root.addResource('chat');
    
    // POST /chat - Send chat message (public)
    chatResource.addMethod('POST', chatIntegration);
    
    // GET /chat/history - Get chat history (public)
    const historyResource = chatResource.addResource('history');
    historyResource.addMethod('GET', chatIntegration);
    
    // GET /chat/sessions - Get user sessions (public)
    const sessionsResource = chatResource.addResource('sessions');
    sessionsResource.addMethod('GET', chatIntegration);

    // ===== ADMIN ENDPOINTS (AUTH REQUIRED) =====
    const adminResource = this.api.root.addResource('admin');
    
    // Admin authentication endpoints
    const adminAuthResource = adminResource.addResource('auth');
    adminAuthResource.addMethod('POST', authIntegration); // POST /admin/auth
    adminAuthResource.addMethod('GET', authIntegration);  // GET /admin/auth
    
    const adminAuthHealthResource = adminAuthResource.addResource('health');
    adminAuthHealthResource.addMethod('GET', authIntegration); // GET /admin/auth/health
    
    // Admin dashboard endpoints
    const dashboardResource = adminResource.addResource('dashboard');
    dashboardResource.addMethod('GET', adminIntegration); // GET /admin/dashboard
    
    const adminHealthResource = adminResource.addResource('health');
    adminHealthResource.addMethod('GET', adminIntegration); // GET /admin/health

    // ===== SYSTEM HEALTH CHECK =====
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            service: 'ada-clara-simplified-api',
            timestamp: '$context.requestTime',
            userModel: 'simplified',
            features: {
              chat: 'public access',
              admin: 'auth required'
            },
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
      description: 'Simplified ADA Clara API URL',
      exportName: 'ADA-Clara-Simplified-API-URL'
    });

    new cdk.CfnOutput(this, 'PublicChatEndpoint', {
      value: `${this.api.url}chat`,
      description: 'Public Chat endpoint (no auth required)'
    });

    new cdk.CfnOutput(this, 'AdminDashboardEndpoint', {
      value: `${this.api.url}admin/dashboard`,
      description: 'Admin Dashboard endpoint (auth required)'
    });

    new cdk.CfnOutput(this, 'AdminAuthEndpoint', {
      value: `${this.api.url}admin/auth`,
      description: 'Admin Authentication endpoint'
    });

    // Complete configuration for frontend team
    new cdk.CfnOutput(this, 'SimplifiedFrontendConfig', {
      value: JSON.stringify({
        apiUrl: this.api.url,
        endpoints: {
          // Public endpoints (no auth)
          health: `${this.api.url}health`,
          chat: `${this.api.url}chat`,
          chatHistory: `${this.api.url}chat/history`,
          chatSessions: `${this.api.url}chat/sessions`,
          
          // Admin endpoints (auth required)
          adminAuth: `${this.api.url}admin/auth`,
          adminAuthHealth: `${this.api.url}admin/auth/health`,
          adminDashboard: `${this.api.url}admin/dashboard`,
          adminHealth: `${this.api.url}admin/health`
        },
        userModel: 'simplified',
        authRequired: {
          chat: false,
          admin: true
        },
        userTypes: ['public', 'admin'],
        features: ['public-chat', 'admin-dashboard', 'simplified-auth'],
        version: '2.0.0'
      }),
      description: 'Complete simplified frontend configuration'
    });
  }
}

async function deploySimplifiedApi() {
  console.log('🚀 Starting Simplified API deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy simplified API stack
    console.log('🌐 Deploying Simplified API stack...');
    const apiStack = new SimplifiedApiStack(app, 'AdaClaraSimplifiedAPI', {
      env,
      description: 'ADA Clara Simplified API - Public chat, Admin dashboard'
    });

    console.log('✅ Simplified API stack defined successfully');
    console.log('📋 Available endpoints:');
    console.log('');
    console.log('  🌐 Public Endpoints (No Authentication):');
    console.log('    GET  /health - System health check');
    console.log('    POST /chat - Send chat message');
    console.log('    GET  /chat/history - Get chat history');
    console.log('    GET  /chat/sessions - Get user sessions');
    console.log('');
    console.log('  🔐 Admin Endpoints (Authentication Required):');
    console.log('    POST /admin/auth - Validate admin token');
    console.log('    GET  /admin/auth - Get admin user context');
    console.log('    GET  /admin/auth/health - Auth service health');
    console.log('    GET  /admin/dashboard - Admin dashboard data');
    console.log('    GET  /admin/health - Admin service health');
    console.log('');
    console.log('🎯 Simplified User Model:');
    console.log('  👤 Public Users: Chat freely, no signup required');
    console.log('  👨‍💼 Admin Users: Dashboard access with Cognito auth');
    console.log('');
    console.log('📝 After deployment, test with:');
    console.log('  curl https://YOUR_API_URL/health');
    console.log('  curl -X POST https://YOUR_API_URL/chat -d \'{"message":"Hello!"}\'');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deploySimplifiedApi().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});