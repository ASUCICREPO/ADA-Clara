#!/usr/bin/env node

/**
 * Deploy Core Components Only
 * 
 * This script deploys only the essential components needed for the unified API
 * without the S3 Vectors stack to avoid circular dependency issues.
 */

import * as cdk from 'aws-cdk-lib';
import { UnifiedApiStack } from '../lib/unified-api-stack';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoAuthStack } from '../lib/cognito-auth-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { AdaClaraChatProcessorStack } from '../lib/chat-processor-stack';

async function deployCore() {
  console.log('🚀 Starting Core Components deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // ===== DEPLOY CORE DEPENDENCIES =====
    
    console.log('📦 Using existing DynamoDB stack...');
    const dynamoDBStack = new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
      env,
      description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking'
    });

    console.log('🔐 Using existing Cognito Auth stack...');
    const cognitoStack = new CognitoAuthStack(app, 'AdaClaraCognitoAuth', {
      env,
      domainPrefix: `ada-clara-${env.account}`,
      adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
      enableMFA: false,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false
      }
    });

    // Create a mock S3 bucket for RAG processor (since we can't use S3 Vectors yet)
    console.log('🤖 Deploying RAG Processor stack (will create its own content bucket)...');
    const ragProcessorStack = new RAGProcessorStack(app, 'AdaClaraRAGProcessor', {
      env,
      // contentBucket will be created automatically
      vectorsBucket: 'mock-vectors-bucket', // Mock bucket name
      vectorIndex: 'mock-vector-index' // Mock index name
    });

    console.log('💬 Deploying Chat Processor stack...');
    const chatProcessorStack = new AdaClaraChatProcessorStack(app, 'AdaClaraChatProcessor', {
      env
    });

    // ===== DEPLOY UNIFIED API =====
    
    console.log('🌐 Deploying Unified API stack (core only)...');
    const unifiedApiStack = new UnifiedApiStack(app, 'AdaClaraUnifiedAPI', {
      env,
      chatFunction: chatProcessorStack.chatFunction,
      ragFunction: ragProcessorStack.ragFunction,
      adminFunction: undefined, // Skip admin analytics for now
      authFunction: cognitoStack.authLambda,
      membershipFunction: cognitoStack.membershipVerificationLambda,
      description: 'ADA Clara Unified API Gateway - Core endpoints only'
    });

    // Add dependencies
    unifiedApiStack.addDependency(dynamoDBStack);
    unifiedApiStack.addDependency(cognitoStack);
    unifiedApiStack.addDependency(ragProcessorStack);
    unifiedApiStack.addDependency(chatProcessorStack);

    console.log('✅ All stacks defined successfully');
    console.log('📋 Core stack summary:');
    console.log('  - DynamoDB: Enhanced data storage');
    console.log('  - Cognito: Authentication and user management');
    console.log('  - RAG Processor: Query processing (with mock S3)');
    console.log('  - Chat Processor: Chat message handling');
    console.log('  - Unified API: Single API Gateway for core endpoints');

    console.log('\n🎯 Available API Endpoints:');
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
    console.log('    POST /query - Process RAG query (mock implementation)');
    console.log('');
    console.log('  System:');
    console.log('    GET  /health - Overall system health check');

    console.log('\n📝 Note: S3 Vectors integration will be added later');
    console.log('📝 After deployment, get configuration values with:');
    console.log('  npm run get-api-config');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployCore().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});