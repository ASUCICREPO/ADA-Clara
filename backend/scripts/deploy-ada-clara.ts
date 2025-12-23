#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { AdaClaraStack } from '../lib/ada-clara-stack';

const app = new cdk.App();

new AdaClaraStack(app, 'AdaClaraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ADA Clara S3 Vectors crawler and Knowledge Base'
});

app.synth();