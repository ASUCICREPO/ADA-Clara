#!/usr/bin/env ts-node

/**
 * Create Enhanced Tables Script
 * 
 * This script creates all enhanced DynamoDB tables for the ADA Clara system.
 * It's an alias for the create-dynamodb-tables script to maintain compatibility
 * with existing deployment scripts.
 */

import { execSync } from 'child_process';
import * as path from 'path';

async function main() {
  console.log('🗄️ Creating Enhanced DynamoDB Tables...\n');
  
  try {
    // Call the main DynamoDB creation script
    const scriptPath = path.join(__dirname, 'create-dynamodb-tables.ts');
    
    console.log('📋 Executing DynamoDB table creation...');
    execSync(`npx ts-node ${scriptPath}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('\n✅ Enhanced tables created successfully!');
    
  } catch (error: any) {
    console.error('\n❌ Enhanced table creation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}