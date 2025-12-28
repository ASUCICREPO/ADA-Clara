#!/usr/bin/env ts-node

/**
 * Test direct require of the admin analytics module to catch runtime errors
 */

console.log('🔍 Testing direct module require...');

try {
  console.log('📦 Attempting to require the module...');
  
  // Try to require the module and catch any runtime errors
  const module = require('../lambda/admin-analytics/index');
  
  console.log('✅ Module required successfully');
  console.log('📦 Available exports:', Object.keys(module));
  
  // Check each export
  for (const [key, value] of Object.entries(module)) {
    console.log(`   • ${key}: ${typeof value}`);
  }
  
} catch (error) {
  console.error('❌ Module require failed with error:', error);
  
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check if it's a syntax error
    if (error.message.includes('SyntaxError') || error.name === 'SyntaxError') {
      console.log('🚨 This appears to be a syntax error in the source file');
    }
    
    // Check if it's a module resolution error
    if (error.message.includes('Cannot find module') || error.code === 'MODULE_NOT_FOUND') {
      console.log('🚨 This appears to be a module resolution error');
    }
    
    // Check if it's a runtime error during class definition
    if (error.message.includes('class') || error.message.includes('constructor')) {
      console.log('🚨 This appears to be a class definition error');
    }
  }
}