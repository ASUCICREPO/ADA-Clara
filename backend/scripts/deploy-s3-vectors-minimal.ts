#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { S3VectorsSimpleStack } from '../lib/s3-vectors-simple-stack';

const app = new cdk.App();

new S3VectorsSimpleStack(app, 'AdaClaraS3VectorsMinimal', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Minimal S3 Vectors setup for ADA Clara diabetes.org content'
});

app.synth();