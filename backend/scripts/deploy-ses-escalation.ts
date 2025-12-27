#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SESEscalationStack } from '../lib/ses-escalation-stack';

/**
 * Deploy SES Escalation Stack for ADA Clara Chatbot
 * Handles email escalation workflow with SQS queuing and monitoring
 */

const app = new cdk.App();

// Get environment configuration
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

console.log(`🚀 Deploying SES Escalation Stack to ${region} (${account})`);

// Create the SES escalation stack
const escalationStack = new SESEscalationStack(app, 'AdaClaraSESEscalation', {
  env: {
    account,
    region
  },
  description: 'ADA Clara Chatbot - SES Email Escalation Infrastructure',
  tags: {
    Project: 'ADA-Clara-Chatbot',
    Component: 'SES-Escalation',
    Environment: process.env.NODE_ENV || 'development'
  }
});

// Add email subscriptions for escalation alerts
const supportEmails = [
  process.env.SUPPORT_EMAIL || 'support@ada-clara.org',
  process.env.ADMIN_EMAIL || 'admin@ada-clara.org'
];

supportEmails.forEach(email => {
  if (email && email.includes('@')) {
    escalationStack.addEmailSubscription(email);
    console.log(`📧 Added email subscription: ${email}`);
  }
});

// Add SMS subscription if provided
if (process.env.SUPPORT_PHONE) {
  escalationStack.addSmsSubscription(process.env.SUPPORT_PHONE);
  console.log(`📱 Added SMS subscription: ${process.env.SUPPORT_PHONE}`);
}

// Output important values
new cdk.CfnOutput(escalationStack, 'EscalationQueueUrl', {
  value: escalationStack.escalationQueue.queueUrl,
  description: 'SQS Queue URL for escalation messages',
  exportName: 'AdaClaraEscalationQueueUrl'
});

new cdk.CfnOutput(escalationStack, 'EscalationTopicArn', {
  value: escalationStack.escalationTopic.topicArn,
  description: 'SNS Topic ARN for escalation alerts',
  exportName: 'AdaClaraEscalationTopicArn'
});

new cdk.CfnOutput(escalationStack, 'EscalationLambdaArn', {
  value: escalationStack.escalationLambda.functionArn,
  description: 'Lambda function ARN for escalation processing',
  exportName: 'AdaClaraEscalationLambdaArn'
});

console.log(`
📋 SES Escalation Stack Configuration:
   - Queue: ${escalationStack.getQueueUrl()}
   - Topic: ${escalationStack.getTopicArn()}
   - Lambda: ${escalationStack.escalationLambda.functionName}
   - Region: ${region}
   - Account: ${account}

🔧 Environment Variables Required:
   - SUPPORT_EMAIL: Email address for escalation notifications
   - FROM_EMAIL: Sender email address (must be verified in SES)
   - ADMIN_EMAIL: Additional admin email for alerts
   - SUPPORT_PHONE: Phone number for SMS alerts (optional)

📧 SES Setup Required:
   1. Verify sender email addresses in SES console
   2. Request production access if needed (remove sandbox mode)
   3. Configure SPF/DKIM records for better deliverability

🚀 Next Steps:
   1. Deploy: npm run deploy:ses-escalation
   2. Verify SES email addresses
   3. Test escalation workflow
   4. Monitor CloudWatch dashboard
`);

app.synth();