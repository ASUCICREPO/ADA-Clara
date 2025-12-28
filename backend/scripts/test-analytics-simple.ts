#!/usr/bin/env ts-node

/**
 * Simple Test for Enhanced Analytics Service
 * Tests only the AnalyticsService without circular dependencies
 */

import { AnalyticsService } from '../src/services/analytics-service';

async function testAnalyticsSimple() {
  console.log('🧪 Testing Enhanced Analytics Service (Simple)...\n');

  try {
    // Test 1: Create AnalyticsService
    console.log('1️⃣ Creating AnalyticsService...');
    const analyticsService = new AnalyticsService();
    console.log('✅ AnalyticsService created successfully\n');

    // Test 2: Test utility methods
    console.log('2️⃣ Testing utility methods...');
    
    // Test question normalization
    const testQuestion = "What is Type 1 Diabetes?";
    console.log('Original question:', testQuestion);
    
    // Access private methods through any casting for testing
    const service = analyticsService as any;
    const normalized = service.normalizeQuestion(testQuestion);
    console.log('Normalized question:', normalized);
    
    const hash = service.generateQuestionHash(testQuestion);
    console.log('Question hash:', hash);
    console.log('✅ Utility methods working\n');

    console.log('🎉 Simple analytics tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAnalyticsSimple()
    .then(() => {
      console.log('\n✅ Simple analytics service test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Simple analytics service test failed:', error);
      process.exit(1);
    });
}

export { testAnalyticsSimple };