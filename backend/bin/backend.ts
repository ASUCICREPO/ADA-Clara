#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoAuthStack } from '../lib/cognito-auth-stack';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import { SecurityEnhancementsStack } from '../lib/security-enhancements-stack';
import { S3VectorsStack } from '../lib/s3-vectors-stack';
import { BedrockKnowledgeBaseStack } from '../lib/bedrock-knowledge-base-stack';
import { FrontendAlignedApiStack } from '../lib/frontend-aligned-api-stack';
import { EnhancedScraperStack } from '../lib/enhanced-scraper-stack';
import { FrontendStack } from '../lib/frontend-stack';

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

// S3 Vectors Foundation Stack (provides infrastructure for Enhanced Scraper)
const s3VectorsStack = new S3VectorsStack(app, `AdaClaraS3Vectors${stackSuffix}`, {
  env,
  description: 'ADA Clara S3 Vectors Foundation Stack - Core infrastructure for vector storage and Knowledge Base integration',
  dynamoDBStack: dynamoDBStack,
  // EventBridge scheduling moved to Enhanced Scraper Stack
  scheduleExpression: 'rate(7 days)', // Used by Enhanced Scraper Stack
  scheduleEnabled: false, // Scheduling handled by Enhanced Scraper Stack
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

// Enhanced Scraper Stack (imports Foundation Stack resources)
const enhancedScraperStack = new EnhancedScraperStack(app, `AdaClaraEnhancedScraper${stackSuffix}`, {
  env,
  description: 'ADA Clara Enhanced Web Scraper - Integrates all enhanced services with S3 Vectors GA',
  foundationStack: s3VectorsStack,
  dynamoDBStack: dynamoDBStack,
  
  // Enhanced scraper configuration
  targetDomain: 'diabetes.org',
  maxPages: 50,
  rateLimitDelay: 2000,
  batchSize: 5,
  
  // Scheduling configuration
  scheduleExpression: 'rate(7 days)', // Weekly automated crawls
  scheduleEnabled: true,
  
  // Enhanced processing configuration
  enableContentEnhancement: true,
  enableIntelligentChunking: true,
  enableStructuredExtraction: true,
  chunkingStrategy: 'hybrid', // Best balance of semantic and structural chunking
  
  // Quality and monitoring
  qualityThreshold: 0.7,
  maxRetries: 3,
  notificationEmail: process.env.ADMIN_EMAIL // Use same email as Cognito
});

// RAG Processor Stack for 95% confidence requirement
const ragProcessorStack = new RAGProcessorStack(app, `AdaClaraRAGProcessor${stackSuffix}`, {
  env,
  description: 'ADA Clara RAG Processor - Retrieval-Augmented Generation for 95% confidence responses',
  contentBucket: s3VectorsStack.contentBucket,
  vectorsBucket: s3VectorsStack.vectorsBucket.vectorBucketName,
  vectorIndex: s3VectorsStack.vectorIndex.indexName,
  knowledgeBaseId: bedrockKnowledgeBaseStack.knowledgeBase.attrKnowledgeBaseId
});

// Frontend-Aligned API Stack (Current Working API)
const frontendAlignedApiStack = new FrontendAlignedApiStack(app, `AdaClaraFrontendAlignedApi${stackSuffix}`, {
  env,
  description: 'ADA Clara Frontend-Aligned API - Clean CDK deployment with all working endpoints',
  dynamoDBStack: dynamoDBStack,
  ragProcessorEndpoint: `${ragProcessorStack.api.url}query`
});

// Frontend Stack (Amplify + CodeBuild)
// GitHub repository URL: https://github.com/ASUCICREPO/ADA-Clara
const frontendStack = new FrontendStack(app, `AdaClaraFrontend${stackSuffix}`, {
  env,
  description: 'ADA Clara Frontend - Amplify hosting with CodeBuild CI/CD',
  frontendAlignedApiStack: frontendAlignedApiStack,
  cognitoAuthStack: cognitoStack,
  repositoryUrl: process.env.GITHUB_REPO_URL || 'https://github.com/ASUCICREPO/ADA-Clara',
  branch: process.env.GITHUB_BRANCH || 'main',
});

// Add dependencies
bedrockKnowledgeBaseStack.addDependency(s3VectorsStack);
enhancedScraperStack.addDependency(s3VectorsStack);
enhancedScraperStack.addDependency(dynamoDBStack);
ragProcessorStack.addDependency(s3VectorsStack);
ragProcessorStack.addDependency(bedrockKnowledgeBaseStack);
frontendAlignedApiStack.addDependency(dynamoDBStack);
frontendAlignedApiStack.addDependency(cognitoStack);
frontendAlignedApiStack.addDependency(ragProcessorStack);
frontendStack.addDependency(frontendAlignedApiStack);
frontendStack.addDependency(cognitoStack);