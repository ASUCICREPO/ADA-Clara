#!/usr/bin/env ts-node

/**
 * Deploy Frontend-Aligned API Stack
 * 
 * This script deploys the complete frontend-aligned API using CDK,
 * making future deployments much simpler and more reliable.
 */

import * as cdk from 'aws-cdk-lib';
import { FrontendAlignedApiStack } from '../lib/frontend-aligned-api-stack';

async function deployFrontendAlignedStack() {
  console.log('🚀 Deploying Frontend-Aligned API Stack...\n');

  const app = new cdk.App();
  
  const stack = new FrontendAlignedApiStack(app, 'AdaClaraFrontendAlignedApi', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    },
    description: 'ADA Clara Frontend-Aligned API with all Lambda functions and routes'
  });

  // Add tags for resource management
  cdk.Tags.of(stack).add('Project', 'ADA-Clara');
  cdk.Tags.of(stack).add('Environment', 'Production');
  cdk.Tags.of(stack).add('Component', 'Frontend-Aligned-API');
  cdk.Tags.of(stack).add('DeployedBy', 'CDK');

  console.log('📋 Stack Configuration:');
  console.log(`   Stack Name: ${stack.stackName}`);
  console.log(`   Region: ${stack.region}`);
  console.log(`   Account: ${stack.account}`);
  console.log('');

  console.log('📦 Resources to be created:');
  console.log('   ✅ Simple Chat Processor Lambda');
  console.log('   ✅ Escalation Handler Lambda');
  console.log('   ✅ Admin Analytics Lambda');
  console.log('   ✅ API Gateway with all routes');
  console.log('   ✅ DynamoDB Escalation Requests Table');
  console.log('   ✅ IAM Roles and Permissions');
  console.log('   ✅ CloudWatch Log Groups');
  console.log('');

  console.log('🎯 API Endpoints that will be created:');
  console.log('   GET  /health');
  console.log('   POST /chat');
  console.log('   GET  /chat/history');
  console.log('   GET  /chat/sessions');
  console.log('   POST /escalation/request');
  console.log('   GET  /admin/dashboard');
  console.log('   GET  /admin/metrics');
  console.log('   GET  /admin/escalation-requests');
  console.log('   GET  /admin/conversations/chart');
  console.log('   GET  /admin/language-split');
  console.log('   GET  /admin/frequently-asked-questions');
  console.log('   GET  /admin/unanswered-questions');
  console.log('');

  console.log('⚠️  Note: This will create new resources alongside existing ones.');
  console.log('   The existing API Gateway will remain unchanged.');
  console.log('   This creates a clean, CDK-managed version for future use.');
  console.log('');

  // The CDK CLI will handle the actual deployment
  // This script is for documentation and can be extended for automation
  
  console.log('🔧 To deploy this stack, run:');
  console.log('   npx cdk deploy AdaClaraFrontendAlignedApi');
  console.log('');
  
  console.log('📊 After deployment, you can:');
  console.log('   1. Test the new API endpoints');
  console.log('   2. Update frontend to use the new API URL');
  console.log('   3. Decommission the manually created resources');
  console.log('   4. Use CDK for all future deployments');
  console.log('');

  return stack;
}

if (require.main === module) {
  deployFrontendAlignedStack()
    .then(() => {
      console.log('✅ Frontend-Aligned API Stack configuration complete!');
      console.log('🚀 Run "npx cdk deploy AdaClaraFrontendAlignedApi" to deploy.');
    })
    .catch((error) => {
      console.error('❌ Error configuring stack:', error);
      process.exit(1);
    });
}