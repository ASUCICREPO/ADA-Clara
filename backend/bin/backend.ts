#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';
import { OpenSearchServerlessStack } from '../lib/opensearch-serverless-stack';

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

// OpenSearch Serverless stack for Task 4.2
new OpenSearchServerlessStack(app, 'ADA-Clara-OpenSearch-Dev', {
  environment: 'dev',
  env
});