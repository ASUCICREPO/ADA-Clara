#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorsMinimalStack } from '../lib/s3-vectors-minimal-stack';

const app = new cdk.App();

new S3VectorsMinimalStack(app, 'AdaClaraS3VectorsMinimalTest', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});