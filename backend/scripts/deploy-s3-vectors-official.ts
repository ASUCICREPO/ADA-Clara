#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorsStack } from '../lib/s3-vectors-stack';

const app = new cdk.App();

new S3VectorsStack(app, 'AdaClaraS3Vectors', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});