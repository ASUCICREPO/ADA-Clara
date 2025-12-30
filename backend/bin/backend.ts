#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoAuthStack } from '../lib/cognito-auth-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { SecurityEnhancementsStack } from '../lib/security-enhancements-stack';
import { S3VectorsGAStack } from '../lib/s3-vectors-ga-stack';
import { AdminAnalyticsStack } from '../lib/admin-analytics-stack';
import { AdaClaraChatProcessorStack } from '../lib/chat-processor-stack';
import { UnifiedApiStack } from '../lib/unified-api-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// DynamoDB stack for enhanced data storage
const dynamoDBStack = new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
  env,
  description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking'
});

// Cognito Authentication stack
const cognitoStack = new CognitoAuthStack(app, 'AdaClaraCognitoAuth', {
  env,
  domainPrefix: `ada-clara-${env.account}`,
  adminEmail: process.env.ADMIN_EMAIL, // Set via environment variable
  enableMFA: false, // Can be enabled for production
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: false
  }
});

// S3 Vectors GA stack with EventBridge scheduling
const s3VectorsStack = new S3VectorsGAStack(app, 'AdaClaraS3VectorsGA', {
  env,
  dynamoDBStack: dynamoDBStack,
  // EventBridge scheduling configuration
  scheduleExpression: 'rate(7 days)', // Weekly scheduling
  scheduleEnabled: true,
  retryAttempts: 3,
  retryBackoffRate: 2.0,
});

// RAG Processor stack
const ragProcessorStack = new RAGProcessorStack(app, 'AdaClaraRAGProcessor', {
  env,
  contentBucket: s3VectorsStack.contentBucket,
  vectorsBucket: s3VectorsStack.vectorsBucket.vectorBucketName,
  vectorIndex: s3VectorsStack.vectorIndex.indexName
});

// Admin Analytics stack
const adminAnalyticsStack = new AdminAnalyticsStack(app, 'AdaClaraAdminAnalytics', {
  env
});

// Chat Processor stack
const chatProcessorStack = new AdaClaraChatProcessorStack(app, 'AdaClaraChatProcessor', {
  env
});

// Unified API stack - consolidates all endpoints
const unifiedApiStack = new UnifiedApiStack(app, 'AdaClaraUnifiedAPI', {
  env,
  chatFunction: chatProcessorStack.chatFunction,
  ragFunction: ragProcessorStack.ragFunction,
  adminFunction: adminAnalyticsStack.analyticsLambda,
  authFunction: cognitoStack.authLambda,
  membershipFunction: cognitoStack.membershipVerificationLambda,
  description: 'ADA Clara Unified API Gateway - Single endpoint for all services'
});

// Add dependencies for unified API
unifiedApiStack.addDependency(dynamoDBStack);
unifiedApiStack.addDependency(cognitoStack);
unifiedApiStack.addDependency(s3VectorsStack);
unifiedApiStack.addDependency(ragProcessorStack);
unifiedApiStack.addDependency(adminAnalyticsStack);
unifiedApiStack.addDependency(chatProcessorStack);

// Security Enhancements stack
new SecurityEnhancementsStack(app, 'AdaClaraSecurityEnhancements', {
  env,
  apiGatewayArn: unifiedApiStack.api.arnForExecuteApi(), // Use unified API
  notificationEmail: process.env.SECURITY_NOTIFICATION_EMAIL,
  enableGuardDuty: true,
  enableConfig: true,
  enableCloudTrail: true,
  retentionDays: 90
});