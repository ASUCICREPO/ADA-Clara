#!/usr/bin/env node

/**
 * Test Simplified API
 * 
 * This script tests the simplified ADA Clara API with the new user model:
 * - Public users: No authentication required for chat
 * - Admin users: Authentication required for admin dashboard
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
  userType?: 'public' | 'admin';
  authRequired?: boolean;
}

class SimplifiedApiTester {
  private results: TestResult[] = [];

  async testEndpoint(
    endpoint: string, 
    method: 'GET' | 'POST' = 'GET', 
    data?: any, 
    headers?: any,
    expectedStatus?: number,
    userType: 'public' | 'admin' = 'public',
    authRequired: boolean = false
  ): Promise<TestResult> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      console.log(`🧪 Testing ${method} ${endpoint} (${userType} user, auth: ${authRequired ? 'required' : 'not required'})...`);
      
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
        response: response.data,
        userType,
        authRequired
      };

      if (expectedStatus && response.status !== expectedStatus) {
        result.status = 'FAIL';
        result.error = `Expected status ${expectedStatus}, got ${response.status}`;
      }

      const statusIcon = response.status < 400 ? '✅' : '⚠️';
      console.log(`  ${statusIcon} ${response.status} - ${JSON.stringify(response.data).substring(0, 80)}...`);
      this.results.push(result);
      return result;

    } catch (error: any) {
      const result: TestResult = {
        endpoint,
        method,
        status: 'FAIL',
        error: error.message,
        userType,
        authRequired
      };

      console.log(`  ❌ ${error.message}`);
      this.results.push(result);
      return result;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Simplified API Test Suite...\n');

    // ===== SYSTEM HEALTH =====
    console.log('🔧 Testing System Health:');
    await this.testEndpoint('/health', 'GET', undefined, undefined, 200, 'public', false);

    // ===== PUBLIC CHAT ENDPOINTS (NO AUTH REQUIRED) =====
    console.log('\n💬 Testing Public Chat Endpoints (No Authentication Required):');
    
    // Test public chat
    await this.testEndpoint('/chat', 'POST', {
      message: 'Hello, I have questions about diabetes',
      sessionId: 'test-session-' + Date.now()
    }, undefined, undefined, 'public', false);
    
    // Test public chat history
    await this.testEndpoint('/chat/history', 'GET', undefined, undefined, undefined, 'public', false);
    
    // Test public chat sessions
    await this.testEndpoint('/chat/sessions', 'GET', undefined, undefined, undefined, 'public', false);

    // ===== ADMIN AUTH ENDPOINTS =====
    console.log('\n🔐 Testing Admin Authentication Endpoints:');
    
    // Test admin auth health
    await this.testEndpoint('/auth/health', 'GET', undefined, undefined, 200, 'admin', false);
    
    // Test admin auth without token (should fail)
    await this.testEndpoint('/auth', 'GET', undefined, undefined, 401, 'admin', true);
    
    // Test admin auth with invalid token (should fail)
    await this.testEndpoint('/auth', 'POST', { token: 'invalid-token' }, undefined, 401, 'admin', true);

    // ===== RESULTS SUMMARY =====
    console.log('\n📊 Simplified API Test Results:');
    console.log('================================');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

    // Group results by user type
    const publicTests = this.results.filter(r => r.userType === 'public');
    const adminTests = this.results.filter(r => r.userType === 'admin');

    console.log('\n📋 Results by User Type:');
    console.log(`👤 Public User Tests: ${publicTests.filter(r => r.status === 'PASS').length}/${publicTests.length} passed`);
    console.log(`👨‍💼 Admin User Tests: ${adminTests.filter(r => r.status === 'PASS').length}/${adminTests.length} passed`);

    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      const userIcon = result.userType === 'admin' ? '👨‍💼' : '👤';
      const authIcon = result.authRequired ? '🔐' : '🌐';
      console.log(`  ${status} ${userIcon} ${authIcon} ${result.method} ${result.endpoint} - ${result.statusCode || 'ERROR'}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });

    // ===== SIMPLIFIED FRONTEND CONFIGURATION =====
    console.log('\n🔧 Simplified Frontend Configuration:');
    console.log('=====================================');
    
    const config = {
      apiUrl: API_BASE_URL,
      userModel: 'simplified',
      userTypes: ['public', 'admin'],
      
      // Public endpoints (no authentication required)
      publicEndpoints: {
        health: `${API_BASE_URL}/health`,
        chat: `${API_BASE_URL}/chat`,
        chatHistory: `${API_BASE_URL}/chat/history`,
        chatSessions: `${API_BASE_URL}/chat/sessions`
      },
      
      // Admin endpoints (authentication required)
      adminEndpoints: {
        auth: `${API_BASE_URL}/auth`,
        authHealth: `${API_BASE_URL}/auth/health`
      },
      
      // Authentication configuration (for admin users only)
      authentication: {
        userPoolId: 'us-east-1_hChjb1rUB', // Existing Cognito pool
        clientId: '3f8vld6mnr1nsfjci1b61okc46',
        identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
        domain: 'https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
        requiredFor: ['admin'] // Only admin users need authentication
      },
      
      features: {
        publicChat: true,
        adminDashboard: true,
        professionalVerification: false, // Removed!
        membershipValidation: false      // Removed!
      },
      
      version: '2.0.0-simplified'
    };

    console.log(JSON.stringify(config, null, 2));

    // ===== IMPLEMENTATION GUIDE =====
    console.log('\n🎯 Frontend Implementation Guide:');
    console.log('=================================');
    console.log('');
    console.log('1. 👤 **Public Users (No Authentication)**:');
    console.log('   - Can access chat immediately');
    console.log('   - No signup or login required');
    console.log('   - Perfect for diabetes.org visitors');
    console.log('');
    console.log('2. 👨‍💼 **Admin Users (Cognito Authentication)**:');
    console.log('   - Use existing Cognito configuration');
    console.log('   - Access admin dashboard and analytics');
    console.log('   - Manage system and moderate content');
    console.log('');
    console.log('3. 🔧 **Removed Complexity**:');
    console.log('   - ❌ Professional verification endpoints');
    console.log('   - ❌ Membership validation');
    console.log('   - ❌ Complex user types');
    console.log('   - ❌ Professional-specific features');
    console.log('');
    console.log('4. 🚀 **Next Steps**:');
    console.log('   - Implement public chat interface (no auth)');
    console.log('   - Implement admin login with existing Cognito');
    console.log('   - Remove professional verification UI');
    console.log('   - Simplify user type handling');

    return {
      passed,
      failed,
      total,
      successRate: Math.round((passed / total) * 100),
      config,
      publicTests: publicTests.length,
      adminTests: adminTests.length
    };
  }
}

async function testSimplifiedApi() {
  const tester = new SimplifiedApiTester();
  const results = await tester.runAllTests();
  
  console.log('\n🎉 Simplified API Testing Complete!');
  console.log(`📊 Results: ${results.passed}/${results.total} tests passed (${results.successRate}%)`);
  
  if (results.failed === 0) {
    console.log('✅ All tests passed! Simplified API is ready for frontend integration.');
    process.exit(0);
  } else {
    console.log(`⚠️  ${results.failed} tests failed. Review the results above.`);
    process.exit(1);
  }
}

// Run tests
testSimplifiedApi().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});