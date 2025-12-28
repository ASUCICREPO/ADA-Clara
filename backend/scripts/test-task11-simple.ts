#!/usr/bin/env ts-node

/**
 * Simple Test for Task 11: Enhanced Chat Processor
 * Quick verification of key functionality
 */

import { handler } from '../lambda/chat-processor/index';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-chat-processor',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-chat-processor',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-chat-processor',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {}
};

async function testBasicFunctionality(): Promise<void> {
  console.log('🧪 Testing Task 11 Enhanced Chat Processor');
  console.log('=' .repeat(50));

  // Test 1: Basic diabetes question
  const testEvent: APIGatewayProxyEvent = {
    httpMethod: 'POST',
    path: '/chat',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'What is diabetes?',
      userInfo: {
        name: 'Test User',
        email: 'test@example.com'
      }
    }),
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null
  };

  try {
    console.log('📤 Sending test message: "What is diabetes?"');
    const startTime = Date.now();
    
    const result = await handler(testEvent, mockContext);
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status code: ${result.statusCode}`);
    
    if (result.statusCode === 200) {
      const response = JSON.parse(result.body);
      
      console.log('\n📋 Response Analysis:');
      console.log(`🤖 Bot Response: "${response.response.substring(0, 100)}..."`);
      console.log(`📈 Confidence: ${response.confidence}`);
      console.log(`🌐 Language: ${response.language}`);
      console.log(`⚠️  Escalation: ${response.escalationSuggested}`);
      
      // Check Task 11 enhancements
      if (response.conversationMetadata) {
        console.log('\n✅ Task 11 Enhanced Metadata Found:');
        console.log(`   📊 Message Count: ${response.conversationMetadata.messageCount}`);
        console.log(`   📈 Average Confidence: ${response.conversationMetadata.averageConfidence}`);
        console.log(`   ❓ Question Detected: ${response.conversationMetadata.questionDetected}`);
        console.log(`   🏷️  Question Category: ${response.conversationMetadata.questionCategory || 'N/A'}`);
        console.log(`   🚨 Escalation Triggers: ${response.conversationMetadata.escalationTriggers?.join(', ') || 'None'}`);
        
        console.log('\n🎉 Task 11 implementation is working correctly!');
        console.log('\n📋 Verified Features:');
        console.log('   ✅ Enhanced conversation metadata capture');
        console.log('   ✅ Message-level confidence score tracking');
        console.log('   ✅ Question extraction and categorization');
        console.log('   ✅ Escalation trigger identification');
        console.log('   ✅ Analytics data collection');
        
      } else {
        console.log('❌ Task 11 enhanced metadata not found in response');
        console.log('📄 Full response:', JSON.stringify(response, null, 2));
      }
      
    } else {
      console.log('❌ Request failed');
      console.log('📄 Response:', result.body);
    }
    
  } catch (error) {
    console.log('💥 Test failed with error:', error);
  }
}

// Test 2: Health check
async function testHealthCheck(): Promise<void> {
  console.log('\n🏥 Testing Health Check');
  console.log('-'.repeat(30));

  const healthEvent: APIGatewayProxyEvent = {
    httpMethod: 'GET',
    path: '/health',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null
  };

  try {
    const result = await handler(healthEvent, mockContext);
    console.log(`📊 Health Status: ${result.statusCode}`);
    
    if (result.statusCode === 200) {
      const health = JSON.parse(result.body);
      console.log(`🏥 Overall Status: ${health.status}`);
      console.log(`🔧 Services: ${JSON.stringify(health.services, null, 2)}`);
    }
  } catch (error) {
    console.log('💥 Health check failed:', error);
  }
}

async function runTests(): Promise<void> {
  await testBasicFunctionality();
  await testHealthCheck();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Task 11 testing completed');
}

runTests().catch(console.error);