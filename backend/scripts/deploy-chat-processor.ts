#!/usr/bin/env node

/**
 * Deploy Chat Processor Stack for ADA Clara Chatbot
 * This script deploys the chat processing Lambda function and API Gateway
 */

import * as cdk from 'aws-cdk-lib';
import { AdaClaraChatProcessorStack } from '../lib/chat-processor-stack';

const app = new cdk.App();

// Get environment from context or default to dev
const environment = app.node.tryGetContext('environment') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

console.log(`Deploying ADA Clara Chat Processor Stack to ${environment} environment`);
console.log(`Account: ${account}, Region: ${region}`);

const chatProcessorStack = new AdaClaraChatProcessorStack(app, `AdaClaraChatProcessor-${environment}`, {
  env: {
    account,
    region
  },
  description: `ADA Clara Chatbot Chat Processor - ${environment}`,
  tags: {
    Project: 'ADA-Clara',
    Environment: environment,
    Component: 'ChatProcessor',
    ManagedBy: 'CDK'
  }
});

app.synth();