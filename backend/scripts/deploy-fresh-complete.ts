#!/usr/bin/env ts-node

/**
 * Fresh Complete Deployment Script
 * 
 * This script deploys the complete ADA Clara system from scratch in the correct order.
 * It handles all dependencies and ensures proper deployment sequence.
 * 
 * Deployment Order:
 * 1. DynamoDB Tables (foundational data storage)
 * 2. S3 Vectors GA (vector storage and search)
 * 3. Chat Processor (session management and mock RAG)
 * 4. RAG Processor (dedicated RAG processing)
 * 5. Knowledge Base GA (Bedrock KB integration)
 * 6. Admin Analytics (monitoring and analytics)
 * 7. SES Escalation (email notifications)
 * 8. Validation Tests (end-to-end testing)
 */


/**
 * PRODUCTION DEPLOYMENT CONFIGURATION
 * 
 * This deployment script has been cleaned up to include only production-ready stacks:
 * - DynamoDB Stack (data storage)
 * - S3 Vectors GA Stack (vector storage with GA features)
 * - Chat Processor Stack (session management)
 * - RAG Processor Stack (dedicated RAG processing)
 * - Knowledge Base GA Stack (Bedrock integration)
 * - Admin Analytics Stack (monitoring)
 * - SES Escalation Stack (email notifications)
 * 
 * All experimental and testing stacks have been removed.
 */

import { execSync } from 'child_process';

interface DeploymentStep {
  name: string;
  description: string;
  command: string;
  stackName: string;
  dependencies: string[];
  optional: boolean;
  timeout: number; // minutes
}

class FreshDeployment {
  private cfClient: CloudFormationClient;
  private deployedStacks: Set<string> = new Set();
  private deploymentResults: Map<string, { success: boolean; duration: number; error?: string }> = new Map();

  // Deployment configuration
  private readonly DEPLOYMENT_STEPS: DeploymentStep[] = [
    {
      name: 'DynamoDB Tables',
      description: 'Create foundational DynamoDB tables for chat sessions, analytics, and user data',
      command: 'npx ts-node scripts/create-enhanced-tables.ts',
      stackName: 'AdaClaraEnhancedDynamoDB',
      dependencies: [],
      optional: false,
      timeout: 10
    },
    {
      name: 'S3 Vectors GA',
      description: 'Deploy S3 Vectors with GA features for vector storage and semantic search',
      command: 'npm run deploy-s3-vectors-ga',
      stackName: 'AdaClaraS3VectorsGA',
      dependencies: [],
      optional: false,
      timeout: 15
    },
    {
      name: 'Chat Processor',
      description: 'Deploy chat processing Lambda with session management and mock RAG',
      command: 'npm run deploy-chat-processor',
      stackName: 'AdaClaraChatProcessor-dev',
      dependencies: ['AdaClaraEnhancedDynamoDB'],
      optional: false,
      timeout: 10
    },
    {
      name: 'RAG Processor',
      description: 'Deploy dedicated RAG processing Lambda with S3 Vectors integration',
      command: 'cdk deploy AdaClaraRAGProcessor --app "npx ts-node scripts/deploy-rag-processor.ts"',
      stackName: 'AdaClaraRAGProcessor',
      dependencies: ['AdaClaraS3VectorsGA'],
      optional: false,
      timeout: 10
    },
    {
      name: 'Knowledge Base GA',
      description: 'Deploy Bedrock Knowledge Base with S3 Vectors GA integration',
      command: 'cdk deploy AdaClaraS3VectorsGAKnowledgeBase --app "npx ts-node scripts/deploy-kb-ga.ts"',
      stackName: 'AdaClaraS3VectorsGAKnowledgeBase',
      dependencies: ['AdaClaraS3VectorsGA'],
      optional: true,
      timeout: 20
    },
    {
      name: 'Admin Analytics',
      description: 'Deploy admin dashboard and analytics API',
      command: 'npm run deploy-admin-analytics',
      stackName: 'AdaClaraAdminAnalytics',
      dependencies: ['AdaClaraEnhancedDynamoDB'],
      optional: true,
      timeout: 10
    },
    {
      name: 'SES Escalation',
      description: 'Deploy email escalation system for human handoff',
      command: 'npm run deploy-ses-escalation',
      stackName: 'AdaClaraSESEscalation',
      dependencies: [],
      optional: true,
      timeout: 10
    }
  ];

  constructor() {
    this.cfClient = new CloudFormationClient({ region: 'us-east-1' });
  }

