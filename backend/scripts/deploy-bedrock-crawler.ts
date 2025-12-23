#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { BedrockWebCrawlerStack } from '../lib/bedrock-web-crawler-stack';

const app = new cdk.App();

new BedrockWebCrawlerStack(app, 'BedrockWebCrawlerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Amazon Bedrock Web Crawler test stack for ADA Clara diabetes.org content'
});

app.synth();