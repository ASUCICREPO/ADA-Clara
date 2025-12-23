#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { S3VectorsCrawlerStack } from '../lib/s3-vectors-crawler-stack';

const app = new cdk.App();

new S3VectorsCrawlerStack(app, 'AdaClaraS3VectorsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'S3 Vectors crawler and Knowledge Base for ADA Clara diabetes.org content'
});

app.synth();