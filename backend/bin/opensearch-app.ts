#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OpenSearchServerlessStack } from '../lib/opensearch-serverless-stack';

const app = new cdk.App();
new OpenSearchServerlessStack(app, 'ADA-Clara-OpenSearch-Dev', {
  environment: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});
