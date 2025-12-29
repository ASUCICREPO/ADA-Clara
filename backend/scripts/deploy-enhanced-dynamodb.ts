#!/usr/bin/env ts-node

/**
 * Deploy Enhanced DynamoDB Stack
 * 
 * This script deploys the enhanced DynamoDB stack with all tables
 * including the new content tracking table for weekly crawler scheduling.
 */

import * as cdk from 'aws-cdk-lib';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';

const app = new cdk.App();

// Deploy DynamoDB stack with all enhanced tables
new AdaClaraDynamoDBStack(app, 'AdaClaraEnhancedDynamoDB', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ADA Clara Enhanced DynamoDB Stack - Comprehensive data storage with content tracking',
  tags: {
    Project: 'ADA-Clara',
    Component: 'DynamoDB-Enhanced',
    Environment: 'Development',
    Version: 'v2.0',
    CostCenter: 'AI-RAG-System',
  }
});

app.synth();