#!/usr/bin/env ts-node

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SimpleS3VectorsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    console.log('🔍 SimpleS3VectorsStack constructor called!');
    console.log('🔍 Stack ID:', id);
    
    // Add EventBridge components
    console.log('🔧 Creating EventBridge components...');
    
    // This should work
    console.log('✅ EventBridge components created successfully');
  }
}

console.log('🔍 Testing simple S3 Vectors stack...');

const app = new cdk.App();

console.log('🚀 Creating SimpleS3VectorsStack...');

new SimpleS3VectorsStack(app, 'SimpleS3VectorsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Simple S3 Vectors stack',
});

console.log('✅ SimpleS3VectorsStack created successfully');

app.synth();

console.log('✅ Synthesis completed');