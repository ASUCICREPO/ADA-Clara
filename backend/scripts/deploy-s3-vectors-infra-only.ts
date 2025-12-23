#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorsInfraOnlyStack } from '../lib/s3-vectors-infra-only-stack';

const app = new cdk.App();

new S3VectorsInfraOnlyStack(app, 'AdaClaraS3VectorsInfra', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});