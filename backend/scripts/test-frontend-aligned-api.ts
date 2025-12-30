#!/usr/bin/env node

/**
 * Test Frontend-Aligned API
 * 
 * This script tests all endpoints to ensure they match frontend expectations
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
  expectedFormat?: string;
  actualFormat?: string;
}

class FrontendAlignedApiTester {
  private results: TestResult[] = [];

  async testEndpoint(
    endpoint: string, 
    method: 'GET' | 'POST' = 'GET', 
    data?: any, 
    headers?: any,
    expectedStatus?: number,
    expectedFormat?: string
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
        response: response.data,
        expectedFormat,
        actualFormat: this.analyzeResponseFormat(response.data)
      };

      if (expectedStatus && response.status !== expectedStatus) {
        result.status = 'FAIL';
        result.error = `Expected status ${expectedStatus}, got ${response.status}`;
      }

      // Validate response format if specified
      if (expectedFormat && !this.validateResponseFormat(response.data, expectedFormat)) {
        result.status = 'FAIL';
        result.error = `Response format doesn't match expected: ${expectedFormat}`;
      }

      const statusIcon = response.status < 400 ? '✅' : '⚠️';
      console.log(`  ${statusIcon} ${response.status} - ${this.summarizeResponse(response.data)}`);
      this.results.push(result);
      return result;

    } catch (error: any) {
      const result: TestResult = {
        endpoint,
        method,
        status: 'FAIL',
        error: error.message,
        expectedFormat
      };

      console.log(`  ❌ ${error.message}`);
      this.results.push(result);
      return result;
    }
  }

  private analyzeResponseFormat(data: any): string {
    if (!data || typeof data !== 'object') return 'primitive';
    
    const keys = Object.keys(data);
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
  }

  private validateResponseFormat(data: any, expectedFormat: string): boolean {
    if (!data || typeof data !== 'object') return false;
    
    switch (expectedFormat) {
      case 'chat_response':
        return 'response' in data && 'confidence' in data && 'sources' in data;
      case 'escalation_success':
        return 'success' in data && 'message' in data;
      case 'admin_metrics':
        return 'totalConversations' in data || 'metrics' in data;
      case 'escalation_requests':
        return 'requests' in data || Array.isArray(data);
      default:
        return true;
    }
  }

  private summarizeResponse(data: any): string {
    if (!data) return 'null';
    if (typeof data === 'string') return `"${data.substring(0, 50)}..."`;
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      return `{${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '...' : ''}}`;
    }
    return String(data);
  }

  async runAllTests() {
    console.log('🚀 Starting Frontend-Aligned API Test Suite...\n');

    // ===== SYSTEM HEALTH =====
    console.log('🔧 Testing System Health:');
    await this.testEndpoint('/health', 'GET', undefined, undefined, 200);

    // ===== PUBLIC CHAT ENDPOINTS (NO AUTH REQUIRED) =====
    console.log('\n💬 Testing Public Chat Endpoints (No Authentication Required):');
    
    // Test public chat with expected response format
    await this.testEndpoint('/chat', 'POST', {
      message: 'What is type 1 diabetes?',
      sessionId: 'test-session-' + Date.now()
    }, undefined, 200, 'chat_response');
    
    // Test public chat history
    await this.testEndpoint('/chat/history', 'GET', undefined, undefined, undefined);
    
    // Test public chat sessions
    await this.testEndpoint('/chat/sessions', 'GET', undefined, undefined, undefined);

    // ===== ESCALATION ENDPOINTS =====
    console.log('\n📞 Testing Escalation Endpoints:');
    
    // Test escalation request submission
    await this.testEndpoint('/escalation/request', 'POST', {
      name: 'Test User',
      email: 'test@example.com',
      phoneNumber: '(555) 123-4567',
      zipCode: '12345'
    }, undefined, 200, 'escalation_success');
    
    // Test escalation health
    await this.testEndpoint('/escalation', 'GET', undefined, undefined, 200);

    // ===== ADMIN AUTH ENDPOINTS =====
    console.log('\n🔐 Testing Admin Authentication Endpoints:');
    
    // Test admin auth health
    await this.testEndpoint('/auth/health', 'GET', undefined, undefined, 200);
    
    // Test admin auth without token (should fail)
    await this.testEndpoint('/auth', 'GET', undefined, undefined, 401);
    
    // Test admin auth with invalid token (should fail)
    await this.testEndpoint('/auth', 'POST', { token: 'invalid-token' }, undefined, 401);

    // ===== ADMIN DASHBOARD ENDPOINTS =====
    console.log('\n📊 Testing Admin Dashboard Endpoints (Expected to fail without auth):');
    
    // Test admin dashboard (should fail without auth)
    await this.testEndpoint('/admin/dashboard', 'GET', undefined, undefined, 401);
    
    // Test admin metrics (should fail without auth)
    await this.testEndpoint('/admin/metrics', 'GET', undefined, undefined, 401);
    
    // Test escalation requests for admin (should work without auth for now)
    await this.testEndpoint('/admin/escalation-requests', 'GET', undefined, undefined, 200, 'escalation_requests');

    // ===== RESULTS SUMMARY =====
    console.log('\n📊 Frontend-Aligned API Test Results:');
    console.log('====================================');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

    // Group results by category
    const publicTests = this.results.filter(r => 
      r.endpoint.includes('/chat') || r.endpoint.includes('/health') || r.endpoint.includes('/escalation')
    );
    const adminTests = this.results.filter(r => 
      r.endpoint.includes('/auth') || r.endpoint.includes('/admin')
    );

    console.log('\n📋 Results by Category:');
    console.log(`💬 Public Endpoints: ${publicTests.filter(r => r.status === 'PASS').length}/${publicTests.length} passed`);
    console.log(`🔐 Admin Endpoints: ${adminTests.filter(r => r.status === 'PASS').length}/${adminTests.length} passed`);

    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      const formatInfo = result.expectedFormat ? ` (${result.expectedFormat})` : '';
      console.log(`  ${status} ${result.method} ${result.endpoint}${formatInfo} - ${result.statusCode || 'ERROR'}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      if (result.expectedFormat && result.actualFormat) {
        console.log(`    Format: ${result.actualFormat}`);
      }
    });

    // ===== FRONTEND INTEGRATION CHECKLIST =====
    console.log('\n✅ Frontend Integration Checklist:');
    console.log('==================================');
    
    const chatResponseTest = this.results.find(r => r.endpoint === '/chat' && r.method === 'POST');
    const escalationTest = this.results.find(r => r.endpoint === '/escalation/request');
    const adminDataTest = this.results.find(r => r.endpoint === '/admin/escalation-requests');
    
    console.log(`📝 Chat Response Format: ${chatResponseTest?.status === 'PASS' ? '✅' : '❌'} ${chatResponseTest?.status === 'PASS' ? 'Matches frontend expectations' : 'Needs adjustment'}`);
    console.log(`📞 Escalation Form: ${escalationTest?.status === 'PASS' ? '✅' : '❌'} ${escalationTest?.status === 'PASS' ? 'Ready for "Talk to Person" form' : 'Needs implementation'}`);
    console.log(`📊 Admin Data: ${adminDataTest?.status === 'PASS' ? '✅' : '❌'} ${adminDataTest?.status === 'PASS' ? 'Dashboard data available' : 'Needs admin endpoints'}`);
    
    console.log('\n🎯 Next Steps for Frontend Team:');
    console.log('1. Replace mock data with API calls to working endpoints');
    console.log('2. Add environment configuration with API URL');
    console.log('3. Implement admin authentication for dashboard routes');
    console.log('4. Add error handling for API failures');
    console.log('5. Test end-to-end user flows');

    return {
      passed,
      failed,
      total,
      successRate: Math.round((passed / total) * 100),
      publicEndpointsWorking: publicTests.filter(r => r.status === 'PASS').length,
      adminEndpointsWorking: adminTests.filter(r => r.status === 'PASS').length
    };
  }
}

async function testFrontendAlignedApi() {
  const tester = new FrontendAlignedApiTester();
  const results = await tester.runAllTests();
  
  console.log('\n🎉 Frontend-Aligned API Testing Complete!');
  console.log(`📊 Results: ${results.passed}/${results.total} tests passed (${results.successRate}%)`);
  
  if (results.successRate >= 80) {
    console.log('✅ API is ready for frontend integration!');
    process.exit(0);
  } else {
    console.log(`⚠️  API needs improvements before frontend integration.`);
    process.exit(1);
  }
}

// Run tests
testFrontendAlignedApi().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});