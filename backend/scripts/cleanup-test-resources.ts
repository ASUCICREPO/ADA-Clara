#!/usr/bin/env node
/**
 * Cleanup script for S3 Vectors test resources
 * Use this to clean up resources if you don't want them in the final project
 */

import { execSync } from 'child_process';

console.log('🗑️  S3 Vectors Test Resources Cleanup');
console.log('=====================================');

const STACK_NAME = 'AdaClaraS3VectorsMinimalTest';

async function cleanup() {
  try {
    console.log('📋 Checking if stack exists...');
    
    // Check if stack exists
    try {
      execSync(`aws cloudformation describe-stacks --stack-name ${STACK_NAME}`, { stdio: 'pipe' });
      console.log('✅ Stack found, proceeding with cleanup...');
    } catch (error) {
      console.log('ℹ️  Stack not found - nothing to clean up');
      return;
    }

    console.log('🧹 Emptying S3 buckets before deletion...');
    
    // Get bucket names from stack outputs
    const stackOutputs = execSync(
      `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query "Stacks[0].Outputs" --output json`,
      { encoding: 'utf8' }
    );
    
    const outputs = JSON.parse(stackOutputs);
    const contentBucket = outputs.find((o: any) => o.OutputKey === 'ContentBucketName')?.OutputValue;
    const vectorsBucket = outputs.find((o: any) => o.OutputKey === 'VectorsBucketName')?.OutputValue;
    
    if (contentBucket) {
      console.log(`📦 Emptying content bucket: ${contentBucket}`);
      try {
        execSync(`aws s3 rm s3://${contentBucket} --recursive`, { stdio: 'inherit' });
      } catch (error) {
        console.log('⚠️  Content bucket already empty or doesn\'t exist');
      }
    }
    
    if (vectorsBucket) {
      console.log(`🔢 Clearing vectors from: ${vectorsBucket}`);
      // Note: S3 Vectors will be cleaned up automatically when the stack is destroyed
    }

    console.log('🚀 Destroying CDK stack...');
    execSync(
      `cdk destroy ${STACK_NAME} --app "npx ts-node scripts/deploy-s3-vectors-minimal-test.ts" --force`,
      { stdio: 'inherit' }
    );

    console.log('');
    console.log('✅ Cleanup completed successfully!');
    console.log('');
    console.log('📊 Resources removed:');
    console.log('  - S3 Content Bucket');
    console.log('  - S3 Vectors Bucket and Index');
    console.log('  - Lambda Function');
    console.log('  - IAM Roles and Policies');
    console.log('  - CloudWatch Log Groups');
    console.log('');
    console.log('💰 Cost impact: $0 (all resources destroyed)');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.log('');
    console.log('🔧 Manual cleanup options:');
    console.log('1. AWS Console: CloudFormation → Delete Stack');
    console.log('2. AWS CLI: aws cloudformation delete-stack --stack-name ' + STACK_NAME);
    console.log('3. CDK: cdk destroy ' + STACK_NAME);
    process.exit(1);
  }
}

// Confirmation prompt
console.log('⚠️  This will permanently delete all test resources:');
console.log(`   - Stack: ${STACK_NAME}`);
console.log('   - All S3 buckets and content');
console.log('   - Lambda functions');
console.log('   - S3 Vectors index and embeddings');
console.log('');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Are you sure you want to proceed? (yes/no): ', (answer: string) => {
  readline.close();
  
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    cleanup();
  } else {
    console.log('❌ Cleanup cancelled');
    process.exit(0);
  }
});