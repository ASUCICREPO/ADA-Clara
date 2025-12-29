#!/usr/bin/env ts-node

console.log('🔍 Testing S3VectorsGAStack minimal...');

import * as cdk from 'aws-cdk-lib';
import { S3VectorsGAStack } from './lib/s3-vectors-ga-stack';

console.log('📦 Imports successful');

const app = new cdk.App();

console.log('🚀 Creating S3VectorsGAStack without DynamoDB dependency...');

const stack = new S3VectorsGAStack(app, 'TestS3VectorsGA', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Test S3 Vectors GA Stack',
  // No dynamoDBStack dependency
  scheduleExpression: 'rate(7 days)',
  scheduleEnabled: true,
  retryAttempts: 3,
  retryBackoffRate: 2.0,
});

console.log('✅ S3VectorsGAStack created successfully');
console.log('🔍 Stack node ID:', stack.node.id);
console.log('🔍 Stack region:', stack.region);

console.log('🔧 Starting synthesis...');

app.synth();

console.log('✅ Synthesis completed');