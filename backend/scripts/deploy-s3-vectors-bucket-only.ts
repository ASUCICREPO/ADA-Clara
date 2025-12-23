#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorsBucketOnlyStack } from '../lib/s3-vectors-bucket-only-stack';

const app = new cdk.App();

new S3VectorsBucketOnlyStack(app, 'AdaClaraS3VectorsBucketOnly', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});