#!/usr/bin/env ts-node

/**
 * Test if the AdminAnalyticsProcessor class can be compiled and exported
 */

// Try to import just the class
try {
  console.log('🔍 Testing AdminAnalyticsProcessor class compilation...');
  
  // Import the module
  const module = require('../lambda/admin-analytics/index');
  
  console.log('📦 Module exports:', Object.keys(module));
  
  // Check if AdminAnalyticsProcessor exists
  if ('AdminAnalyticsProcessor' in module) {
    console.log('✅ AdminAnalyticsProcessor found in exports');
    
    const AdminAnalyticsProcessor = module.AdminAnalyticsProcessor;
    console.log('🔧 Class type:', typeof AdminAnalyticsProcessor);
    console.log('🔧 Class name:', AdminAnalyticsProcessor.name);
    
    // Try to instantiate
    try {
      const instance = new AdminAnalyticsProcessor();
      console.log('✅ Class instantiation successful');
      console.log('🔧 Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter(name => name !== 'constructor'));
    } catch (error) {
      console.error('❌ Class instantiation failed:', error);
    }
  } else {
    console.log('❌ AdminAnalyticsProcessor NOT found in exports');
    
    // Let's check the source code directly
    const fs = require('fs');
    const path = require('path');
    
    const sourceFile = path.join(__dirname, '../lambda/admin-analytics/index.ts');
    const source = fs.readFileSync(sourceFile, 'utf8');
    
    // Check if the class is declared
    const classDeclaration = source.match(/export class AdminAnalyticsProcessor/);
    if (classDeclaration) {
      console.log('✅ Class declaration found in source code');
      
      // Check for syntax errors by counting braces
      const openBraces = (source.match(/{/g) || []).length;
      const closeBraces = (source.match(/}/g) || []).length;
      
      console.log(`🔧 Open braces: ${openBraces}`);
      console.log(`🔧 Close braces: ${closeBraces}`);
      
      if (openBraces !== closeBraces) {
        console.log('❌ Brace mismatch detected - this could be the issue!');
      } else {
        console.log('✅ Braces are balanced');
      }
      
      // Try to find the class boundaries
      const classStart = source.indexOf('export class AdminAnalyticsProcessor');
      if (classStart !== -1) {
        console.log(`🔧 Class starts at position: ${classStart}`);
        
        // Find the matching closing brace
        let braceCount = 0;
        let classEnd = -1;
        let foundFirstBrace = false;
        
        for (let i = classStart; i < source.length; i++) {
          if (source[i] === '{') {
            braceCount++;
            foundFirstBrace = true;
          } else if (source[i] === '}') {
            braceCount--;
            if (foundFirstBrace && braceCount === 0) {
              classEnd = i;
              break;
            }
          }
        }
        
        if (classEnd !== -1) {
          console.log(`🔧 Class ends at position: ${classEnd}`);
          console.log('✅ Class appears to be properly closed');
        } else {
          console.log('❌ Could not find class closing brace!');
        }
      }
    } else {
      console.log('❌ Class declaration NOT found in source code');
    }
  }
  
} catch (error) {
  console.error('❌ Module loading failed:', error);
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }
}