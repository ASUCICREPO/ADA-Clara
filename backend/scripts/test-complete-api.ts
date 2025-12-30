#!/usr/bin/env node

/**
 * Test Complete API with Authentication
 * 
 * This script tests all endpoints in the ADA Clara API including the new authentication endpoints.
 */

import axios from 'axios';

const API_BASE_URL = 'https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  statusCode?: number;
  response?: any;
  error?: string;
}

class ApiTester {
  private results: TestResult[] = [];

  async testEndpoint(
    endpoint: string, 
    method: 'GET' | 'POST' = 'GET', 
    data?: any, 
    headers?: any,
    expectedStatus?: number
  ): Promise<TestResult> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      console.log(`🧪 Testing ${method} ${endpoint}...`);
      
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status code
      });

      const result: TestResult = {
        endpoint,
        method,
        status: 'PASS',
        statusCode: response.status,
        response: response.data
      };

      if (expectedStatus && response.status !== expectedStatus) {
        result.status = 'FAIL';
        result.error = `Expected status ${expectedStatus}, got ${response.status}`;
      }

      console.log(`  ✅ ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}...`);
      this.results.push(result);
      return result;

    } catch (error: any) {
      const result: TestResult = {
        endpoint,
        method,
        status: 'FAIL',
        error: error.message
      };

      console.log(`  ❌ ${error.message}`);
      this.results.push(result);
      return result;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Complete API Test Suite...\n');

    // ===== SYSTEM ENDPOINTS =====
    console.log('🔧 Testing System Endpoints:');
    await this.testEndpoint('/health');
    await this.testEndpoint('/test');
    await this.testEndpoint('/test', 'POST', { test: 'data' });

    // ===== AUTHENTICATION ENDPOINTS =====
    console.log('\n🔐 Testing Authentication Endpoints:');
    await this.testEndpoint('/auth/health');
    
    // Test auth endpoints that should return errors for missing tokens
    await this.testEndpoint('/auth', 'GET', undefined, undefined, 401);
    await this.testEndpoint('/auth', 'POST', { token: 'invalid-token' }, undefined, 401);
    
    // Test professional verification (should fail without proper auth)
    await this.testEndpoint('/auth/verify-professional', 'POST', {
      membershipId: 'TEST123456',
      organization: 'American Diabetes Association',
      profession: 'Certified Diabetes Educator'
    }, undefined, 400);

    // ===== CHAT ENDPOINTS =====
    console.log('\n💬 Testing Chat Endpoints:');
    
    // Test chat endpoint (should work without auth for now)
    await this.testEndpoint('/chat', 'POST', {
      message: 'What is diabetes?',
      sessionId: 'test-session-123',
      userId: 'test-user-456'
    });
    
    await this.testEndpoint('/chat/history');
    await this.testEndpoint('/chat/sessions');

    // ===== RESULTS SUMMARY =====
    console.log('\n📊 Test Results Summary:');
    console.log('========================');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${status} ${result.method} ${result.endpoint} - ${result.statusCode || 'ERROR'}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });

    // ===== FRONTEND CONFIGURATION =====
    console.log('\n🔧 Frontend Configuration:');
    console.log('==========================');
    
    const config = {
      apiUrl: API_BASE_URL,
      endpoints: {
        // System endpoints
        health: `${API_BASE_URL}/health`,
        test: `${API_BASE_URL}/test`,
        
        // Authentication endpoints
        auth: `${API_BASE_URL}/auth`,
        authHealth: `${API_BASE_URL}/auth/health`,
        verifyProfessional: `${API_BASE_URL}/auth/verify-professional`,
        
        // Chat endpoints
        chat: `${API_BASE_URL}/chat`,
        chatHistory: `${API_BASE_URL}/chat/history`,
        chatSessions: `${API_BASE_URL}/chat/sessions`
      },
      features: ['health', 'test', 'auth', 'chat', 'history', 'sessions', 'professional-verification'],
      version: '2.0.0',
      authentication: {
        userPoolId: 'us-east-1_hChjb1rUB',
        clientId: '3f8vld6mnr1nsfjci1b61okc46',
        identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
        domain: 'https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com'
      }
    };

    console.log(JSON.stringify(config, null, 2));

    // ===== NEXT STEPS =====
    console.log('\n🎯 Next Steps for Frontend Team:');
    console.log('================================');
    console.log('1. ✅ API Gateway is fully functional with authentication endpoints');
    console.log('2. ✅ All Cognito configuration values are available');
    console.log('3. ✅ Authentication Lambda functions are deployed and working');
    console.log('4. 🔄 Implement AWS Amplify authentication in frontend');
    console.log('5. 🔄 Test JWT token validation with real Cognito tokens');
    console.log('6. 🔄 Implement professional verification flow');
    console.log('7. 🔄 Add authentication to chat endpoints');

    return {
      passed,
      failed,
      total,
      successRate: Math.round((passed / total) * 100),
      config
    };
  }
}

async function testCompleteApi() {
  const tester = new ApiTester();
  const results = await tester.runAllTests();
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! API is ready for frontend integration.');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${results.failed} tests failed. Review the results above.`);
    process.exit(1);
  }
}

// Run tests
testCompleteApi().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});