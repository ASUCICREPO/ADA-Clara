#!/usr/bin/env ts-node

/**
 * Deploy S3 Vectors GA Stack
 * 
 * This script deploys the new GA S3 Vectors infrastructure alongside
 * the existing preview infrastructure for safe migration.
 */

import * as cdk from 'aws-cdk-lib';
import { S3VectorsGAStack } from '../lib/s3-vectors-ga-stack';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';

const app = new cdk.App();

// Deploy DynamoDB stack first (if not already deployed)
const dynamoDBStack = new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage',
});

// Deploy GA stack with DynamoDB dependency and EventBridge scheduling
new S3VectorsGAStack(app, 'AdaClaraS3VectorsGA', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ADA Clara S3 Vectors GA Stack - Production-ready vector storage with automated weekly scheduling',
  dynamoDBStack: dynamoDBStack, // Pass DynamoDB stack for content tracking access
  
  // EventBridge scheduling configuration
  scheduleExpression: process.env.CRAWLER_SCHEDULE_EXPRESSION || 'rate(7 days)', // Weekly by default
  scheduleEnabled: process.env.CRAWLER_SCHEDULE_ENABLED !== 'false', // Enabled by default
  notificationEmail: process.env.CRAWLER_NOTIFICATION_EMAIL, // Optional email for failure notifications
  retryAttempts: parseInt(process.env.CRAWLER_RETRY_ATTEMPTS || '3'),
  retryBackoffRate: parseFloat(process.env.CRAWLER_RETRY_BACKOFF_RATE || '2.0'),
  
  tags: {
    Project: 'ADA-Clara',
    Component: 'S3-Vectors-GA',
    Environment: 'Development',
    Version: 'GA-v1.0',
    CostCenter: 'AI-RAG-System',
    Feature: 'Weekly-Crawler-Scheduling',
  }
});

app.synth();