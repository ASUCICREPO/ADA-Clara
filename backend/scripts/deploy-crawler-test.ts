#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { WebCrawlerTestStack } from '../lib/web-crawler-test';

const app = new cdk.App();

new WebCrawlerTestStack(app, 'WebCrawlerTestStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Test stack for comparing Bedrock vs Custom web crawlers for ADA Clara'
});

app.synth();