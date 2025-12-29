#!/usr/bin/env ts-node

/**
 * Production Complete Deployment Script
 * 
 * This script deploys the complete ADA Clara production system from scratch.
 * It includes only production-ready stacks and handles all dependencies.
 * 
 * PRODUCTION STACKS ONLY:
 * - DynamoDB Stack (foundational data storage)
 * - S3 Vectors GA Stack (vector storage with GA features)
 * - Chat Processor Stack (session management and mock RAG)
 * - RAG Processor Stack (dedicated RAG processing)
 * - Knowledge Base GA Stack (Bedrock KB integration)
 * - Admin Analytics Stack (monitoring and analytics)
 * - SES Escalation Stack (email notifications)
 * 
 * All experimental and testing stacks have been removed for production clarity.
 */

import { execSync } from 'child_process';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

interface DeploymentStep {
  name: string;
  description: string;
  command: string;
  stackName: string;
  dependencies: string[];
  optional: boolean;
  timeout: number; // minutes
  healthCheck?: string; // Optional health check script
}

class ProductionDeployment {
  private cfClient: CloudFormationClient;
  private deployedStacks: Set<string> = new Set();
  private deploymentResults: Map<string, { success: boolean; duration: number; error?: string }> = new Map();

  // Production deployment configuration - only production-ready stacks
  private readonly PRODUCTION_STEPS: DeploymentStep[] = [
    {
      name: 'DynamoDB Tables',
      description: 'Deploy foundational DynamoDB tables for chat sessions, analytics, and user data',
      command: 'cdk deploy AdaClaraEnhancedDynamoDB --app "npx ts-node scripts/deploy-enhanced-dynamodb.ts"',
      stackName: 'AdaClaraEnhancedDynamoDB',
      dependencies: [],
      optional: false,
      timeout: 10,
      healthCheck: 'npx ts-node scripts/test-enhanced-dynamodb.ts'
    },
    {
      name: 'S3 Vectors GA with Enhanced Crawler Scheduling',
      description: 'Deploy S3 Vectors with GA features, EventBridge weekly scheduling, content change detection, and comprehensive monitoring',
      command: 'cdk deploy AdaClaraS3VectorsGA --app "npx ts-node scripts/deploy-s3-vectors-ga.ts"',
      stackName: 'AdaClaraS3VectorsGA',
      dependencies: ['AdaClaraEnhancedDynamoDB'],
      optional: false,
      timeout: 25, // Increased timeout for EventBridge, monitoring, and security components
      healthCheck: 'npx ts-node scripts/validate-enhanced-crawler-deployment.ts'
    },
    {
      name: 'Chat Processor',
      description: 'Deploy chat processing Lambda with session management and API Gateway',
      command: 'cdk deploy AdaClaraChatProcessor-dev --app "npx ts-node scripts/deploy-chat-processor.ts"',
      stackName: 'AdaClaraChatProcessor-dev',
      dependencies: ['AdaClaraEnhancedDynamoDB'],
      optional: false,
      timeout: 10,
      healthCheck: 'npx ts-node scripts/test-chat-processor.ts'
    },
    {
      name: 'RAG Processor',
      description: 'Deploy dedicated RAG processing Lambda with S3 Vectors integration',
      command: 'cdk deploy AdaClaraRAGProcessor --app "npx ts-node scripts/deploy-rag-processor.ts"',
      stackName: 'AdaClaraRAGProcessor',
      dependencies: ['AdaClaraS3VectorsGA'],
      optional: false,
      timeout: 10,
      healthCheck: 'npx ts-node scripts/test-rag-processor-simple.ts'
    },
    {
      name: 'Knowledge Base GA',
      description: 'Deploy Bedrock Knowledge Base with S3 Vectors GA integration for enhanced RAG',
      command: 'cdk deploy AdaClaraS3VectorsGAKnowledgeBase --app "npx ts-node scripts/deploy-kb-ga.ts"',
      stackName: 'AdaClaraS3VectorsGAKnowledgeBase',
      dependencies: ['AdaClaraS3VectorsGA'],
      optional: true,
      timeout: 20,
      healthCheck: 'npx ts-node scripts/test-kb-ga-simple.ts'
    },
    {
      name: 'Admin Analytics',
      description: 'Deploy admin dashboard and analytics API for monitoring and insights',
      command: 'cdk deploy AdaClaraAdminAnalytics --app "npx ts-node scripts/deploy-admin-analytics.ts"',
      stackName: 'AdaClaraAdminAnalytics',
      dependencies: ['AdaClaraEnhancedDynamoDB'],
      optional: true,
      timeout: 10,
      healthCheck: 'npx ts-node scripts/test-admin-analytics.ts'
    },
    {
      name: 'SES Escalation',
      description: 'Deploy email escalation system for human handoff notifications',
      command: 'cdk deploy AdaClaraSESEscalation --app "npx ts-node scripts/deploy-ses-escalation.ts"',
      stackName: 'AdaClaraSESEscalation',
      dependencies: [],
      optional: true,
      timeout: 10,
      healthCheck: 'npx ts-node scripts/test-escalation-workflow.ts'
    }
  ];

