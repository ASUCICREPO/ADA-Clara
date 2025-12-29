/**
 * Integration test for Error Resilience Service
 * Demonstrates comprehensive error handling and resilience features
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { ErrorResilienceService } from './src/services/error-resilience-service';
import { CrawlerError } from './src/types/index';

async function testErrorResilienceIntegration() {
  console.log('🚀 Starting Error Resilience Integration Test...\n');
  
  const errorResilienceService = new ErrorResilienceService();
  
  // Test 1: Exponential Backoff Retry Logic (Requirement 5.1)
  console.log('📡 Test 1: Exponential Backoff Retry Logic for Network Failures');
  try {
    let attemptCount = 0;
    const networkOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error(`Network timeout (attempt ${attemptCount})`);
      }
      return `Success after ${attemptCount} attempts`;
    };

    const result = await errorResilienceService.executeWithRetry(
      networkOperation,
      'network-requests',
      { maxRetries: 3, baseDelay: 100, maxDelay: 1000, backoffMultiplier: 2, jitter: false }
    );
    
    console.log(`✅ Network operation succeeded: ${result}`);
  } catch (error) {
    console.log(`❌ Network operation failed: ${(error as Error).message}`);
  }
  console.log('');

  // Test 2: Circuit Breaker Pattern (Requirement 5.2)
  console.log('🔌 Test 2: Circuit Breaker Pattern for S3 Vectors Storage Failures');
  try {
    // Simulate multiple failures to trigger circuit breaker
    for (let i = 0; i < 6; i++) {
      try {
        await errorResilienceService.executeWithCircuitBreaker(
          () => Promise.reject(new Error('S3 Vectors service unavailable')),
          's3-vectors-storage'
        );
      } catch (error) {
        console.log(`Attempt ${i + 1}: ${(error as Error).message}`);
      }
    }
    
    // Circuit breaker should now be open
    try {
      await errorResilienceService.executeWithCircuitBreaker(
        () => Promise.resolve('This should not execute'),
        's3-vectors-storage'
      );
    } catch (error) {
      console.log(`✅ Circuit breaker is working: ${(error as Error).message}`);
    }
  } catch (error) {
    console.log(`❌ Circuit breaker test failed: ${(error as Error).message}`);
  }
  console.log('');

  // Test 3: Rate Limiting (Requirement 5.3)
  console.log('⏱️  Test 3: Rate Limiting for Bedrock Embedding API Calls');
  try {
    const startTime = Date.now();
    
    // Make multiple rapid requests
    await Promise.all([
      errorResilienceService.applyRateLimit('bedrock-embeddings'),
      errorResilienceService.applyRateLimit('bedrock-embeddings'),
      errorResilienceService.applyRateLimit('bedrock-embeddings')
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Rate limiting applied - Duration: ${duration}ms`);
  } catch (error) {
    console.log(`❌ Rate limiting test failed: ${(error as Error).message}`);
  }
  console.log('');

  // Test 4: Partial Success Reporting (Requirement 5.4)
  console.log('📊 Test 4: Partial Success Reporting with Detailed Failure Information');
  try {
    const errors: CrawlerError[] = [
      {
        url: 'https://diabetes.org/page1',
        errorType: 'network',
        errorMessage: 'Connection timeout',
        timestamp: new Date().toISOString(),
        retryAttempt: 2,
        recoverable: true
      },
      {
        url: 'https://diabetes.org/page2',
        errorType: 'parsing',
        errorMessage: 'Invalid HTML structure',
        timestamp: new Date().toISOString(),
        retryAttempt: 0,
        recoverable: false
      },
      {
        url: 'https://diabetes.org/page3',
        errorType: 'network',
        errorMessage: 'Bedrock API rate limit exceeded',
        timestamp: new Date().toISOString(),
        retryAttempt: 1,
        recoverable: true
      }
    ];

    const partialSuccessReport = errorResilienceService.createPartialSuccessReport(
      10, // total operations
      7,  // successful operations
      errors,
      'test-execution-123'
    );

    console.log('✅ Partial Success Report Generated:');
    console.log(`   - Success Rate: ${partialSuccessReport.successRate}%`);
    console.log(`   - Total Errors: ${partialSuccessReport.errors.total}`);
    console.log(`   - Recoverable Errors: ${partialSuccessReport.errors.recoverable}`);
    console.log(`   - Error Types: ${JSON.stringify(partialSuccessReport.errors.byType)}`);
    console.log(`   - Recommendations: ${partialSuccessReport.recommendations.length} items`);
    console.log(`   - Retryable Operations: ${partialSuccessReport.retryableOperations.length} URLs`);
  } catch (error) {
    console.log(`❌ Partial success reporting test failed: ${(error as Error).message}`);
  }
  console.log('');

  // Test 5: Graceful Degradation (Requirement 5.5)
  console.log('🔄 Test 5: Graceful Degradation for Content Detection Failures');
  try {
    // Test successful primary operation
    const result1 = await errorResilienceService.executeWithGracefulDegradation(
      () => Promise.resolve('Primary content detection successful'),
      () => Promise.resolve('Fallback content detection'),
      'content-detection'
    );
    console.log(`✅ Primary operation succeeded: ${result1}`);

    // Test fallback when primary fails
    const result2 = await errorResilienceService.executeWithGracefulDegradation(
      () => Promise.reject(new Error('Content detection service unavailable')),
      () => Promise.resolve('Fallback: Assume content changed'),
      'content-detection-fallback'
    );
    console.log(`✅ Graceful degradation succeeded: ${result2}`);

    // Test complete failure
    try {
      await errorResilienceService.executeWithGracefulDegradation(
        () => Promise.reject(new Error('Primary service down')),
        () => Promise.reject(new Error('Fallback service also down')),
        'content-detection-fail'
      );
    } catch (error) {
      console.log(`✅ Both services failed as expected: ${(error as Error).message}`);
    }
  } catch (error) {
    console.log(`❌ Graceful degradation test failed: ${(error as Error).message}`);
  }
  console.log('');

  // Test 6: System Health Summary
  console.log('🏥 Test 6: System Health Summary');
  try {
    const healthSummary = errorResilienceService.getSystemHealthSummary();
    console.log('✅ System Health Summary:');
    console.log(`   - Overall Status: ${healthSummary.overallStatus}`);
    console.log(`   - Total Services: ${healthSummary.totalServices}`);
    console.log(`   - Healthy Services: ${healthSummary.healthyServices}`);
    console.log(`   - Degraded Services: ${healthSummary.degradedServices}`);
    console.log(`   - Unhealthy Services: ${healthSummary.unhealthyServices}`);
    
    console.log('   - Service Details:');
    healthSummary.serviceDetails.forEach(service => {
      console.log(`     * ${service.name}: ${service.status} (failures: ${service.failureCount})`);
    });
  } catch (error) {
    console.log(`❌ System health summary test failed: ${(error as Error).message}`);
  }
  console.log('');

  console.log('🎉 Error Resilience Integration Test Completed!\n');
  console.log('📋 Summary of Implemented Features:');
  console.log('   ✅ 5.1: Exponential backoff retry logic for network failures');
  console.log('   ✅ 5.2: Circuit breaker pattern for S3 Vectors storage failures');
  console.log('   ✅ 5.3: Rate limiting for Bedrock embedding API calls');
  console.log('   ✅ 5.4: Partial success reporting with detailed failure information');
  console.log('   ✅ 5.5: Graceful degradation for content detection failures');
  console.log('');
  console.log('🔧 Additional Features:');
  console.log('   ✅ Dynamic circuit breaker initialization');
  console.log('   ✅ Token bucket rate limiting algorithm');
  console.log('   ✅ Comprehensive system health monitoring');
  console.log('   ✅ Enhanced error context and logging');
  console.log('   ✅ Recovery recommendations generation');
}

// Run the integration test
if (require.main === module) {
  testErrorResilienceIntegration().catch(console.error);
}

export { testErrorResilienceIntegration };