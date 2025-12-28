#!/usr/bin/env ts-node

/**
 * Deploy S3 Vectors GA Stack
 * 
 * This script deploys the new GA S3 Vectors infrastructure alongside
 * the existing preview infrastructure for safe migration.
 */

import * as cdk from 'aws-cdk-lib';
import { S3VectorsGAStack } from '../lib/s3-vectors-ga-stack';

const app = new cdk.App();

// Deploy GA stack with unique naming to avoid conflicts
new S3VectorsGAStack(app, 'AdaClaraS3VectorsGA', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ADA Clara S3 Vectors GA Stack - Production-ready vector storage with 40x scale improvement',
  tags: {
    Project: 'ADA-Clara',
    Component: 'S3-Vectors-GA',
    Environment: 'Development',
    Version: 'GA-v1.0',
    CostCenter: 'AI-RAG-System',
  }
});

app.synth();