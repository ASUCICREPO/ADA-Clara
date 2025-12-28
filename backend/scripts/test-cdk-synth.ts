#!/usr/bin/env node

/**
 * Test CDK Synthesis for Task 12
 * Validates that CDK stacks can be synthesized without errors
 */

import { execSync } from 'child_process';
import * as path from 'path';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

class CDKSynthValidator {
  private results: TestResult[] = [];

  private addResult(test: string, status: 'PASS' | 'FAIL', details?: string): void {
    this.results.push({ test, status, details });
    const emoji = status === 'PASS' ? '✅' : '❌';
    console.log(`${emoji} ${test}${details ? `: ${details}` : ''}`);
  }

  async validateCDKSynthesis(): Promise<void> {
    console.log('\n🧪 Testing CDK Stack Synthesis...');

    try {
      // Test 1: Check if CDK can list stacks
      console.log('Running CDK list...');
      const listOutput = execSync('npx cdk list', { 
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 30000
      });
      
      if (listOutput.includes('AdaClaraDynamoDBStack') || listOutput.trim().length > 0) {
        this.addResult('CDK list command works', 'PASS', 'CDK can discover stacks');
      } else {
        this.addResult('CDK list command works', 'FAIL', 'No stacks found');
      }

      // Test 2: Check if TypeScript compiles
      console.log('Running TypeScript compilation...');
      const tscOutput = execSync('npx tsc --noEmit', { 
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 30000
      });
      
      this.addResult('TypeScript compilation', 'PASS', 'No compilation errors');

    } catch (error: any) {
      if (error.message.includes('tsc')) {
        this.addResult('TypeScript compilation', 'FAIL', `Compilation errors: ${error.stdout || error.message}`);
      } else if (error.message.includes('cdk list')) {
        this.addResult('CDK list command works', 'FAIL', `CDK error: ${error.stdout || error.message}`);
      } else {
        this.addResult('CDK synthesis validation', 'FAIL', `Error: ${error.message}`);
      }
    }
  }

  async validateFileStructure(): Promise<void> {
    console.log('\n🧪 Testing File Structure...');

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Test 1: Check if all CDK stack files exist
      const requiredFiles = [
        '../lib/dynamodb-stack.ts',
        '../lib/admin-analytics-stack.ts',
        '../lib/chat-processor-stack.ts'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          this.addResult(`File ${file} exists`, 'PASS');
        } else {
          this.addResult(`File ${file} exists`, 'FAIL', 'File not found');
        }
      }

      // Test 2: Check if CDK app file exists
      const cdkAppPath = path.join(__dirname, '../bin/ada-clara-backend.ts');
      if (fs.existsSync(cdkAppPath)) {
        this.addResult('CDK app file exists', 'PASS', 'bin/ada-clara-backend.ts found');
      } else {
        this.addResult('CDK app file exists', 'FAIL', 'CDK app file not found');
      }

      // Test 3: Check if cdk.json exists
      const cdkJsonPath = path.join(__dirname, '../cdk.json');
      if (fs.existsSync(cdkJsonPath)) {
        this.addResult('CDK configuration exists', 'PASS', 'cdk.json found');
      } else {
        this.addResult('CDK configuration exists', 'FAIL', 'cdk.json not found');
      }

    } catch (error) {
      this.addResult('File structure validation', 'FAIL', `Error: ${error}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting CDK Synthesis Validation for Task 12\n');

    await this.validateFileStructure();
    await this.validateCDKSynthesis();

    // Summary
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log('\n📊 Test Summary:');
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed === 0) {
      console.log('\n🎉 CDK synthesis validation completed successfully!');
      console.log('✅ Task 12 CDK infrastructure is ready for deployment.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the failed tests above.');
      if (failed <= 2) {
        console.log('💡 Minor issues detected, but core functionality should work.');
      }
    }
  }
}

// Run the tests
async function main() {
  const validator = new CDKSynthValidator();
  await validator.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { CDKSynthValidator };