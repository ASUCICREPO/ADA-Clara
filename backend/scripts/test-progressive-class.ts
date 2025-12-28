#!/usr/bin/env ts-node

/**
 * Test AdminAnalyticsProcessor methods progressively to find the problematic one
 */

// First, let's try to load the original file and catch any runtime errors
console.log('🔍 Testing progressive class loading...');

try {
  // Try to require the module and catch any errors during loading
  console.log('📦 Attempting to load module...');
  
  const fs = require('fs');
  const path = require('path');
  
  // Read the source file
  const sourceFile = path.join(__dirname, '../lambda/admin-analytics/index.ts');
  const source = fs.readFileSync(sourceFile, 'utf8');
  
  console.log('✅ Source file read successfully');
  console.log(`📊 File size: ${source.length} characters`);
  
  // Try to compile it with TypeScript
  const ts = require('typescript');
  
  console.log('🔧 Attempting TypeScript compilation...');
  
  const result = ts.transpile(source, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: false
  });
  
  console.log('✅ TypeScript compilation successful');
  console.log(`📊 Compiled size: ${result.length} characters`);
  
  // Try to evaluate the compiled code
  console.log('🔧 Attempting to evaluate compiled code...');
  
  // Create a mock environment for the evaluation
  const mockEnv = {
    require: require,
    module: { exports: {} },
    exports: {},
    console: console,
    __dirname: __dirname,
    __filename: __filename,
    process: process,
    Buffer: Buffer,
    global: global
  };
  
  // Try to execute the compiled code
  const vm = require('vm');
  const context = vm.createContext(mockEnv);
  
  try {
    vm.runInContext(result, context);
    console.log('✅ Code evaluation successful');
    console.log('📦 Mock exports:', Object.keys(mockEnv.module.exports));
    
    if ('AdminAnalyticsProcessor' in mockEnv.module.exports) {
      console.log('✅ AdminAnalyticsProcessor found in mock exports');
    } else {
      console.log('❌ AdminAnalyticsProcessor NOT found in mock exports');
    }
  } catch (evalError) {
    console.error('❌ Code evaluation failed:', evalError);
    console.error('Stack:', evalError.stack);
  }
  
} catch (error) {
  console.error('❌ Progressive test failed:', error);
  console.error('Stack:', error.stack);
}