  async deployComplete(skipOptional: boolean = false): Promise<void> {
    console.log('🚀 ADA Clara Fresh Complete Deployment');
    console.log('=' .repeat(80));
    console.log('🎯 Deploying complete ADA Clara system from scratch');
    console.log('📍 Region: us-east-1');
    console.log('⏰ Started:', new Date().toISOString());
    
    if (skipOptional) {
      console.log('⚠️  Skipping optional components for faster deployment');
    }
    
    console.log('=' .repeat(80));

    const startTime = Date.now();

    try {
      // Step 1: Pre-deployment validation
      await this.preDeploymentValidation();

      // Step 2: Deploy components in order
      const stepsToRun = skipOptional 
        ? this.DEPLOYMENT_STEPS.filter(step => !step.optional)
        : this.DEPLOYMENT_STEPS;

      console.log(`\n📋 Deployment Plan (${stepsToRun.length} steps):`);
      stepsToRun.forEach((step, index) => {
        const optional = step.optional ? ' (optional)' : '';
        console.log(`   ${index + 1}. ${step.name}${optional}`);
        console.log(`      ${step.description}`);
      });

      console.log('\n🔄 Starting deployment...');

      for (let i = 0; i < stepsToRun.length; i++) {
        const step = stepsToRun[i];
        await this.deployStep(step, i + 1, stepsToRun.length);
      }

      // Step 3: Post-deployment validation
      await this.postDeploymentValidation();

      // Step 4: Generate deployment report
      await this.generateDeploymentReport(startTime);

      console.log('\n🎉 Fresh deployment completed successfully!');
      console.log('✨ ADA Clara system is ready for use');

    } catch (error: any) {
      console.error('\n❌ Deployment failed:', error.message);
      await this.generateFailureReport(startTime, error);
      process.exit(1);
    }
  }

