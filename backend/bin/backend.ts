#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AdaClaraUnifiedStack } from '../lib/ada-clara-unified-stack';
import { AdaClaraScraperStack } from '../legacy/lib/ada-clara-scraper-stack';

const app = new cdk.App();

// Environment configuration - all dynamic, no hardcoded values
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION;

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT must be set. Run: export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)');
}

if (!region) {
  throw new Error('CDK_DEFAULT_REGION or AWS_REGION must be set. Run: export CDK_DEFAULT_REGION=$(aws configure get region)');
}

const env = {
  account,
  region
};

// Get environment context (development vs production)
const environment = app.node.tryGetContext('environment') || 'dev';

// Get Amplify App ID from context (passed by deployment script)
const amplifyAppId = app.node.tryGetContext('amplifyAppId');

// Create unified stack
new AdaClaraUnifiedStack(app, 'AdaClaraUnifiedStack', {
  env,
  description: 'ADA Clara Unified Stack - Complete backend and frontend infrastructure',
});

// Create separate scraper stack for development and testing
new AdaClaraScraperStack(app, 'AdaClaraScraperStack', {
  env,
  description: 'ADA Clara Scraper Stack - Enhanced web scraping with SQS and change detection',
});
