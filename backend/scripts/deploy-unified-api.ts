#!/usr/bin/env node

/**
 * Deploy Unified API Stack
 * 
 * This script deploys the unified API Gateway that consolidates all endpoints
 * into a single API for easier frontend integration.
 */

import * as cdk from 'aws-cdk-lib';
import { UnifiedApiStack } from '../lib/unified-api-stack';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoAuthStack } from '../lib/cognito-auth-stack';
import { S3VectorsGAStack } from '../lib/s3-vectors-ga-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { AdminAnalyticsStack } from '../lib/admin-analytics-stack';
import { AdaClaraChatProcessorStack } from '../lib/chat-processor-stack';

async function deployUnifiedApi() {
  console.log('🚀 Starting Unified API deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // ===== DEPLOY DEPENDENCIES FIRST =====
    
    console.log('📦 Deploying DynamoDB stack...');
    const dynamoDBStack = new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
      env,
      description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking'
    });

    console.log('🔐 Deploying Cognito Auth stack...');
    const cognitoStack = new CognitoAuthStack(app, 'AdaClaraCognitoAuth', {
      env,
      domainPrefix: `ada-clara-${env.account}`,
      adminEmail: process.env.ADMIN_EMAIL,
      enableMFA: false,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false
      }
    });

    console.log('📊 Deploying S3 Vectors stack...');
    const s3VectorsStack = new S3VectorsGAStack(app, 'AdaClaraS3VectorsGA', {
      env,
      dynamoDBStack: dynamoDBStack,
      scheduleExpression: 'rate(7 days)',
      scheduleEnabled: true,
      retryAttempts: 3,
      retryBackoffRate: 2.0,
    });

    console.log('🤖 Deploying RAG Processor stack...');
    const ragProcessorStack = new RAGProcessorStack(app, 'AdaClaraRAGProcessor', {
      env,
      contentBucket: s3VectorsStack.contentBucket,
      vectorsBucket: s3VectorsStack.vectorsBucket.vectorBucketName,
      vectorIndex: s3VectorsStack.vectorIndex.indexName
    });

    console.log('📈 Deploying Admin Analytics stack...');
    const adminAnalyticsStack = new AdminAnalyticsStack(app, 'AdaClaraAdminAnalytics', {
      env
    });

    console.log('💬 Deploying Chat Processor stack...');
    const chatProcessorStack = new AdaClaraChatProcessorStack(app, 'AdaClaraChatProcessor', {
      env
    });

    // ===== DEPLOY UNIFIED API =====
    
    console.log('🌐 Deploying Unified API stack...');
    const unifiedApiStack = new UnifiedApiStack(app, 'AdaClaraUnifiedAPI', {
      env,
      chatFunction: chatProcessorStack.chatFunction,
      ragFunction: ragProcessorStack.ragFunction,
      adminFunction: adminAnalyticsStack.analyticsLambda,
      authFunction: cognitoStack.authLambda,
      membershipFunction: cognitoStack.membershipVerificationLambda,
      // Optional: Add custom domain
      // domainName: 'api.ada-clara.com',
      // certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/...'
    });

    // Add dependencies
    unifiedApiStack.addDependency(dynamoDBStack);
    unifiedApiStack.addDependency(cognitoStack);
    unifiedApiStack.addDependency(s3VectorsStack);
    unifiedApiStack.addDependency(ragProcessorStack);
    unifiedApiStack.addDependency(adminAnalyticsStack);
    unifiedApiStack.addDependency(chatProcessorStack);

    console.log('✅ All stacks defined successfully');
    console.log('📋 Stack summary:');
    console.log('  - DynamoDB: Enhanced data storage');
    console.log('  - Cognito: Authentication and user management');
    console.log('  - S3 Vectors: Content storage and vector search');
    console.log('  - RAG Processor: Query processing and response generation');
    console.log('  - Admin Analytics: Dashboard and analytics');
    console.log('  - Chat Processor: Chat message handling');
    console.log('  - Unified API: Single API Gateway for all endpoints');

    console.log('\n🎯 Unified API Endpoints:');
    console.log('  Authentication:');
    console.log('    GET  /auth - Get user context');
    console.log('    POST /auth - Validate JWT token');
    console.log('    GET  /auth/user - Get user context');
    console.log('    POST /auth/verify-professional - Verify professional credentials');
    console.log('    GET  /auth/health - Auth service health check');
    console.log('');
    console.log('  Chat:');
    console.log('    POST /chat - Send chat message');
    console.log('    GET  /chat/history - Get user sessions');
    console.log('    GET  /chat/history/{sessionId} - Get session messages');
    console.log('    GET  /chat/sessions - Get user sessions (alias)');
    console.log('');
    console.log('  Query/RAG:');
    console.log('    POST /query - Process RAG query');
    console.log('');
    console.log('  Admin (Admin users only):');
    console.log('    GET  /admin/dashboard - Dashboard data');
    console.log('    GET  /admin/conversations - Conversation analytics');
    console.log('    GET  /admin/questions - Question analytics');
    console.log('    GET  /admin/escalations - Escalation analytics');
    console.log('    GET  /admin/realtime - Real-time metrics');
    console.log('    GET  /admin/health - Admin service health check');
    console.log('');
    console.log('  System:');
    console.log('    GET  /health - Overall system health check');

    console.log('\n🔧 To deploy, run:');
    console.log('  npm run deploy-unified-api');
    console.log('\n📝 After deployment, update your frontend configuration with the API URL from the stack outputs.');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployUnifiedApi().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});