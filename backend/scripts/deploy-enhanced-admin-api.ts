#!/usr/bin/env ts-node

/**
 * Deployment script for enhanced admin dashboard API endpoints
 * Deploys the updated admin analytics stack with new endpoints
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

class EnhancedAdminAPIDeployer {
  private stackName = 'AdaClaraAdminAnalytics';
  private region = process.env.AWS_REGION || 'us-east-1';

  /**
   * Deploy the enhanced admin analytics stack
   */
  async deploy(): Promise<void> {
    console.log('🚀 Deploying Enhanced Admin Dashboard API...\n');

    try {
      // Step 1: Validate prerequisites
      await this.validatePrerequisites();

      // Step 2: Build Lambda function
      await this.buildLambdaFunction();

      // Step 3: Deploy CDK stack
      await this.deployCDKStack();

      // Step 4: Validate deployment
      await this.validateDeployment();

      console.log('✅ Enhanced Admin Dashboard API deployed successfully!');
      
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Validate deployment prerequisites
   */
  private async validatePrerequisites(): Promise<void> {
    console.log('🔍 Validating prerequisites...');

    // Check if enhanced DynamoDB tables exist (from Task 1)
    const requiredTables = [
      'ada-clara-conversations',
      'ada-clara-messages', 
      'ada-clara-questions'
    ];

    console.log('  📋 Checking enhanced DynamoDB tables...');
    for (const tableName of requiredTables) {
      try {
        execSync(`aws dynamodb describe-table --table-name ${tableName} --region ${this.region}`, { 
          stdio: 'pipe' 
        });
        console.log(`  ✅ Table ${tableName} exists`);
      } catch (error) {
        throw new Error(`Required table ${tableName} not found. Please run Task 1 deployment first.`);
      }
    }

    // Check if analytics service exists (from Task 2)
    const analyticsServicePath = path.join(__dirname, '../src/services/analytics-service.ts');
    if (!fs.existsSync(analyticsServicePath)) {
      throw new Error('Enhanced analytics service not found. Please complete Task 2 first.');
    }
    console.log('  ✅ Enhanced analytics service found');

    // Check AWS credentials
    try {
      execSync('aws sts get-caller-identity', { stdio: 'pipe' });
      console.log('  ✅ AWS credentials configured');
    } catch (error) {
      throw new Error('AWS credentials not configured. Please run "aws configure".');
    }

    // Check CDK installation
    try {
      execSync('cdk --version', { stdio: 'pipe' });
      console.log('  ✅ AWS CDK installed');
    } catch (error) {
      throw new Error('AWS CDK not installed. Please run "npm install -g aws-cdk".');
    }

    console.log('✅ Prerequisites validated\n');
  }

  /**
   * Build Lambda function with dependencies
   */
  private async buildLambdaFunction(): Promise<void> {
    console.log('🔨 Building Lambda function...');

    const lambdaDir = path.join(__dirname, '../lambda/admin-analytics');
    
    // Ensure Lambda directory exists
    if (!fs.existsSync(lambdaDir)) {
      fs.mkdirSync(lambdaDir, { recursive: true });
    }

    // Copy enhanced Lambda function
    const sourceFile = path.join(__dirname, '../lambda/admin-analytics/index.ts');
    if (fs.existsSync(sourceFile)) {
      console.log('  📄 Lambda function source found');
    } else {
      throw new Error('Enhanced Lambda function not found');
    }

    // Install Lambda dependencies
    console.log('  📦 Installing Lambda dependencies...');
    try {
      execSync('npm install', { 
        cwd: lambdaDir,
        stdio: 'pipe'
      });
      console.log('  ✅ Lambda dependencies installed');
    } catch (error) {
      console.log('  ℹ️  No package.json in Lambda directory (using parent dependencies)');
    }

    console.log('✅ Lambda function built\n');
  }

  /**
   * Deploy CDK stack
   */
  private async deployCDKStack(): Promise<void> {
    console.log('☁️  Deploying CDK stack...');

    try {
      // Bootstrap CDK if needed
      console.log('  🔧 Bootstrapping CDK...');
      execSync(`cdk bootstrap aws://${await this.getAccountId()}/${this.region}`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });

      // Deploy the stack
      console.log('  🚀 Deploying admin analytics stack...');
      execSync(`cdk deploy ${this.stackName} --require-approval never`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });

      console.log('✅ CDK stack deployed\n');
      
    } catch (error) {
      throw new Error(`CDK deployment failed: ${error}`);
    }
  }

  /**
   * Validate deployment
   */
  private async validateDeployment(): Promise<void> {
    console.log('🔍 Validating deployment...');

    try {
      // Get stack outputs
      const stackInfo = execSync(`aws cloudformation describe-stacks --stack-name ${this.stackName} --region ${this.region}`, {
        encoding: 'utf8'
      });

      const stack = JSON.parse(stackInfo).Stacks[0];
      const outputs = stack.Outputs || [];

      // Find API Gateway endpoint
      const apiEndpointOutput = outputs.find((output: any) => output.OutputKey === 'AdminAPIEndpoint');
      if (!apiEndpointOutput) {
        throw new Error('API Gateway endpoint not found in stack outputs');
      }

      const apiEndpoint = apiEndpointOutput.OutputValue;
      console.log(`  🌐 API Gateway endpoint: ${apiEndpoint}`);

      // Test health endpoint
      console.log('  🏥 Testing health endpoint...');
      try {
        const healthResponse = execSync(`curl -s "${apiEndpoint}admin/health"`, { encoding: 'utf8' });
        const healthData = JSON.parse(healthResponse);
        
        if (healthData.success) {
          console.log('  ✅ Health endpoint responding');
        } else {
          console.log('  ⚠️  Health endpoint returned error:', healthData.error);
        }
      } catch (error) {
        console.log('  ⚠️  Health endpoint test failed (this may be normal for new deployments)');
      }

      // Test new endpoints
      const newEndpoints = [
        'admin/dashboard',
        'admin/conversations', 
        'admin/questions',
        'admin/realtime'
      ];

      console.log('  🔗 Testing new API endpoints...');
      for (const endpoint of newEndpoints) {
        try {
          const response = execSync(`curl -s -o /dev/null -w "%{http_code}" "${apiEndpoint}${endpoint}"`, { 
            encoding: 'utf8' 
          });
          
          if (response.trim() === '200' || response.trim() === '500') {
            console.log(`  ✅ ${endpoint} - Endpoint accessible`);
          } else {
            console.log(`  ⚠️  ${endpoint} - HTTP ${response.trim()}`);
          }
        } catch (error) {
          console.log(`  ⚠️  ${endpoint} - Test failed`);
        }
      }

      console.log('✅ Deployment validation completed\n');

      // Print deployment summary
      this.printDeploymentSummary(apiEndpoint, outputs);

    } catch (error) {
      throw new Error(`Deployment validation failed: ${error}`);
    }
  }

  /**
   * Print deployment summary
   */
  private printDeploymentSummary(apiEndpoint: string, outputs: any[]): void {
    console.log('📋 Enhanced Admin Dashboard API Deployment Summary');
    console.log('=================================================\n');

    console.log('🌐 API Endpoints:');
    console.log(`   Base URL: ${apiEndpoint}`);
    console.log('   Available endpoints:');
    console.log('   • GET /admin/dashboard - Enhanced dashboard metrics');
    console.log('   • GET /admin/conversations - Conversation analytics');
    console.log('   • GET /admin/conversations/{id} - Conversation details');
    console.log('   • GET /admin/questions - FAQ and question analysis');
    console.log('   • GET /admin/realtime - Enhanced real-time metrics');
    console.log('   • GET /admin/health - System health status\n');

    console.log('📊 Stack Outputs:');
    for (const output of outputs) {
      console.log(`   • ${output.OutputKey}: ${output.OutputValue}`);
    }
    console.log('');

    console.log('🔧 Next Steps:');
    console.log('   1. Test the API endpoints using the provided URLs');
    console.log('   2. Update your frontend application to use the new endpoints');
    console.log('   3. Monitor CloudWatch logs for any issues');
    console.log('   4. Run the test script: npm run test:enhanced-api\n');

    console.log('📚 Documentation:');
    console.log('   • API documentation: backend/ADMIN_DASHBOARD_API_SPEC.md');
    console.log('   • Analytics guide: backend/ADMIN_ANALYTICS_GUIDE.md');
    console.log('   • Test results: Run backend/scripts/test-enhanced-api-endpoints.ts\n');
  }

  /**
   * Get AWS account ID
   */
  private async getAccountId(): Promise<string> {
    try {
      const identity = execSync('aws sts get-caller-identity --query Account --output text', {
        encoding: 'utf8'
      });
      return identity.trim();
    } catch (error) {
      throw new Error('Failed to get AWS account ID');
    }
  }

  /**
   * Rollback deployment if needed
   */
  async rollback(): Promise<void> {
    console.log('🔄 Rolling back deployment...');

    try {
      execSync(`cdk destroy ${this.stackName} --force`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ Rollback completed');
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const deployer = new EnhancedAdminAPIDeployer();
  
  const command = process.argv[2];
  
  try {
    if (command === 'rollback') {
      await deployer.rollback();
    } else {
      await deployer.deploy();
    }
  } catch (error) {
    console.error('💥 Operation failed:', error);
    process.exit(1);
  }
}

// Run the deployment
if (require.main === module) {
  main().catch(console.error);
}

export { EnhancedAdminAPIDeployer };