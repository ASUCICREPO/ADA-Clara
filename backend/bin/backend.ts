#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoAuthStack } from '../lib/cognito-auth-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { SecurityEnhancementsStack } from '../lib/security-enhancements-stack';
import { S3VectorsStack } from '../lib/s3-vectors-stack';
import { BedrockKnowledgeBaseStack } from '../lib/bedrock-knowledge-base-stack';
import { FrontendAlignedApiStack } from '../lib/frontend-aligned-api-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// Get environment context (development vs production)
const environment = app.node.tryGetContext('environment') || 'development';
const stackSuffix = environment === 'production' ? '' : '-dev';

// DynamoDB stack for enhanced data storage
const dynamoDBStack = new AdaClaraDynamoDBStack(app, `AdaClaraEnhancedDynamoDB${stackSuffix}`, {
  env,
  description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking'
});

// Cognito Authentication stack
const cognitoStack = new CognitoAuthStack(app, `AdaClaraCognitoAuth${stackSuffix}`, {
  env,
  domainPrefix: `ada-clara-${env.account}${stackSuffix}`,
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

// S3 Vectors stack with EventBridge scheduling
const s3VectorsStack = new S3VectorsStack(app, `AdaClaraS3Vectors${stackSuffix}`, {
  env,
  dynamoDBStack: dynamoDBStack,
  // EventBridge scheduling configuration - RE-ENABLED after fixing circular dependency
  scheduleExpression: 'rate(7 days)', // Weekly scheduling
  scheduleEnabled: true, // Re-enabled after fixing circular dependency
  retryAttempts: 3,
  retryBackoffRate: 2.0,
});

// Bedrock Knowledge Base stack
const bedrockKnowledgeBaseStack = new BedrockKnowledgeBaseStack(app, `AdaClaraBedrockKnowledgeBase${stackSuffix}`, {
  env,
  contentBucket: s3VectorsStack.contentBucket,
  vectorsBucket: s3VectorsStack.vectorsBucket,
  vectorIndex: s3VectorsStack.vectorIndex
});

// Frontend-Aligned API Stack (Current Working API)
const frontendAlignedApiStack = new FrontendAlignedApiStack(app, `AdaClaraFrontendAlignedApi${stackSuffix}`, {
  env,
  description: 'ADA Clara Frontend-Aligned API - Clean CDK deployment with all working endpoints',
  dynamoDBStack: dynamoDBStack
});

// Add dependencies
bedrockKnowledgeBaseStack.addDependency(s3VectorsStack);
frontendAlignedApiStack.addDependency(dynamoDBStack);
frontendAlignedApiStack.addDependency(cognitoStack);