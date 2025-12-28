#!/usr/bin/env ts-node

/**
 * Test processor instantiation to see if that's where the issue is
 */

async function testProcessorInstantiation(): Promise<void> {
  console.log('🔍 Testing processor instantiation');
  
  try {
    console.log('📦 Importing AdminAnalyticsProcessor...');
    const { AdminAnalyticsProcessor } = require('../lambda/admin-analytics/index');
    
    console.log('🏗️  Creating processor instance...');
    const processor = new AdminAnalyticsProcessor();
    
    console.log('✅ Processor created successfully');
    
    // Test a simple method call
    console.log('🧪 Testing getSystemHealth method...');
    const health = await processor.getSystemHealth();
    console.log('✅ getSystemHealth completed:', health.overallHealth);
    
  } catch (error) {
    console.error('❌ Processor instantiation failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testProcessorInstantiation().catch(console.error);