#!/usr/bin/env node

/**
 * Deploy Unified API with Authentication Integration
 * 
 * This script deploys the unified API Gateway with all endpoints including authentication.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { UnifiedApiStack } from '../lib/unified-api-stack';

class UnifiedApiWithAuthStack extends cdk.Stack {
  public readonly chatFunction: lambda.Function;
  public readonly ragFunction: lambda.Function;
  public readonly authFunction: lambda.Function;
  public readonly membershipFunction: lambda.Function;
  public readonly unifiedApi: UnifiedApiStack;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create log groups
    const chatLogGroup = new logs.LogGroup(this, 'ChatLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-chat-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const ragLogGroup = new logs.LogGroup(this, 'RagLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-rag-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const authLogGroup = new logs.LogGroup(this, 'AuthLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-auth-handler-unified',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const membershipLogGroup = new logs.LogGroup(this, 'MembershipLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-membership-verification-unified',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // ===== CHAT PROCESSOR LAMBDA =====
    this.chatFunction = new lambda.Function(this, 'ChatProcessor', {
      functionName: 'ada-clara-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      logGroup: chatLogGroup,
      environment: {
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        CHAT_HISTORY_TABLE: 'ada-clara-chat-history',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        BEDROCK_REGION: this.region,
        COMPREHEND_REGION: this.region,
        MAX_TOKENS: '4000',
        TEMPERATURE: '0.7'
      }
    });

    // ===== RAG PROCESSOR LAMBDA =====
    this.ragFunction = new lambda.Function(this, 'RagProcessor', {
      functionName: 'ada-clara-rag-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-ga'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      logGroup: ragLogGroup,
      environment: {
        VECTORS_BUCKET: `ada-clara-vectors-minimal-${this.account}-${this.region}`,
        VECTOR_INDEX: 'ada-clara-vector-index',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v1',
        BEDROCK_REGION: this.region,
        MAX_TOKENS: '4000',
        TEMPERATURE: '0.7'
      }
    });

    // ===== AUTH HANDLER LAMBDA =====
    this.authFunction = new lambda.Function(this, 'AuthHandler', {
      functionName: 'ada-clara-auth-handler-unified',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/auth-handler'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup: authLogGroup,
      environment: {
        USER_POOL_ID: 'us-east-1_hChjb1rUB', // From Cognito deployment
        USER_POOL_CLIENT_ID: '3f8vld6mnr1nsfjci1b61okc46', // From Cognito deployment
        REGION: this.region,
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences'
      }
    });

    // ===== MEMBERSHIP VERIFICATION LAMBDA =====
    this.membershipFunction = new lambda.Function(this, 'MembershipVerification', {
      functionName: 'ada-clara-membership-verification-unified',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/membership-verification'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup: membershipLogGroup,
      environment: {
        USER_POOL_ID: 'us-east-1_hChjb1rUB', // From Cognito deployment
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs'
      }
    });

    // ===== PERMISSIONS =====

    // Chat function permissions
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`
      ]
    }));

    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'comprehend:DetectDominantLanguage',
        'comprehend:DetectSentiment'
      ],
      resources: ['*']
    }));

    // RAG function permissions
    this.ragFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`
      ]
    }));

    this.ragFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket'
      ],
      resources: [
        `arn:aws:s3:::ada-clara-vectors-minimal-${this.account}-${this.region}`,
        `arn:aws:s3:::ada-clara-vectors-minimal-${this.account}-${this.region}/*`
      ]
    }));

    // Auth function permissions
    this.authFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-identity:GetCredentialsForIdentity',
        'cognito-identity:GetId',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:ListUsers'
      ],
      resources: [
        `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/us-east-1_hChjb1rUB`,
        `arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`
      ]
    }));

    // Membership function permissions
    this.membershipFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes'
      ],
      resources: [
        `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/us-east-1_hChjb1rUB`
      ]
    }));

    // DynamoDB permissions for all functions
    const dynamoPolicy = new iam.PolicyStatement({
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
    });

    this.chatFunction.addToRolePolicy(dynamoPolicy);
    this.authFunction.addToRolePolicy(dynamoPolicy);
    this.membershipFunction.addToRolePolicy(dynamoPolicy);

    // ===== UNIFIED API STACK =====
    this.unifiedApi = new UnifiedApiStack(this, 'UnifiedAPI', {
      chatFunction: this.chatFunction,
      ragFunction: this.ragFunction,
      authFunction: this.authFunction,
      membershipFunction: this.membershipFunction
    });

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'ChatFunctionArn', {
      value: this.chatFunction.functionArn,
      description: 'Chat Processor Lambda ARN',
      exportName: 'ADA-Clara-Chat-Function-ARN'
    });

    new cdk.CfnOutput(this, 'RagFunctionArn', {
      value: this.ragFunction.functionArn,
      description: 'RAG Processor Lambda ARN',
      exportName: 'ADA-Clara-RAG-Function-ARN'
    });

    new cdk.CfnOutput(this, 'AuthFunctionArn', {
      value: this.authFunction.functionArn,
      description: 'Auth Handler Lambda ARN',
      exportName: 'ADA-Clara-Auth-Function-ARN'
    });

    new cdk.CfnOutput(this, 'MembershipFunctionArn', {
      value: this.membershipFunction.functionArn,
      description: 'Membership Verification Lambda ARN',
      exportName: 'ADA-Clara-Membership-Function-ARN'
    });

    new cdk.CfnOutput(this, 'UnifiedApiUrl', {
      value: this.unifiedApi.apiUrl,
      description: 'Unified API Gateway URL with Authentication',
      exportName: 'ADA-Clara-Unified-API-URL-With-Auth'
    });
  }
}

async function deployUnifiedApiWithAuth() {
  console.log('🚀 Starting Unified API with Authentication deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy unified API with auth
    console.log('🔗 Deploying Unified API with Authentication...');
    const unifiedApiStack = new UnifiedApiWithAuthStack(app, 'AdaClaraUnifiedAPIWithAuth', {
      env,
      description: 'ADA Clara Unified API Gateway with Authentication Integration'
    });

    console.log('✅ Unified API with Auth stack defined successfully');
    console.log('📋 Available endpoints:');
    console.log('  🏥 Health: GET /health');
    console.log('  🔐 Authentication:');
    console.log('    - POST /auth - validate JWT token');
    console.log('    - GET /auth - get user context');
    console.log('    - GET /auth/user - get user context');
    console.log('    - POST /auth/verify-professional - verify professional credentials');
    console.log('    - GET /auth/health - auth service health');
    console.log('  💬 Chat:');
    console.log('    - POST /chat - send message');
    console.log('    - GET /chat/history - get chat history');
    console.log('    - GET /chat/history/{sessionId} - get specific session');
    console.log('    - GET /chat/sessions - get user sessions');
    console.log('  🔍 Query:');
    console.log('    - POST /query - RAG search');
    console.log('    - GET /query - query service health');
    console.log('');
    console.log('📝 After deployment, API URL will be available in outputs');
    console.log('🔑 Cognito Configuration:');
    console.log('  - User Pool ID: us-east-1_hChjb1rUB');
    console.log('  - Client ID: 3f8vld6mnr1nsfjci1b61okc46');
    console.log('  - Identity Pool ID: us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c');
    console.log('  - Domain: https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployUnifiedApiWithAuth().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});