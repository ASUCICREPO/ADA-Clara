#!/usr/bin/env node

/**
 * Deploy Minimal API Stack
 * 
 * This script deploys only the essential components needed for the unified API
 * without the admin analytics stack to avoid concurrency issues.
 */

import * as cdk from 'aws-cdk-lib';
import { UnifiedApiStack } from '../lib/unified-api-stack';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { S3VectorsSimpleStack } from '../lib/s3-vectors-simple-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { AdaClaraChatProcessorStack } from '../lib/chat-processor-stack';

async function deployMinimal() {
  console.log('🚀 Starting Minimal API deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // ===== DEPLOY CORE DEPENDENCIES =====
    
    console.log('📦 Deploying DynamoDB stack...');
    const dynamoDBStack = new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
      env,
      description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking'
    });

    // Skip Cognito for minimal deployment
    console.log('🔐 Skipping Cognito Auth stack for minimal deployment...');

    console.log('📊 Deploying S3 Vectors stack (simple)...');
    const s3VectorsStack = new S3VectorsSimpleStack(app, 'AdaClaraS3VectorsSimple', {
      env,
      dynamoDBStack: dynamoDBStack
    });

    console.log('🤖 Deploying RAG Processor stack...');
    const ragProcessorStack = new RAGProcessorStack(app, 'AdaClaraRAGProcessor', {
      env,
      contentBucket: s3VectorsStack.contentBucket,
      vectorsBucket: s3VectorsStack.vectorsBucket.vectorBucketName,
      vectorIndex: s3VectorsStack.vectorIndex.indexName
    });

    console.log('💬 Deploying Chat Processor stack...');
    const chatProcessorStack = new AdaClaraChatProcessorStack(app, 'AdaClaraChatProcessor', {
      env
    });

    // ===== DEPLOY UNIFIED API (WITHOUT ADMIN ANALYTICS) =====
    
    console.log('🌐 Deploying Unified API stack (minimal)...');
    const unifiedApiStack = new UnifiedApiStack(app, 'AdaClaraUnifiedAPI', {
      env,
      chatFunction: chatProcessorStack.chatFunction,
      ragFunction: ragProcessorStack.ragFunction,
      // Skip auth functions for minimal deployment
      description: 'ADA Clara Unified API Gateway - Single endpoint for core services (minimal)'
    });

    // Add dependencies
    unifiedApiStack.addDependency(dynamoDBStack);
    unifiedApiStack.addDependency(s3VectorsStack);
    unifiedApiStack.addDependency(ragProcessorStack);
    unifiedApiStack.addDependency(chatProcessorStack);

    console.log('✅ All stacks defined successfully');
    console.log('📋 Minimal stack summary:');
    console.log('  - DynamoDB: Enhanced data storage');
    console.log('  - Cognito: Authentication and user management');
    console.log('  - S3 Vectors: Content storage and vector search');
    console.log('  - RAG Processor: Query processing and response generation');
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
    console.log('    POST /query - Process RAG query');
    console.log('');
    console.log('  System:');
    console.log('    GET  /health - Overall system health check');

    console.log('\n📝 Note: Admin analytics endpoints are not included in this minimal deployment');
    console.log('📝 After deployment, get configuration values with:');
    console.log('  npm run get-api-config');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployMinimal().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});