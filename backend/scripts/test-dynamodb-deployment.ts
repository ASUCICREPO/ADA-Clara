#!/usr/bin/env ts-node

/**
 * DynamoDB Deployment Test Script
 * 
 * This script tests and validates DynamoDB deployment to identify issues
 * and provide troubleshooting information.
 */

import { execSync } from 'child_process';
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

interface TableInfo {
  name: string;
  status: string;
  gsiCount: number;
  exists: boolean;
}

class DynamoDBDeploymentTester {
  private dynamoClient: DynamoDBClient;
  private expectedTables = [
    'ada-clara-chat-sessions',
    'ada-clara-content-tracking',
    'ada-clara-professional-members',
    'ada-clara-analytics',
    'ada-clara-audit-logs',
    'ada-clara-user-preferences',
    'ada-clara-escalation-queue',
    'ada-clara-knowledge-content',
    'ada-clara-conversations',
    'ada-clara-messages',
    'ada-clara-questions',
    'ada-clara-unanswered-questions'
  ];

  constructor() {
    this.dynamoClient = new DynamoDBClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  async runTests(): Promise<void> {
    console.log('🧪 DynamoDB Deployment Test Suite\n');
    
    // Test 1: Check AWS credentials
    await this.testAWSCredentials();
    
    // Test 2: Check CDK bootstrap
    await this.testCDKBootstrap();
    
    // Test 3: Check existing tables
    await this.testExistingTables();
    
    // Test 4: Test deployment
    await this.testDeployment();
    
    // Test 5: Validate table structure
    await this.validateTableStructure();
    
    console.log('\n🎉 DynamoDB deployment test complete!');
  }

  private async testAWSCredentials(): Promise<void> {
    console.log('🔐 Testing AWS Credentials...');
    
    try {
      await this.dynamoClient.send(new ListTablesCommand({}));
      console.log('   ✅ AWS credentials are valid');
    } catch (error: any) {
      console.log('   ❌ AWS credentials issue:', error.message);
      console.log('   💡 Fix: Configure AWS credentials with `aws configure`');
    }
  }

  private async testCDKBootstrap(): Promise<void> {
    console.log('\n🚀 Testing CDK Bootstrap...');
    
    try {
      execSync('cdk doctor', { stdio: 'pipe' });
      console.log('   ✅ CDK is properly configured');
    } catch (error) {
      console.log('   ⚠️ CDK doctor check failed');
      console.log('   💡 Fix: Run `cdk bootstrap` to initialize CDK');
    }
  }

  private async testExistingTables(): Promise<void> {
    console.log('\n📋 Checking Existing Tables...');
    
    try {
      const result = await this.dynamoClient.send(new ListTablesCommand({}));
      const existingTables = result.TableNames || [];
      const adaClaraTables = existingTables.filter(name => name.includes('ada-clara'));
      
      console.log(`   📊 Found ${adaClaraTables.length} existing ADA Clara tables:`);
      adaClaraTables.forEach(table => {
        console.log(`      • ${table}`);
      });
      
      if (adaClaraTables.length === 0) {
        console.log('   ℹ️ No existing ADA Clara tables found (this is normal for first deployment)');
      }
      
    } catch (error: any) {
      console.log('   ❌ Could not list tables:', error.message);
    }
  }

  private async testDeployment(): Promise<void> {
    console.log('\n🚀 Testing DynamoDB Stack Deployment...');
    
    try {
      console.log('   📦 Running CDK synth to validate stack...');
      execSync('cdk synth AdaClaraEnhancedDynamoDB --app "npx ts-node scripts/deploy-enhanced-dynamodb.ts"', {
        stdio: 'pipe'
      });
      console.log('   ✅ Stack synthesis successful');
      
      console.log('   🔍 Checking for deployment issues...');
      
      // Check for common issues
      const stackOutput = execSync('cdk synth AdaClaraEnhancedDynamoDB --app "npx ts-node scripts/deploy-enhanced-dynamodb.ts"', {
        encoding: 'utf8'
      });
      
      // Count GSIs in the stack
      const gsiMatches = stackOutput.match(/GlobalSecondaryIndexes/g);
      const gsiCount = gsiMatches ? gsiMatches.length : 0;
      console.log(`   📊 Total GSIs in stack: ${gsiCount}`);
      
      if (gsiCount > 100) { // Conservative check across all tables
        console.log('   ⚠️ High GSI count detected - may cause deployment issues');
      }
      
    } catch (error: any) {
      console.log('   ❌ Stack synthesis failed:', error.message);
      console.log('   💡 This indicates a problem with the DynamoDB stack definition');
    }
  }

  private async validateTableStructure(): Promise<void> {
    console.log('\n🔍 Validating Table Structure...');
    
    const tableInfos: TableInfo[] = [];
    
    for (const tableName of this.expectedTables) {
      try {
        const result = await this.dynamoClient.send(new DescribeTableCommand({
          TableName: tableName
        }));
        
        const gsiCount = result.Table?.GlobalSecondaryIndexes?.length || 0;
        
        tableInfos.push({
          name: tableName,
          status: result.Table?.TableStatus || 'UNKNOWN',
          gsiCount,
          exists: true
        });
        
      } catch (error) {
        tableInfos.push({
          name: tableName,
          status: 'NOT_FOUND',
          gsiCount: 0,
          exists: false
        });
      }
    }
    
    // Display results
    console.log('\n   📊 Table Status Summary:');
    console.log('   ┌─────────────────────────────────────┬──────────┬──────┐');
    console.log('   │ Table Name                          │ Status   │ GSIs │');
    console.log('   ├─────────────────────────────────────┼──────────┼──────┤');
    
    tableInfos.forEach(table => {
      const name = table.name.padEnd(35);
      const status = table.exists ? '✅ ACTIVE' : '❌ MISSING';
      const statusPadded = status.padEnd(8);
      const gsis = table.gsiCount.toString().padStart(4);
      
      console.log(`   │ ${name} │ ${statusPadded} │ ${gsis} │`);
    });
    
    console.log('   └─────────────────────────────────────┴──────────┴──────┘');
    
    const existingCount = tableInfos.filter(t => t.exists).length;
    const totalGSIs = tableInfos.reduce((sum, t) => sum + t.gsiCount, 0);
    
    console.log(`\n   📈 Summary: ${existingCount}/${this.expectedTables.length} tables exist, ${totalGSIs} total GSIs`);
    
    if (existingCount === 0) {
      console.log('   💡 No tables found - run deployment to create them');
    } else if (existingCount < this.expectedTables.length) {
      console.log('   ⚠️ Some tables are missing - deployment may have failed partially');
    } else {
      console.log('   ✅ All expected tables exist');
    }
  }

  async deployTables(): Promise<void> {
    console.log('\n🚀 Deploying DynamoDB Tables...');
    
    try {
      execSync('npm run create-dynamodb-tables', {
        stdio: 'inherit'
      });
      console.log('   ✅ Deployment completed successfully');
    } catch (error: any) {
      console.log('   ❌ Deployment failed:', error.message);
      throw error;
    }
  }
}

async function main() {
  const tester = new DynamoDBDeploymentTester();
  
  try {
    await tester.runTests();
    
    // Ask if user wants to deploy
    const args = process.argv.slice(2);
    if (args.includes('--deploy')) {
      await tester.deployTables();
    } else {
      console.log('\n💡 To deploy tables, run: npm run test-dynamodb-deployment -- --deploy');
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}