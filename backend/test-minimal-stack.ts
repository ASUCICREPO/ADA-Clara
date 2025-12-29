#!/usr/bin/env ts-node

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

class TestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    console.log('🔍 TestStack constructor called!');
    console.log('🔍 Stack ID:', id);
    console.log('🔍 Props:', JSON.stringify(props, null, 2));
  }
}

console.log('🔍 Testing minimal stack...');

const app = new cdk.App();

console.log('🚀 Creating TestStack...');

new TestStack(app, 'TestMinimalStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Test minimal stack',
});

console.log('✅ TestStack created successfully');

app.synth();

console.log('✅ Synthesis completed');