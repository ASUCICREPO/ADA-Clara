#!/usr/bin/env node

/**
 * Test Unified API Endpoints
 * 
 * This script tests all endpoints in the unified API to ensure they're working correctly.
 */

import axios from 'axios';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

class UnifiedApiTester {
  private apiUrl: string;
  private testResults: TestResult[] = [];

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Unified API Tests');
    console.log(`📍 API URL: ${this.apiUrl}`);
    console.log('');

    // Test health endpoint first
    await this.testHealthEndpoint();
    
    // Test auth endpoints (without authentication)
    await this.testAuthEndpoints();
    
    // Test chat endpoints (without authentication - will get 401)
    await this.testChatEndpoints();
    
    // Test admin endpoints (without authentication - will get 401)
    await this.testAdminEndpoints();
    
    // Test query endpoint
    await this.testQueryEndpoint();

    // Print results
    this.printResults();
  }

  private async testHealthEndpoint(): Promise<void> {
    console.log('🏥 Testing Health Endpoints...');
    
    await this.testEndpoint('GET', '/health', {
      expectedStatus: 200,
      description: 'System health check'
    });
  }

  private async testAuthEndpoints(): Promise<void> {
    console.log('🔐 Testing Auth Endpoints...');
    
    // These should return 401 without token
    await this.testEndpoint('GET', '/auth', {
      expectedStatus: 401,
      description: 'Get user context (no auth)'
    });
    
    await this.testEndpoint('GET', '/auth/user', {
      expectedStatus: 401,
      description: 'Get user context (no auth)'
    });
    
    await this.testEndpoint('POST', '/auth', {
      expectedStatus: 400,
      description: 'Validate token (no token provided)',
      body: {}
    });
    
    await this.testEndpoint('GET', '/auth/health', {
      expectedStatus: 200,
      description: 'Auth service health check'
    });
  }

  private async testChatEndpoints(): Promise<void> {
    console.log('💬 Testing Chat Endpoints...');
    
    // These should return 401 without authentication
    await this.testEndpoint('GET', '/chat/history', {
      expectedStatus: 401,
      description: 'Get user sessions (no auth)'
    });
    
    await this.testEndpoint('GET', '/chat/sessions', {
      expectedStatus: 401,
      description: 'Get user sessions alias (no auth)'
    });
    
    await this.testEndpoint('GET', '/chat/history/test-session', {
      expectedStatus: 401,
      description: 'Get session history (no auth)'
    });
    
    await this.testEndpoint('POST', '/chat', {
      expectedStatus: 400,
      description: 'Send chat message (no body)',
      body: null
    });
    
    await this.testEndpoint('GET', '/chat', {
      expectedStatus: 200,
      description: 'Chat service health check'
    });
  }

  private async testAdminEndpoints(): Promise<void> {
    console.log('👨‍💼 Testing Admin Endpoints...');
    
    // These should return 401 without authentication
    const adminEndpoints = [
      '/admin/dashboard',
      '/admin/conversations',
      '/admin/questions',
      '/admin/escalations',
      '/admin/realtime',
      '/admin/health'
    ];

    for (const endpoint of adminEndpoints) {
      await this.testEndpoint('GET', endpoint, {
        expectedStatus: [401, 403], // Could be 401 (no auth) or 403 (not admin)
        description: `Admin endpoint (no auth): ${endpoint}`
      });
    }
  }

  private async testQueryEndpoint(): Promise<void> {
    console.log('🤖 Testing Query/RAG Endpoints...');
    
    await this.testEndpoint('POST', '/query', {
      expectedStatus: 400,
      description: 'RAG query (no body)',
      body: null
    });
    
    await this.testEndpoint('GET', '/query', {
      expectedStatus: 200,
      description: 'RAG service health check'
    });
  }

  private async testEndpoint(
    method: string, 
    path: string, 
    options: {
      expectedStatus?: number | number[];
      description?: string;
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<void> {
    const startTime = Date.now();
    const url = `${this.apiUrl}${path}`;
    
    try {
      const config: any = {
        method,
        url,
        timeout: 10000,
        validateStatus: () => true, // Don't throw on any status code
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      if (options.body !== null && (method === 'POST' || method === 'PUT')) {
        config.data = options.body || {};
      }

      const response = await axios(config);
      const responseTime = Date.now() - startTime;
      
      const expectedStatuses = Array.isArray(options.expectedStatus) 
        ? options.expectedStatus 
        : options.expectedStatus ? [options.expectedStatus] : [200];
      
      const isExpectedStatus = expectedStatuses.includes(response.status);
      
      this.testResults.push({
        endpoint: `${method} ${path}`,
        method,
        status: isExpectedStatus ? 'PASS' : 'FAIL',
        statusCode: response.status,
        responseTime,
        error: isExpectedStatus ? undefined : `Expected ${expectedStatuses.join(' or ')}, got ${response.status}`
      });

      const statusIcon = isExpectedStatus ? '✅' : '❌';
      const description = options.description || path;
      console.log(`  ${statusIcon} ${method} ${path} - ${response.status} (${responseTime}ms) - ${description}`);
      
      if (!isExpectedStatus) {
        console.log(`     Expected: ${expectedStatuses.join(' or ')}, Got: ${response.status}`);
        if (response.data) {
          console.log(`     Response: ${JSON.stringify(response.data).substring(0, 200)}...`);
        }
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.testResults.push({
        endpoint: `${method} ${path}`,
        method,
        status: 'FAIL',
        responseTime,
        error: error.message
      });

      console.log(`  ❌ ${method} ${path} - ERROR (${responseTime}ms) - ${options.description || path}`);
      console.log(`     Error: ${error.message}`);
    }
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary');
    console.log('========================');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          console.log(`  - ${result.endpoint}: ${result.error}`);
        });
    }
    
    console.log('\n📈 Performance Summary:');
    const avgResponseTime = this.testResults
      .filter(r => r.responseTime)
      .reduce((sum, r) => sum + (r.responseTime || 0), 0) / this.testResults.length;
    
    console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    
    const slowTests = this.testResults
      .filter(r => (r.responseTime || 0) > 1000)
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0));
    
    if (slowTests.length > 0) {
      console.log('\n⚠️  Slow Endpoints (>1s):');
      slowTests.forEach(test => {
        console.log(`  - ${test.endpoint}: ${test.responseTime}ms`);
      });
    }
  }
}

async function main() {
  const apiUrl = process.argv[2];
  
  if (!apiUrl) {
    console.error('❌ Please provide the API URL as an argument');
    console.log('Usage: npm run test-unified-api <API_URL>');
    console.log('Example: npm run test-unified-api https://abc123.execute-api.us-east-1.amazonaws.com/prod');
    process.exit(1);
  }

  try {
    const tester = new UnifiedApiTester(apiUrl);
    await tester.runAllTests();
    
    console.log('\n🎉 Testing completed!');
    console.log('\n💡 Next steps:');
    console.log('1. Fix any failed tests');
    console.log('2. Test with valid JWT tokens for authenticated endpoints');
    console.log('3. Update frontend configuration with this API URL');
    
  } catch (error) {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});