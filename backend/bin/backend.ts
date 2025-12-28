#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';
import { S3VectorsGAStack } from '../lib/s3-vectors-ga-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// Original backend stack
new BackendStack(app, 'BackendStack', {
  env
});

// S3 Vectors GA stack for GA migration
new S3VectorsGAStack(app, 'AdaClaraS3VectorsGA', {
  env
});