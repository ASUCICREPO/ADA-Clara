#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { S3VectorsBasicStack } from '../lib/s3-vectors-basic-stack';

const app = new cdk.App();

new S3VectorsBasicStack(app, 'AdaClaraS3VectorsBasic', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Basic S3 buckets for ADA Clara S3 Vectors setup'
});

app.synth();