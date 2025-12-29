#!/usr/bin/env ts-node

console.log('🔍 Testing console output...');
console.log('✅ Console.log is working!');

import * as cdk from 'aws-cdk-lib';

console.log('📦 CDK imported successfully');

const app = new cdk.App();

console.log('🚀 CDK App created successfully');

app.synth();

console.log('✅ CDK synthesis completed');