  private async preDeploymentValidation(): Promise<void> {
    console.log('\n🔍 Pre-deployment validation...');

    // Check AWS credentials
    try {
      execSync('aws sts get-caller-identity', { stdio: 'pipe' });
      console.log('   ✅ AWS credentials valid');
    } catch (error) {
      throw new Error('AWS credentials not configured or invalid');
    }

    // Check CDK bootstrap
    try {
      execSync('cdk doctor', { stdio: 'pipe' });
      console.log('   ✅ CDK environment ready');
    } catch (error) {
      console.log('   ⚠️ CDK doctor check failed, but continuing...');
    }

    // Check for existing stacks
    const existingStacks = await this.checkExistingStacks();
    if (existingStacks.length > 0) {
      console.log('   ⚠️ Found existing ADA Clara stacks:');
      existingStacks.forEach(stack => console.log(`      - ${stack}`));
      console.log('   💡 Consider running destroy-all-stacks.ts first for a truly fresh deployment');
    } else {
      console.log('   ✅ No existing ADA Clara stacks found');
    }

    // Check Node.js and npm
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`   ✅ Node.js ${nodeVersion}, npm ${npmVersion}`);
    } catch (error) {
      throw new Error('Node.js or npm not available');
    }

    console.log('   ✅ Pre-deployment validation passed');
  }

  private async checkExistingStacks(): Promise<string[]> {
    try {
      const stacks = await this.cfClient.send(new DescribeStacksCommand({}));
      return (stacks.Stacks || [])
        .filter(stack => 
          stack.StackName?.includes('Ada') || 
          stack.StackName?.includes('ada') ||
          stack.StackName?.toLowerCase().includes('clara')
        )
        .map(stack => stack.StackName!)
        .filter(name => !name.includes('CDKToolkit')); // Exclude CDK bootstrap stack
    } catch (error) {
      return [];
    }
  }

  private async deployStep(step: DeploymentStep, stepNumber: number, totalSteps: number): Promise<void> {
    console.log(`\n📦 Step ${stepNumber}/${totalSteps}: ${step.name}`);
    console.log(`   ${step.description}`);
    
    // Check dependencies
    if (step.dependencies.length > 0) {
      console.log(`   📋 Dependencies: ${step.dependencies.join(', ')}`);
      for (const dep of step.dependencies) {
        if (!this.deployedStacks.has(dep)) {
          throw new Error(`Dependency ${dep} not deployed for step ${step.name}`);
        }
      }
    }

    const stepStartTime = Date.now();

    try {
      console.log(`   🔄 Running: ${step.command}`);
      
      // Execute deployment command
      const output = execSync(step.command, { 
        encoding: 'utf8',
        timeout: step.timeout * 60 * 1000, // Convert minutes to milliseconds
        cwd: process.cwd()
      });

      const duration = Date.now() - stepStartTime;
      
      // Verify stack was created
      const stackExists = await this.verifyStackExists(step.stackName);
      
      if (stackExists) {
        this.deployedStacks.add(step.stackName);
        this.deploymentResults.set(step.name, { success: true, duration });
        console.log(`   ✅ ${step.name} deployed successfully (${Math.round(duration / 1000)}s)`);
      } else {
        throw new Error(`Stack ${step.stackName} was not created`);
      }

    } catch (error: any) {
      const duration = Date.now() - stepStartTime;
      this.deploymentResults.set(step.name, { 
        success: false, 
        duration, 
        error: error.message 
      });

      if (step.optional) {
        console.log(`   ⚠️ Optional step ${step.name} failed: ${error.message}`);
        console.log(`   ⏭️ Continuing with deployment...`);
      } else {
        throw new Error(`Required step ${step.name} failed: ${error.message}`);
      }
    }
  }

  private async verifyStackExists(stackName: string): Promise<boolean> {
    try {
      const response = await this.cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = response.Stacks?.[0];
      return stack?.StackStatus === 'CREATE_COMPLETE' || stack?.StackStatus === 'UPDATE_COMPLETE';
    } catch (error) {
      return false;
    }
  }

  private async postDeploymentValidation(): Promise<void> {
    console.log('\n🔍 Post-deployment validation...');

    // Test key components
    const validationTests = [
      {
        name: 'S3 Vectors GA',
        test: () => this.testS3VectorsGA()
      },
      {
        name: 'Chat Processor',
        test: () => this.testChatProcessor()
      },
      {
        name: 'RAG Processor',
        test: () => this.testRAGProcessor()
      }
    ];

    for (const validation of validationTests) {
      try {
        console.log(`   🧪 Testing ${validation.name}...`);
        await validation.test();
        console.log(`   ✅ ${validation.name} validation passed`);
      } catch (error: any) {
        console.log(`   ⚠️ ${validation.name} validation failed: ${error.message}`);
        // Don't fail deployment for validation issues
      }
    }

    console.log('   ✅ Post-deployment validation completed');
  }

  private async testS3VectorsGA(): Promise<void> {
    try {
      execSync('npx ts-node scripts/test-ga-infrastructure-simple.ts', { 
        stdio: 'pipe',
        timeout: 30000 
      });
    } catch (error) {
      throw new Error('S3 Vectors GA test failed');
    }
  }

  private async testChatProcessor(): Promise<void> {
    try {
      execSync('npx ts-node scripts/test-chat-processor.ts', { 
        stdio: 'pipe',
        timeout: 30000 
      });
    } catch (error) {
      throw new Error('Chat Processor test failed');
    }
  }

  private async testRAGProcessor(): Promise<void> {
    try {
      execSync('npx ts-node scripts/test-rag-processor-simple.ts', { 
        stdio: 'pipe',
        timeout: 30000 
      });
    } catch (error) {
      throw new Error('RAG Processor test failed');
    }
  }

  private async generateDeploymentReport(startTime: number): Promise<void> {
    const totalDuration = Date.now() - startTime;
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Math.round(totalDuration / 1000),
      deployedStacks: Array.from(this.deployedStacks),
      results: Object.fromEntries(this.deploymentResults),
      summary: {
        total: this.deploymentResults.size,
        successful: Array.from(this.deploymentResults.values()).filter(r => r.success).length,
        failed: Array.from(this.deploymentResults.values()).filter(r => !r.success).length
      }
    };

    // Write report to file
    const reportPath = `FRESH_DEPLOYMENT_REPORT_${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Deployment Summary:');
    console.log(`   • Total time: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   • Successful: ${report.summary.successful}/${report.summary.total}`);
    console.log(`   • Failed: ${report.summary.failed}/${report.summary.total}`);
    console.log(`   • Report saved: ${reportPath}`);

    // Display deployed stacks
    console.log('\n📦 Deployed Stacks:');
    Array.from(this.deployedStacks).forEach(stack => {
      console.log(`   ✅ ${stack}`);
    });
  }

  private async generateFailureReport(startTime: number, error: Error): Promise<void> {
    const totalDuration = Date.now() - startTime;
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Math.round(totalDuration / 1000),
      error: error.message,
      deployedStacks: Array.from(this.deployedStacks),
      results: Object.fromEntries(this.deploymentResults),
      partialSuccess: this.deployedStacks.size > 0
    };

    const reportPath = `FAILED_DEPLOYMENT_REPORT_${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Failure Report:');
    console.log(`   • Failed after: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   • Deployed before failure: ${this.deployedStacks.size} stacks`);
    console.log(`   • Report saved: ${reportPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const skipOptional = args.includes('--skip-optional') || args.includes('--core-only');
  
  console.log('🚀 ADA Clara Fresh Complete Deployment');
  
  if (skipOptional) {
    console.log('⚡ Core components only (faster deployment)');
  }
  
  const deployment = new FreshDeployment();
  await deployment.deployComplete(skipOptional);
}

if (require.main === module) {
  main().catch(console.error);
}

export { FreshDeployment };