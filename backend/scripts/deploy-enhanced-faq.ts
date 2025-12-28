#!/usr/bin/env ts-node

/**
 * Deployment script for enhanced FAQ and question analysis functionality
 * Deploys the new API endpoints and tests the functionality
 */

import { execSync } from 'child_process';
import { FAQAnalysisTestSuite } from './test-faq-analysis';

interface DeploymentStep {
  name: string;
  command?: string;
  testFunction?: () => Promise<any>;
  required: boolean;
}

class EnhancedFAQDeployment {
  private steps: DeploymentStep[] = [
    {
      name: 'Compile TypeScript',
      command: 'npm run build',
      required: true
    },
    {
      name: 'Deploy Admin Analytics Stack',
      command: 'npx cdk deploy AdaClaraAdminAnalyticsStack --require-approval never',
      required: true
    },
    {
      name: 'Wait for deployment to stabilize',
      command: 'sleep 10',
      required: false
    },
    {
      name: 'Test Enhanced FAQ Analysis',
      testFunction: async () => {
        const testSuite = new FAQAnalysisTestSuite();
        await testSuite.runAllTests();
        return { status: 'completed' };
      },
      required: true
    }
  ];

  /**
   * Execute a shell command with error handling
   */
  private executeCommand(command: string): { success: boolean; output?: string; error?: string } {
    try {
      console.log(`🔧 Executing: ${command}`);
      const output = execSync(command, { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 300000 // 5 minutes timeout
      });
      
      console.log(`✅ Command completed successfully`);
      return { success: true, output };
    } catch (error: any) {
      console.log(`❌ Command failed: ${error.message}`);
      return { 
        success: false, 
        error: error.message,
        output: error.stdout || error.stderr 
      };
    }
  }

  /**
   * Execute a test function with error handling
   */
  private async executeTest(testFunction: () => Promise<any>): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      console.log(`🧪 Running test function...`);
      const result = await testFunction();
      console.log(`✅ Test completed successfully`);
      return { success: true, result };
    } catch (error: any) {
      console.log(`❌ Test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run a single deployment step
   */
  private async runStep(step: DeploymentStep): Promise<{ success: boolean; output?: any; error?: string }> {
    console.log(`\n📋 Step: ${step.name}`);
    console.log('─'.repeat(50));

    if (step.command) {
      return this.executeCommand(step.command);
    } else if (step.testFunction) {
      return await this.executeTest(step.testFunction);
    } else {
      return { success: true, output: 'No action required' };
    }
  }

  /**
   * Run the complete deployment process
   */
  async deploy(): Promise<void> {
    console.log('🚀 Starting Enhanced FAQ Analysis Deployment');
    console.log('==============================================');
    console.log(`📅 Started at: ${new Date().toISOString()}`);

    const results: Array<{ step: string; success: boolean; duration: number; error?: string }> = [];
    let overallSuccess = true;

    for (const step of this.steps) {
      const startTime = Date.now();
      const result = await this.runStep(step);
      const duration = Date.now() - startTime;

      results.push({
        step: step.name,
        success: result.success,
        duration,
        error: result.error
      });

      if (!result.success) {
        if (step.required) {
          console.log(`💥 Required step failed: ${step.name}`);
          overallSuccess = false;
          break;
        } else {
          console.log(`⚠️  Optional step failed: ${step.name} (continuing...)`);
        }
      }
    }

    // Print deployment summary
    this.printDeploymentSummary(results, overallSuccess);

    if (!overallSuccess) {
      process.exit(1);
    }
  }

  /**
   * Print deployment summary
   */
  private printDeploymentSummary(
    results: Array<{ step: string; success: boolean; duration: number; error?: string }>,
    overallSuccess: boolean
  ): void {
    console.log('\n📊 Deployment Summary');
    console.log('=====================');

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const successfulSteps = results.filter(r => r.success).length;
    const failedSteps = results.filter(r => !r.success).length;

    console.log(`✅ Successful Steps: ${successfulSteps}`);
    console.log(`❌ Failed Steps: ${failedSteps}`);
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`📈 Success Rate: ${((successfulSteps / results.length) * 100).toFixed(1)}%`);

    console.log('\n📋 Step Details:');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(1);
      console.log(`   ${status} ${result.step} (${duration}s)`);
      
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    console.log(`\n🎯 Overall Status: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n🎉 Enhanced FAQ Analysis Deployment Completed Successfully!');
      console.log('\n📚 New API Endpoints Available:');
      console.log('   • GET /admin/questions/enhanced - Enhanced FAQ analysis with message extraction');
      console.log('   • GET /admin/questions/ranking - Enhanced question ranking with multiple algorithms');
      console.log('\n🔧 Query Parameters:');
      console.log('   • startDate, endDate - Date range filter');
      console.log('   • language - Language filter (en/es)');
      console.log('   • limit - Number of results to return');
      console.log('   • includeExtraction - Include message-based question extraction (enhanced endpoint)');
      console.log('   • method - Ranking method: frequency/confidence/impact/combined (ranking endpoint)');
      
      console.log('\n📖 Usage Examples:');
      console.log('   curl "https://your-api-gateway-url/admin/questions/enhanced?startDate=2024-01-01&endDate=2024-01-31&includeExtraction=true"');
      console.log('   curl "https://your-api-gateway-url/admin/questions/ranking?method=combined&limit=20"');
    } else {
      console.log('\n💥 Deployment Failed!');
      console.log('Please review the errors above and retry the deployment.');
    }

    console.log(`\n📅 Completed at: ${new Date().toISOString()}`);
  }

  /**
   * Validate prerequisites
   */
  async validatePrerequisites(): Promise<boolean> {
    console.log('🔍 Validating Prerequisites');
    console.log('============================');

    const checks = [
      {
        name: 'AWS CLI configured',
        command: 'aws sts get-caller-identity'
      },
      {
        name: 'CDK installed',
        command: 'npx cdk --version'
      },
      {
        name: 'Node.js dependencies',
        command: 'npm list --depth=0'
      },
      {
        name: 'TypeScript compiler',
        command: 'npx tsc --version'
      }
    ];

    let allValid = true;

    for (const check of checks) {
      const result = this.executeCommand(check.command);
      if (result.success) {
        console.log(`✅ ${check.name}`);
      } else {
        console.log(`❌ ${check.name}: ${result.error}`);
        allValid = false;
      }
    }

    if (!allValid) {
      console.log('\n💥 Prerequisites validation failed!');
      console.log('Please ensure all prerequisites are met before running deployment.');
    }

    return allValid;
  }
}

/**
 * Main execution
 */
async function main() {
  const deployment = new EnhancedFAQDeployment();
  
  try {
    // Validate prerequisites first
    const prerequisitesValid = await deployment.validatePrerequisites();
    if (!prerequisitesValid) {
      process.exit(1);
    }

    // Run deployment
    await deployment.deploy();
  } catch (error) {
    console.error('💥 Deployment execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { EnhancedFAQDeployment };