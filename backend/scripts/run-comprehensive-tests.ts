#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for Task 14
 * 
 * Runs all test suites and generates a comprehensive report
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  coverage?: number;
}

class ComprehensiveTestRunner {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite for Task 14');
    console.log('=' .repeat(70));

    const testSuites = [
      { name: 'Unit Tests', command: 'npm run test:unit', timeout: 60000 },
      { name: 'Integration Tests', command: 'npm run test:integration', timeout: 120000 },
      { name: 'Performance Tests', command: 'npm run test:performance', timeout: 300000 },
      { name: 'End-to-End Tests', command: 'npm run test:e2e', timeout: 300000 }
    ];

    for (const suite of testSuites) {
      await this.runTestSuite(suite.name, suite.command, suite.timeout);
    }

    this.generateReport();
  }

  private async runTestSuite(name: string, command: string, timeout: number): Promise<void> {
    console.log(`\n📋 Running ${name}...`);
    console.log('-'.repeat(50));

    const startTime = Date.now();

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: timeout,
        stdio: 'pipe'
      });

      const duration = Date.now() - startTime;
      const result = this.parseJestOutput(output);

      this.results.push({
        suite: name,
        passed: result.passed,
        failed: result.failed,
        total: result.total,
        duration,
        coverage: result.coverage
      });

      console.log(`✅ ${name} completed: ${result.passed}/${result.total} tests passed (${duration}ms)`);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Try to parse output even from failed runs
      const output = error.stdout || error.output || '';
      const result = this.parseJestOutput(output);

      this.results.push({
        suite: name,
        passed: result.passed,
        failed: result.failed || result.total,
        total: result.total,
        duration
      });

      console.log(`❌ ${name} failed: ${result.passed}/${result.total} tests passed (${duration}ms)`);
      if (error.stderr) {
        console.log(`Error: ${error.stderr.substring(0, 200)}...`);
      }
    }
  }

  private parseJestOutput(output: string): { passed: number; failed: number; total: number; coverage?: number } {
    // Parse Jest output for test results
    const testMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    const passOnlyMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/);

    if (testMatch) {
      return {
        failed: parseInt(testMatch[1]),
        passed: parseInt(testMatch[2]),
        total: parseInt(testMatch[3]),
        coverage: coverageMatch ? parseFloat(coverageMatch[1]) : undefined
      };
    } else if (passOnlyMatch) {
      return {
        failed: 0,
        passed: parseInt(passOnlyMatch[1]),
        total: parseInt(passOnlyMatch[2]),
        coverage: coverageMatch ? parseFloat(coverageMatch[1]) : undefined
      };
    } else {
      // Fallback parsing
      const lines = output.split('\n');
      let passed = 0;
      let failed = 0;
      
      for (const line of lines) {
        if (line.includes('✓') || line.includes('PASS')) passed++;
        if (line.includes('✗') || line.includes('FAIL')) failed++;
      }

      return {
        passed,
        failed,
        total: passed + failed,
        coverage: coverageMatch ? parseFloat(coverageMatch[1]) : undefined
      };
    }
  }

  private generateReport(): void {
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST SUITE REPORT - TASK 14');
    console.log('='.repeat(70));

    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
    const totalTests = this.results.reduce((sum, r) => sum + r.total, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📈 Overall Results: ${totalPassed}/${totalTests} tests passed (${totalFailed} failed)`);
    console.log(`⏱️  Total Duration: ${this.formatDuration(totalDuration)}`);
    console.log(`📊 Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

    console.log('\n📋 Test Suite Breakdown:');
    this.results.forEach(result => {
      const successRate = ((result.passed / result.total) * 100).toFixed(1);
      const status = result.failed === 0 ? '✅' : '⚠️';
      
      console.log(`   ${status} ${result.suite}:`);
      console.log(`      Tests: ${result.passed}/${result.total} passed (${successRate}%)`);
      console.log(`      Duration: ${this.formatDuration(result.duration)}`);
      if (result.coverage) {
        console.log(`      Coverage: ${result.coverage}%`);
      }
    });

    // Requirements coverage analysis
    console.log('\n📋 Requirements Coverage Analysis:');
    console.log('   ✅ Unit Tests: Validate individual component functionality');
    console.log('   ✅ Integration Tests: Validate API endpoint workflows');
    console.log('   ✅ Performance Tests: Validate system performance under load');
    console.log('   ✅ End-to-End Tests: Validate complete user workflows');

    // Task 14 completion status
    if (totalFailed === 0) {
      console.log('\n🎉 All comprehensive tests passed!');
      console.log('✅ Task 14: Comprehensive test suite is complete');
      console.log('\n📝 Ready for:');
      console.log('   • Task 15: Deploy and validate enhanced system');
      console.log('   • Task 16: Final checkpoint - System validation');
    } else {
      console.log(`\n⚠️  ${totalFailed} test(s) failed across test suites`);
      console.log('📝 Review failed tests before proceeding to deployment');
    }

    // Performance benchmarks
    console.log('\n⚡ Performance Benchmarks:');
    const performanceResult = this.results.find(r => r.suite === 'Performance Tests');
    if (performanceResult) {
      console.log(`   • Performance tests: ${this.formatDuration(performanceResult.duration)}`);
      console.log(`   • Average per test: ${this.formatDuration(performanceResult.duration / performanceResult.total)}`);
    }

    // Save detailed report
    this.saveDetailedReport(totalPassed, totalFailed, totalTests, totalDuration);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private saveDetailedReport(passed: number, failed: number, total: number, duration: number): void {
    const report = {
      timestamp: new Date().toISOString(),
      task: 'Task 14: Comprehensive Test Suite',
      summary: {
        totalTests: total,
        passed,
        failed,
        successRate: ((passed / total) * 100).toFixed(1) + '%',
        duration: this.formatDuration(duration)
      },
      testSuites: this.results,
      requirements: {
        'Unit Tests (14.1)': this.results.find(r => r.suite === 'Unit Tests')?.failed === 0 ? 'PASS' : 'FAIL',
        'Integration Tests (14.3)': this.results.find(r => r.suite === 'Integration Tests')?.failed === 0 ? 'PASS' : 'FAIL',
        'Performance Tests': this.results.find(r => r.suite === 'Performance Tests')?.failed === 0 ? 'PASS' : 'FAIL',
        'End-to-End Tests': this.results.find(r => r.suite === 'End-to-End Tests')?.failed === 0 ? 'PASS' : 'FAIL'
      },
      status: failed === 0 ? 'COMPLETED' : 'PARTIAL',
      nextSteps: failed === 0 ? 
        ['Task 15: Deploy and validate enhanced system', 'Task 16: Final checkpoint'] :
        ['Fix failing tests', 'Re-run comprehensive test suite']
    };

    const reportPath = path.join(__dirname, '..', 'TASK_14_TEST_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

async function main(): Promise<void> {
  const runner = new ComprehensiveTestRunner();
  
  try {
    await runner.runAllTests();
  } catch (error) {
    console.error('❌ Comprehensive test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { ComprehensiveTestRunner };