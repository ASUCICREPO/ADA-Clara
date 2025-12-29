#!/usr/bin/env ts-node

/**
 * Create DynamoDB Tables Script
 * 
 * This script creates all DynamoDB tables for the ADA Clara system.
 * It's a wrapper around the enhanced DynamoDB deployment.
 */

import { execSync } from 'child_process';

async function main() {
  console.log('🗄️ Creating ADA Clara DynamoDB Tables...\n');
  
  try {
    console.log('📋 Deploying Enhanced DynamoDB Stack...');
    
    // Deploy the DynamoDB stack using CDK
    execSync('cdk deploy AdaClaraEnhancedDynamoDB --app "npx ts-node scripts/deploy-enhanced-dynamodb.ts" --require-approval never', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('\n✅ DynamoDB tables created successfully!');
    console.log('\n📊 Tables created:');
    console.log('   • ada-clara-chat-sessions');
    console.log('   • ada-clara-content-tracking');
    console.log('   • ada-clara-professional-members');
    console.log('   • ada-clara-analytics');
    console.log('   • ada-clara-audit-logs');
    console.log('   • ada-clara-user-preferences');
    console.log('   • ada-clara-escalation-queue');
    console.log('   • ada-clara-knowledge-content');
    console.log('   • ada-clara-conversations');
    console.log('   • ada-clara-messages');
    console.log('   • ada-clara-questions');
    console.log('   • ada-clara-unanswered-questions');
    
    console.log('\n🔍 Verifying table creation...');
    
    // Verify tables exist
    try {
      execSync('aws dynamodb list-tables --query "TableNames[?contains(@, \'ada-clara\')]" --output table', {
        stdio: 'inherit'
      });
    } catch (error) {
      console.log('⚠️ Could not verify tables (AWS CLI might not be configured)');
    }
    
    console.log('\n🎉 DynamoDB setup complete!');
    
  } catch (error: any) {
    console.error('\n❌ DynamoDB table creation failed:', error.message);
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   • Ensure AWS credentials are configured');
    console.log('   • Check if CDK is bootstrapped: cdk bootstrap');
    console.log('   • Verify you have DynamoDB permissions');
    console.log('   • Check AWS region is set correctly');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}