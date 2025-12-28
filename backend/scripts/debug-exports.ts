#!/usr/bin/env ts-node

/**
 * Debug what's being exported from the admin analytics module
 */

async function debugExports(): Promise<void> {
  console.log('🔍 Debugging exports from admin analytics module');
  
  try {
    const module = require('../lambda/admin-analytics/index');
    
    console.log('📦 Module loaded successfully');
    console.log('🔑 Available exports:', Object.keys(module));
    
    for (const [key, value] of Object.entries(module)) {
      console.log(`   • ${key}: ${typeof value}`);
      if (typeof value === 'function') {
        console.log(`     - Function name: ${value.name}`);
        console.log(`     - Is constructor: ${value.prototype !== undefined}`);
      }
    }
    
    // Try to access AdminAnalyticsProcessor specifically
    if ('AdminAnalyticsProcessor' in module) {
      const AdminAnalyticsProcessor = module.AdminAnalyticsProcessor;
      console.log(`\n🎯 AdminAnalyticsProcessor found:`);
      console.log(`   - Type: ${typeof AdminAnalyticsProcessor}`);
      console.log(`   - Name: ${AdminAnalyticsProcessor.name}`);
      console.log(`   - Has prototype: ${AdminAnalyticsProcessor.prototype !== undefined}`);
      
      if (typeof AdminAnalyticsProcessor === 'function') {
        try {
          console.log('🧪 Attempting to instantiate...');
          const instance = new AdminAnalyticsProcessor();
          console.log('✅ Instance created successfully');
        } catch (error) {
          console.error('❌ Instantiation failed:', error);
        }
      }
    } else {
      console.log('❌ AdminAnalyticsProcessor not found in exports');
    }
    
  } catch (error) {
    console.error('❌ Module loading failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

debugExports().catch(console.error);