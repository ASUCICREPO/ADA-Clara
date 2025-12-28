#!/usr/bin/env ts-node

/**
 * Test Script for Task 10: Enhanced Lambda Function
 * Tests caching, validation, error handling, and performance improvements
 */

import { AdminAnalyticsProcessor } from '../lambda/admin-analytics/index';
import { cacheService } from '../src/services/cache-service';
import { validationService } from '../src/services/validation-service';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  details: string;
  error?: string;
}

class Task10TestSuite {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Task 10 Enhancement Tests');
    console.log('=====================================\n');

    // Test caching functionality
    await this.testCacheService();
    await this.testCachePerformance();
    
    // Test validation service
    await this.testParameterValidation();
    await this.testValidationErrorHandling();
    
    // Test enhanced Lambda function
    await this.testEnhancedDashboardMetrics();
    await this.testEnhancedErrorHandling();
    await this.testPerformanceMonitoring();
    
    // Test circuit breaker (simulated)
    await this.testCircuitBreakerPattern();

    // Print summary
    this.printTestSummary();
  }

  private async testCacheService(): Promise<void> {
    const testName = 'Cache Service Basic Operations';
    const startTime = Date.now();

    try {
      // Test cache set and get
      const testData = { message: 'Hello Cache', timestamp: Date.now() };
      await cacheService.set('test-key', testData);
      
      const cachedData = await cacheService.get('test-key', async () => {
        throw new Error('Should not fetch - data should be cached');
      });

      if (JSON.stringify(cachedData) !== JSON.stringify(testData)) {
        throw new Error('Cached data does not match original data');
      }

      // Test cache invalidation
      const invalidated = cacheService.invalidate('test-key');
      if (!invalidated) {
        throw new Error('Cache invalidation failed');
      }

      // Test cache miss
      const fetchedData = await cacheService.get('test-key', async () => {
        return { message: 'Fetched Fresh', timestamp: Date.now() };
      });

      if (fetchedData.message !== 'Fetched Fresh') {
        throw new Error('Cache miss did not fetch fresh data');
      }

      this.addResult(testName, true, Date.now() - startTime, 'Cache operations working correctly');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Cache test failed', (error as Error).message);
    }
  }

  private async testCachePerformance(): Promise<void> {
    const testName = 'Cache Performance Test';
    const startTime = Date.now();

    try {
      const testKey = 'performance-test';
      const testData = { 
        largeArray: Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `Item ${i}` }))
      };

      // First call - cache miss
      const firstCallStart = Date.now();
      await cacheService.get(testKey, async () => {
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 100));
        return testData;
      });
      const firstCallDuration = Date.now() - firstCallStart;

      // Second call - cache hit
      const secondCallStart = Date.now();
      await cacheService.get(testKey, async () => {
        throw new Error('Should not be called - data should be cached');
      });
      const secondCallDuration = Date.now() - secondCallStart;

      // Cache hit should be significantly faster
      if (secondCallDuration >= firstCallDuration) {
        throw new Error(`Cache hit (${secondCallDuration}ms) not faster than cache miss (${firstCallDuration}ms)`);
      }

      const stats = cacheService.getStats();
      if (stats.hits === 0) {
        throw new Error('Cache statistics not tracking hits correctly');
      }

      this.addResult(testName, true, Date.now() - startTime, 
        `Cache miss: ${firstCallDuration}ms, Cache hit: ${secondCallDuration}ms, Hit rate: ${stats.hitRate}%`);
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Cache performance test failed', (error as Error).message);
    }
  }

  private async testParameterValidation(): Promise<void> {
    const testName = 'Parameter Validation';
    const startTime = Date.now();

    try {
      // Test valid dashboard parameters
      const validParams = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        type: 'chat',
        granularity: 'daily'
      };

      const validResult = validationService.validateDashboardParams(validParams);
      if (!validResult.isValid) {
        throw new Error(`Valid parameters rejected: ${validResult.errors.join(', ')}`);
      }

      // Test invalid parameters
      const invalidParams = {
        startDate: 'invalid-date',
        endDate: '2024-01-01', // Before start date
        type: 'invalid-type',
        limit: -5
      };

      const invalidResult = validationService.validateDashboardParams(invalidParams);
      if (invalidResult.isValid) {
        throw new Error('Invalid parameters were accepted');
      }

      // Test conversation ID validation
      const validIdResult = validationService.validateConversationId('valid-conversation-id-123');
      if (!validIdResult.isValid) {
        throw new Error('Valid conversation ID was rejected');
      }

      const invalidIdResult = validationService.validateConversationId('');
      if (invalidIdResult.isValid) {
        throw new Error('Empty conversation ID was accepted');
      }

      this.addResult(testName, true, Date.now() - startTime, 'Parameter validation working correctly');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Parameter validation test failed', (error as Error).message);
    }
  }

  private async testValidationErrorHandling(): Promise<void> {
    const testName = 'Validation Error Handling';
    const startTime = Date.now();

    try {
      // Test date range validation
      const dateRangeResult = validationService.validateDateRange('2024-12-31', '2024-01-01');
      if (dateRangeResult.isValid) {
        throw new Error('Invalid date range (end before start) was accepted');
      }

      // Test search parameter validation
      const searchResult = validationService.validateSearchParams({
        query: '', // Empty query should fail
        maxResults: 10000 // Too high should be sanitized
      });

      if (searchResult.isValid) {
        throw new Error('Empty search query was accepted');
      }

      // Test export parameter validation
      const exportResult = validationService.validateExportParams({
        format: 'invalid-format',
        maxRecords: -1
      });

      if (exportResult.isValid) {
        throw new Error('Invalid export parameters were accepted');
      }

      this.addResult(testName, true, Date.now() - startTime, 'Validation error handling working correctly');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Validation error handling test failed', (error as Error).message);
    }
  }

  private async testEnhancedDashboardMetrics(): Promise<void> {
    const testName = 'Enhanced Dashboard Metrics with Caching';
    const startTime = Date.now();

    try {
      const processor = new AdminAnalyticsProcessor();

      // Test with valid parameters
      const validQuery = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        type: 'chat' as const,
        granularity: 'daily' as const
      };

      const metrics = await processor.getEnhancedDashboardMetrics(validQuery);
      
      if (!metrics) {
        throw new Error('No metrics returned');
      }

      // Test with invalid parameters (should throw validation error)
      const invalidQuery = {
        startDate: 'invalid-date',
        endDate: '2024-01-31'
      };

      try {
        await processor.getEnhancedDashboardMetrics(invalidQuery);
        throw new Error('Invalid parameters should have thrown validation error');
      } catch (validationError) {
        if (!(validationError as Error).message.includes('Validation failed')) {
          throw validationError;
        }
        // Expected validation error
      }

      this.addResult(testName, true, Date.now() - startTime, 'Enhanced dashboard metrics with validation working correctly');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Enhanced dashboard metrics test failed', (error as Error).message);
    }
  }

  private async testEnhancedErrorHandling(): Promise<void> {
    const testName = 'Enhanced Error Handling';
    const startTime = Date.now();

    try {
      const processor = new AdminAnalyticsProcessor();

      // Test conversation details with invalid ID
      try {
        await processor.getConversationDetails('');
        throw new Error('Empty conversation ID should have thrown validation error');
      } catch (validationError) {
        if (!(validationError as Error).message.includes('Validation failed')) {
          throw validationError;
        }
        // Expected validation error
      }

      // Test conversation details with invalid characters
      try {
        await processor.getConversationDetails('invalid@#$%^&*()');
        throw new Error('Invalid conversation ID should have thrown validation error');
      } catch (validationError) {
        if (!(validationError as Error).message.includes('Validation failed')) {
          throw validationError;
        }
        // Expected validation error
      }

      this.addResult(testName, true, Date.now() - startTime, 'Enhanced error handling working correctly');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Enhanced error handling test failed', (error as Error).message);
    }
  }

  private async testPerformanceMonitoring(): Promise<void> {
    const testName = 'Performance Monitoring';
    const startTime = Date.now();

    try {
      // Test cache statistics
      const initialStats = cacheService.getStats();
      
      if (typeof initialStats.hits !== 'number' || 
          typeof initialStats.misses !== 'number' ||
          typeof initialStats.hitRate !== 'number') {
        throw new Error('Cache statistics not properly formatted');
      }

      // Test memory usage estimation
      if (typeof initialStats.memoryUsage !== 'number' || initialStats.memoryUsage < 0) {
        throw new Error('Memory usage estimation not working');
      }

      // Test cache keys retrieval
      const keys = cacheService.getKeys();
      if (!Array.isArray(keys)) {
        throw new Error('Cache keys not returned as array');
      }

      this.addResult(testName, true, Date.now() - startTime, 
        `Performance monitoring working. Cache entries: ${initialStats.totalEntries}, Memory: ${initialStats.memoryUsage} bytes`);
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Performance monitoring test failed', (error as Error).message);
    }
  }

  private async testCircuitBreakerPattern(): Promise<void> {
    const testName = 'Circuit Breaker Pattern (Simulated)';
    const startTime = Date.now();

    try {
      // This is a simulated test since we can't easily trigger real circuit breaker failures
      // In a real scenario, we would test with actual service failures
      
      // Test that circuit breaker states can be tracked
      const processor = new AdminAnalyticsProcessor();
      
      // The circuit breaker is internal to the processor, so we test indirectly
      // by ensuring that normal operations work (circuit is closed)
      const metrics = await processor.getEnhancedRealTimeMetrics();
      
      if (!metrics) {
        throw new Error('Real-time metrics should work when circuit is closed');
      }

      this.addResult(testName, true, Date.now() - startTime, 
        'Circuit breaker pattern implemented (tested indirectly through normal operations)');
    } catch (error) {
      this.addResult(testName, false, Date.now() - startTime, 'Circuit breaker pattern test failed', (error as Error).message);
    }
  }

  private addResult(testName: string, passed: boolean, duration: number, details: string, error?: string): void {
    this.results.push({
      testName,
      passed,
      duration,
      details,
      error
    });

    const status = passed ? '✅ PASS' : '❌ FAIL';
    const errorMsg = error ? ` - ${error}` : '';
    console.log(`${status} ${testName} (${duration}ms): ${details}${errorMsg}\n`);
  }

  private printTestSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n📊 Task 10 Enhancement Test Summary');
    console.log('===================================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Average Duration: ${Math.round(totalDuration / totalTests)}ms`);

    // Cache statistics
    const cacheStats = cacheService.getStats();
    console.log('\n📈 Cache Performance');
    console.log('===================');
    console.log(`Cache Hits: ${cacheStats.hits}`);
    console.log(`Cache Misses: ${cacheStats.misses}`);
    console.log(`Hit Rate: ${cacheStats.hitRate}%`);
    console.log(`Total Entries: ${cacheStats.totalEntries}`);
    console.log(`Memory Usage: ${cacheStats.memoryUsage} bytes`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.testName}: ${result.error || result.details}`);
      });
    }

    console.log('\n🎉 Task 10 Enhancement Testing Complete!');
    
    if (passedTests === totalTests) {
      console.log('🚀 All enhancements working correctly - ready for production!');
    } else {
      console.log('⚠️  Some tests failed - please review and fix issues before deployment.');
    }
  }
}

// Run the tests
async function main() {
  const testSuite = new Task10TestSuite();
  await testSuite.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { Task10TestSuite };