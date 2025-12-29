#!/usr/bin/env ts-node

console.log('🔍 Testing cdk-s3-vectors import...');

try {
  const { Bucket, Index } = require('cdk-s3-vectors');
  console.log('✅ cdk-s3-vectors imported successfully');
  console.log('📦 Bucket:', typeof Bucket);
  console.log('📦 Index:', typeof Index);
} catch (error) {
  console.error('❌ Error importing cdk-s3-vectors:', error);
}

console.log('✅ Import test completed');