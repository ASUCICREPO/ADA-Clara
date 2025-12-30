#!/usr/bin/env node

/**
 * Add Authentication Endpoints to Existing API Gateway
 * 
 * This script updates the existing AdaClaraChatAPI stack to include authentication endpoints.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

class AuthEndpointsUpdateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing API Gateway by ID (from the deployed stack)
    const existingApiId = 'gew0atxbl4'; // From our deployment outputs
    const existingApi = apigateway.RestApi.fromRestApiId(this, 'ExistingChatAPI', existingApiId);

    // Import existing Lambda functions by name
    const authFunction = lambda.Function.fromFunctionName(this, 'AuthFunction', 'ada-clara-auth-handler');
    const membershipFunction = lambda.Function.fromFunctionName(this, 'MembershipFunction', 'ada-clara-membership-verification');

    // Create Lambda integrations
    const authIntegration = new apigateway.LambdaIntegration(authFunction, {
      proxy: true,
      allowTestInvoke: true
    });

    const membershipIntegration = new apigateway.LambdaIntegration(membershipFunction, {
      proxy: true,
      allowTestInvoke: true
    });

    // ===== ADD AUTHENTICATION ENDPOINTS =====
    
    // Create /auth resource
    const authResource = existingApi.root.addResource('auth');
    
    // POST /auth - Validate JWT token
    authResource.addMethod('POST', authIntegration, {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        },
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true
        }
      }]
    });
    
    // GET /auth - Get user context from token
    authResource.addMethod('GET', authIntegration, {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        },
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true
        }
      }]
    });

    // Create /auth/user resource (alias for GET /auth)
    const userResource = authResource.addResource('user');
    userResource.addMethod('GET', authIntegration);

    // Create /auth/health resource
    const authHealthResource = authResource.addResource('health');
    authHealthResource.addMethod('GET', authIntegration);

    // Create /auth/verify-professional resource
    const verifyProfessionalResource = authResource.addResource('verify-professional');
    verifyProfessionalResource.addMethod('POST', membershipIntegration, {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        },
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true
        }
      }]
    });

    // Grant API Gateway permission to invoke Lambda functions
    authFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
    membershipFunction.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Add specific resource-based permissions for the API Gateway
    authFunction.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: existingApi.arnForExecuteApi('*', '/auth/*')
    });

    membershipFunction.addPermission('AllowApiGatewayInvokeMembership', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: existingApi.arnForExecuteApi('*', '/auth/verify-professional')
    });

    // Known API URL from deployment
    const apiUrl = 'https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/';

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'UpdatedApiUrl', {
      value: apiUrl,
      description: 'Updated API Gateway URL with Authentication endpoints'
    });

    new cdk.CfnOutput(this, 'AuthEndpoints', {
      value: JSON.stringify({
        validateToken: `${apiUrl}auth`,
        getUserContext: `${apiUrl}auth/user`,
        verifyProfessional: `${apiUrl}auth/verify-professional`,
        authHealth: `${apiUrl}auth/health`
      }),
      description: 'Authentication endpoints'
    });

    new cdk.CfnOutput(this, 'CompleteEndpointList', {
      value: JSON.stringify({
        // Existing endpoints
        health: `${apiUrl}health`,
        test: `${apiUrl}test`,
        chat: `${apiUrl}chat`,
        chatHistory: `${apiUrl}chat/history`,
        chatSessions: `${apiUrl}chat/sessions`,
        // New auth endpoints
        authValidate: `${apiUrl}auth`,
        authUser: `${apiUrl}auth/user`,
        authHealth: `${apiUrl}auth/health`,
        verifyProfessional: `${apiUrl}auth/verify-professional`
      }),
      description: 'Complete list of available endpoints'
    });

    new cdk.CfnOutput(this, 'FrontendConfigUpdated', {
      value: JSON.stringify({
        apiUrl: apiUrl,
        endpoints: {
          // Core endpoints
          health: `${apiUrl}health`,
          test: `${apiUrl}test`,
          // Chat endpoints
          chat: `${apiUrl}chat`,
          chatHistory: `${apiUrl}chat/history`,
          chatSessions: `${apiUrl}chat/sessions`,
          // Auth endpoints
          authValidate: `${apiUrl}auth`,
          authUser: `${apiUrl}auth/user`,
          authHealth: `${apiUrl}auth/health`,
          verifyProfessional: `${apiUrl}auth/verify-professional`
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

async function addAuthEndpoints() {
  console.log('🔐 Adding authentication endpoints to existing API Gateway...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Updating API in account: ${env.account}, region: ${env.region}`);

  try {
    // Create auth endpoints update stack
    const authUpdateStack = new AuthEndpointsUpdateStack(app, 'AdaClaraAuthEndpointsUpdate', {
      env,
      description: 'Add Authentication endpoints to existing ADA Clara Chat API'
    });

    console.log('✅ Auth endpoints update stack defined successfully');
    console.log('📋 New authentication endpoints to be added:');
    console.log('  🔐 Authentication:');
    console.log('    POST /auth - Validate JWT token');
    console.log('    GET  /auth - Get user context from token');
    console.log('    GET  /auth/user - Get user context (alias)');
    console.log('    GET  /auth/health - Auth service health check');
    console.log('    POST /auth/verify-professional - Verify professional credentials');
    console.log('');
    console.log('  📋 Existing endpoints (unchanged):');
    console.log('    GET  /health - System health check');
    console.log('    GET  /test - Test endpoint');
    console.log('    POST /chat - Send chat message');
    console.log('    GET  /chat/history - Get chat history');
    console.log('    GET  /chat/sessions - Get user sessions');
    console.log('');
    console.log('🔑 Authentication Configuration:');
    console.log('  - User Pool ID: us-east-1_hChjb1rUB');
    console.log('  - Client ID: 3f8vld6mnr1nsfjci1b61okc46');
    console.log('  - Identity Pool ID: us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c');
    console.log('  - Domain: https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com');
    console.log('');
    console.log('📝 After deployment, test with:');
    console.log('  curl https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health');
    console.log('  curl -X POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth \\');
    console.log('       -H "Content-Type: application/json" \\');
    console.log('       -d \'{"token":"YOUR_JWT_TOKEN"}\'');

  } catch (error) {
    console.error('❌ Auth endpoints update setup failed:', error);
    process.exit(1);
  }
}

// Run setup
addAuthEndpoints().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});