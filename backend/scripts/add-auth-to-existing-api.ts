#!/usr/bin/env node

/**
 * Add Authentication Endpoints to Existing Chat API
 * 
 * This script adds authentication endpoints to the existing AdaClaraChatAPI stack.
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

class AddAuthToExistingApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing API Gateway
    const existingApiId = 'gew0atxbl4'; // From the outputs we saw
    const existingApi = apigateway.RestApi.fromRestApiId(this, 'ExistingChatAPI', existingApiId);

    // Import existing Lambda functions
    const authFunction = lambda.Function.fromFunctionName(this, 'AuthFunction', 'ada-clara-auth-handler');
    const membershipFunction = lambda.Function.fromFunctionName(this, 'MembershipFunction', 'ada-clara-membership-verification');

    // Create Lambda integrations
    const authIntegration = new apigateway.LambdaIntegration(authFunction, {
      proxy: true
    });

    const membershipIntegration = new apigateway.LambdaIntegration(membershipFunction, {
      proxy: true
    });

    // Add authentication endpoints to existing API
    const authResource = existingApi.root.addResource('auth');
    
    // JWT validation and user context
    authResource.addMethod('GET', authIntegration); // GET /auth - get user context
    authResource.addMethod('POST', authIntegration); // POST /auth - validate token
    
    // User context endpoint
    const userResource = authResource.addResource('user');
    userResource.addMethod('GET', authIntegration);
    
    // Auth health check
    const authHealthResource = authResource.addResource('health');
    authHealthResource.addMethod('GET', authIntegration);
    
    // Professional verification endpoint
    const verifyResource = authResource.addResource('verify-professional');
    verifyResource.addMethod('POST', membershipIntegration);

    // Grant API Gateway permission to invoke Lambda functions
    authFunction.grantInvoke(new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'));
    membershipFunction.grantInvoke(new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'));

    // Outputs
    new cdk.CfnOutput(this, 'UpdatedApiUrl', {
      value: existingApi.url,
      description: 'Updated API Gateway URL with Authentication endpoints'
    });

    new cdk.CfnOutput(this, 'AuthEndpoints', {
      value: JSON.stringify({
        validateToken: `${existingApi.url}auth`,
        getUserContext: `${existingApi.url}auth/user`,
        verifyProfessional: `${existingApi.url}auth/verify-professional`,
        authHealth: `${existingApi.url}auth/health`
      }),
      description: 'Authentication endpoints'
    });
  }
}

async function addAuthToExistingApi() {
  console.log('🔐 Adding authentication endpoints to existing Chat API...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Updating API in account: ${env.account}, region: ${env.region}`);

  try {
    // Add auth to existing API
    const authUpdateStack = new AddAuthToExistingApiStack(app, 'AdaClaraAuthUpdate', {
      env,
      description: 'Add Authentication endpoints to existing ADA Clara Chat API'
    });

    console.log('✅ Auth update stack defined successfully');
    console.log('📋 New authentication endpoints will be added:');
    console.log('  🔐 POST /auth - validate JWT token');
    console.log('  🔐 GET /auth - get user context');
    console.log('  🔐 GET /auth/user - get user context');
    console.log('  🔐 POST /auth/verify-professional - verify professional credentials');
    console.log('  🔐 GET /auth/health - auth service health');
    console.log('');
    console.log('📝 Existing API URL: https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/');
    console.log('🔑 Cognito Configuration:');
    console.log('  - User Pool ID: us-east-1_hChjb1rUB');
    console.log('  - Client ID: 3f8vld6mnr1nsfjci1b61okc46');
    console.log('  - Identity Pool ID: us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c');
    console.log('  - Domain: https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com');

  } catch (error) {
    console.error('❌ Auth update setup failed:', error);
    process.exit(1);
  }
}

// Run setup
addAuthToExistingApi().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});