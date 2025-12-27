#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorsWithLambdaStack } from '../lib/s3-vectors-with-lambda-stack';

const app = new cdk.App();

new S3VectorsWithLambdaStack(app, 'AdaClaraS3VectorsWithLambda', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});