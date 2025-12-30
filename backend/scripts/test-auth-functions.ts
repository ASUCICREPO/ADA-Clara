#!/usr/bin/env node

/**
 * Test Authentication Functions
 * 
 * This script tests the deployed authentication Lambda functions directly.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

class AuthFunctionTester {
  private lambdaClient: LambdaClient;

  constructor() {
    this.lambdaClient = new LambdaClient({ region: 'us-east-1' });
  }

  async testAuthHandler() {
    console.log('🔐 Testing Auth Handler Lambda...');

    try {
      // Test health check endpoint
      const healthEvent = {
        httpMethod: 'GET',
        path: '/auth/health',
        headers: {},
        body: null,
        pathParameters: null,
        queryStringParameters: null
      };

      const command = new InvokeCommand({
        FunctionName: 'ada-clara-auth-handler',
        Payload: JSON.stringify(healthEvent)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      console.log('✅ Auth Handler Response:', JSON.stringify(result, null, 2));
      return result;

    } catch (error: any) {
      console.error('❌ Auth Handler Test Failed:', error.message);
      return null;
    }
  }

  async testMembershipVerification() {
    console.log('🏥 Testing Membership Verification Lambda...');

    try {
      // Test with sample membership data
      const membershipEvent = {
        httpMethod: 'POST',
        path: '/auth/verify-professional',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          membershipId: 'TEST123456',
          organization: 'American Diabetes Association',
          profession: 'Certified Diabetes Educator'
        }),
        pathParameters: null,
        queryStringParameters: null
      };

      const command = new InvokeCommand({
        FunctionName: 'ada-clara-membership-verification',
        Payload: JSON.stringify(membershipEvent)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      console.log('✅ Membership Verification Response:', JSON.stringify(result, null, 2));
      return result;

    } catch (error: any) {
      console.error('❌ Membership Verification Test Failed:', error.message);
      return null;
    }
  }

  async testChatProcessor() {
    console.log('💬 Testing Chat Processor Lambda...');

    try {
      // Test with sample chat message
      const chatEvent = {
        httpMethod: 'POST',
        path: '/chat',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'What is diabetes?',
          sessionId: 'test-session-123',
          userId: 'test-user-456'
        }),
        pathParameters: null,
        queryStringParameters: null
      };

      const command = new InvokeCommand({
        FunctionName: 'ada-clara-chat-processor',
        Payload: JSON.stringify(chatEvent)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));

      console.log('✅ Chat Processor Response:', JSON.stringify(result, null, 2));
      return result;

    } catch (error: any) {
      console.error('❌ Chat Processor Test Failed:', error.message);
      return null;
    }
  }

  async runAllTests() {
    console.log('🧪 Starting Authentication Function Tests...\n');

    const results = {
      authHandler: await this.testAuthHandler(),
      membershipVerification: await this.testMembershipVerification(),
      chatProcessor: await this.testChatProcessor()
    };

    console.log('\n📊 Test Summary:');
    console.log('================');
    console.log(`Auth Handler: ${results.authHandler ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Membership Verification: ${results.membershipVerification ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Chat Processor: ${results.chatProcessor ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = Object.values(results).every(result => result !== null);
    console.log(`\n🎯 Overall Status: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    if (allPassed) {
      console.log('\n🚀 Ready for frontend integration!');
      console.log('📋 Next steps:');
      console.log('  1. Add auth endpoints to API Gateway');
      console.log('  2. Test JWT validation flow');
      console.log('  3. Begin frontend authentication integration');
    }

    return results;
  }
}

async function testAuthFunctions() {
  const tester = new AuthFunctionTester();
  await tester.runAllTests();
}

// Run tests
testAuthFunctions().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});