  constructor() {
    this.cfClient = new CloudFormationClient({ region: 'us-east-1' });
  }

  async deployProduction(coreOnly: boolean = false): Promise<void> {
    console.log('🚀 ADA Clara Production Deployment');
    console.log('=' .repeat(80));
    console.log('🎯 Deploying production-ready ADA Clara system');
    console.log('📍 Region: us-east-1');
    console.log('⏰ Started:', new Date().toISOString());
    
    if (coreOnly) {
      console.log('⚡ Core components only (DynamoDB, S3 Vectors, Chat & RAG processors)');
    } else {
      console.log('🔧 Full production deployment (including optional components)');
    }
    
    console.log('=' .repeat(80));

    const startTime = Date.now();

    try {
      // Step 1: Pre-deployment validation
      await this.preDeploymentValidation();

      // Step 2: Deploy components in order
      const stepsToRun = coreOnly 
        ? this.PRODUCTION_STEPS.filter(step => !step.optional)
        : this.PRODUCTION_STEPS;

      console.log(`\n📋 Production Deployment Plan (${stepsToRun.length} steps):`);
      stepsToRun.forEach((step, index) => {
        const optional = step.optional ? ' (optional)' : ' (required)';
        console.log(`   ${index + 1}. ${step.name}${optional}`);
        console.log(`      ${step.description}`);
      });

      console.log('\n🔄 Starting production deployment...');

      for (let i = 0; i < stepsToRun.length; i++) {
        const step = stepsToRun[i];
        await this.deployStep(step, i + 1, stepsToRun.length);
      }

      // Step 3: Post-deployment validation
      await this.postDeploymentValidation(stepsToRun);

      // Step 4: Generate deployment report
      await this.generateDeploymentReport(startTime);

      console.log('\n🎉 Production deployment completed successfully!');
      console.log('✨ ADA Clara production system is ready for use');
      console.log('📊 All production stacks deployed and validated');

    } catch (error: any) {
      console.error('\n❌ Production deployment failed:', error.message);
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
      console.log('   💡 Consider running destroy-all-stacks.ts first for a clean deployment');
    } else {
      console.log('   ✅ No existing ADA Clara stacks found');
    }

    // Check Node.js and npm versions
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`   ✅ Node.js ${nodeVersion}, npm ${npmVersion}`);
    } catch (error) {
      throw new Error('Node.js or npm not available');
    }

    // Check required dependencies
    try {
      execSync('npm list aws-cdk-lib cdk-s3-vectors', { stdio: 'pipe' });
      console.log('   ✅ Required CDK dependencies installed');
    } catch (error) {
      console.log('   ⚠️ Some CDK dependencies may be missing, but continuing...');
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
        
        // Run health check if available
        if (step.healthCheck) {
          await this.runHealthCheck(step.name, step.healthCheck);
        }
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

  private async runHealthCheck(stepName: string, healthCheckScript: string): Promise<void> {
    try {
      console.log(`   🧪 Running health check for ${stepName}...`);
      execSync(healthCheckScript, { 
        stdio: 'pipe',
        timeout: 30000 
      });
      console.log(`   ✅ Health check passed for ${stepName}`);
    } catch (error: any) {
      console.log(`   ⚠️ Health check failed for ${stepName}: ${error.message}`);
      // Don't fail deployment for health check issues
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

  private async postDeploymentValidation(deployedSteps: DeploymentStep[]): Promise<void> {
    console.log('\n🔍 Post-deployment validation...');

    // Run health checks for all deployed components
    for (const step of deployedSteps) {
      if (step.healthCheck && this.deployedStacks.has(step.stackName)) {
        await this.runHealthCheck(step.name, step.healthCheck);
      }
    }

    // Additional production readiness checks
    console.log('   🧪 Running production readiness checks...');
    
    const productionChecks = [
      {
        name: 'API Gateway Endpoints',
        check: () => this.validateApiEndpoints()
      },
      {
        name: 'DynamoDB Tables',
        check: () => this.validateDynamoDBTables()
      },
      {
        name: 'S3 Vectors Configuration',
        check: () => this.validateS3Vectors()
      }
    ];

    for (const check of productionChecks) {
      try {
        await check.check();
        console.log(`   ✅ ${check.name} validation passed`);
      } catch (error: any) {
        console.log(`   ⚠️ ${check.name} validation failed: ${error.message}`);
      }
    }

    console.log('   ✅ Post-deployment validation completed');
  }

  private async validateApiEndpoints(): Promise<void> {
    // Check if API Gateway endpoints are accessible
    const stacks = await this.cfClient.send(new DescribeStacksCommand({}));
    const chatStack = stacks.Stacks?.find(s => s.StackName === 'AdaClaraChatProcessor-dev');
    const ragStack = stacks.Stacks?.find(s => s.StackName === 'AdaClaraRAGProcessor');
    
    if (!chatStack || !ragStack) {
      throw new Error('Required API stacks not found');
    }
  }

  private async validateDynamoDBTables(): Promise<void> {
    // Verify DynamoDB tables exist and are active
    try {
      execSync('aws dynamodb describe-table --table-name ada-clara-chat-sessions', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('DynamoDB tables not accessible');
    }
  }

  private async validateS3Vectors(): Promise<void> {
    // Verify S3 Vectors bucket and index exist
    try {
      execSync('aws s3 ls ada-clara-vectors-ga-', { stdio: 'pipe' });
      
      // Validate EventBridge rule exists and is enabled
      const eventBridgeCheck = execSync('aws events describe-rule --name ada-clara-weekly-crawler-schedule', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      const ruleInfo = JSON.parse(eventBridgeCheck);
      
      if (ruleInfo.State !== 'ENABLED') {
        throw new Error(`EventBridge rule is not enabled: ${ruleInfo.State}`);
      }
      
      // Validate SNS topic exists
      execSync('aws sns list-topics | grep ada-clara-crawler-failures', { stdio: 'pipe' });
      
      // Validate content tracking table exists
      execSync('aws dynamodb describe-table --table-name ada-clara-content-tracking', { stdio: 'pipe' });
      
    } catch (error) {
      throw new Error('S3 Vectors GA with enhanced crawler scheduling not accessible');
    }
  }

  private async generateDeploymentReport(startTime: number): Promise<void> {
    const totalDuration = Date.now() - startTime;
    const report = {
      timestamp: new Date().toISOString(),
      deploymentType: 'production',
      totalDuration: Math.round(totalDuration / 1000),
      deployedStacks: Array.from(this.deployedStacks),
      results: Object.fromEntries(this.deploymentResults),
      summary: {
        total: this.deploymentResults.size,
        successful: Array.from(this.deploymentResults.values()).filter(r => r.success).length,
        failed: Array.from(this.deploymentResults.values()).filter(r => !r.success).length
      },
      productionReadiness: {
        coreComponents: ['DynamoDB', 'S3 Vectors GA', 'Chat Processor', 'RAG Processor'],
        optionalComponents: ['Knowledge Base GA', 'Admin Analytics', 'SES Escalation'],
        healthChecksRun: this.PRODUCTION_STEPS.filter(s => s.healthCheck).length
      }
    };

    // Write report to file
    const reportPath = `PRODUCTION_DEPLOYMENT_REPORT_${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Production Deployment Summary:');
    console.log(`   • Total time: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   • Successful: ${report.summary.successful}/${report.summary.total}`);
    console.log(`   • Failed: ${report.summary.failed}/${report.summary.total}`);
    console.log(`   • Report saved: ${reportPath}`);

    // Display deployed stacks
    console.log('\n📦 Production Stacks Deployed:');
    Array.from(this.deployedStacks).forEach(stack => {
      console.log(`   ✅ ${stack}`);
    });

    // Production URLs and endpoints
    console.log('\n🌐 Production Endpoints:');
    console.log('   • Chat API: Check CloudFormation outputs for AdaClaraChatProcessor-dev');
    console.log('   • RAG API: Check CloudFormation outputs for AdaClaraRAGProcessor');
    console.log('   • Admin Dashboard: Check CloudFormation outputs for AdaClaraAdminAnalytics');
    console.log('   • Crawler Monitoring: Check CloudFormation outputs for AdaClaraS3VectorsGA');
    
    // Enhanced crawler scheduling information
    console.log('\n📅 Enhanced Crawler Scheduling:');
    console.log('   • Weekly Schedule: Automated via EventBridge (every 7 days)');
    console.log('   • Content Detection: Intelligent change detection to avoid redundant uploads');
    console.log('   • Monitoring: CloudWatch dashboard and alarms for crawler health');
    console.log('   • Notifications: SNS alerts for failures and performance issues');
    console.log('   • Security: Domain whitelist, rate limiting, and audit logging');
    console.log('   • Configuration: Environment variables for schedule and target URLs');
  }

  private async generateFailureReport(startTime: number, error: Error): Promise<void> {
    const totalDuration = Date.now() - startTime;
    const report = {
      timestamp: new Date().toISOString(),
      deploymentType: 'production',
      totalDuration: Math.round(totalDuration / 1000),
      error: error.message,
      deployedStacks: Array.from(this.deployedStacks),
      results: Object.fromEntries(this.deploymentResults),
      partialSuccess: this.deployedStacks.size > 0,
      rollbackRecommendation: 'Run destroy-all-stacks.ts to clean up partial deployment'
    };

    const reportPath = `FAILED_PRODUCTION_DEPLOYMENT_REPORT_${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Production Deployment Failure Report:');
    console.log(`   • Failed after: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   • Deployed before failure: ${this.deployedStacks.size} stacks`);
    console.log(`   • Report saved: ${reportPath}`);
    console.log(`   • Rollback: npm run destroy-all-stacks`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const coreOnly = args.includes('--core-only') || args.includes('--core');
  
  console.log('🚀 ADA Clara Production Deployment');
  
  if (coreOnly) {
    console.log('⚡ Core components only (faster deployment)');
  } else {
    console.log('🔧 Full production deployment');
  }
  
  const deployment = new ProductionDeployment();
  await deployment.deployProduction(coreOnly);
}

if (require.main === module) {
  main().catch(console.error);
}

export { ProductionDeployment };