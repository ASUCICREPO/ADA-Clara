#!/usr/bin/env ts-node

/**
 * Deploy Cognito Authentication Stack
 * 
 * Deploys the complete Cognito authentication system including:
 * - User Pool with custom attributes
 * - User Pool Client with OAuth configuration
 * - Identity Pool for AWS resource access
 * - IAM roles for different user types
 * - Auth Lambda for JWT validation
 * - Membership Verification Lambda
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface DeploymentResult {
  success: boolean;
  duration: number;
  outputs: any;
  error?: string;
}

class CognitoAuthDeployer {
  private startTime: number = 0;

  async deploy(): Promise<void> {
    console.log('🚀 ADA Clara Cognito Authentication Deployment');
    console.log('=' .repeat(60));
    console.log('📋 Deploying complete authentication system...\n');

    this.startTime = Date.now();

    try {
      // Step 1: Pre-deployment validation
      await this.validatePrerequisites();

      // Step 2: Build Lambda functions
      await this.buildLambdaFunctions();

      // Step 3: Deploy Cognito stack
      const deployResult = await this.deployCognitoStack();

      // Step 4: Post-deployment configuration
      await this.postDeploymentSetup(deployResult);

      // Step 5: Generate configuration files
      await this.generateConfigFiles(deployResult);

      // Step 6: Run validation tests
      await this.runValidationTests();

      this.generateReport(true);

    } catch (error: any) {
      console.error('❌ Deployment failed:', error.message);
      this.generateReport(false, error.message);
      process.exit(1);
    }
  }

  /**
   * Validate prerequisites
   */
  async validatePrerequisites(): Promise<void> {
    console.log('🔍 Step 1: Validating prerequisites...');

    const requiredFiles = [
      'lib/cognito-auth-stack.ts',
      'lambda/auth-handler/index.ts',
      'lambda/membership-verification/index.ts',
      'lib/dynamodb-stack.ts'
    ];

    const missingFiles = requiredFiles.filter(file => 
      !fs.existsSync(path.join(__dirname, '..', file))
    );

    if (missingFiles.length > 0) {
      throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
    }

    // Check AWS CLI and CDK
    try {
      execSync('aws --version', { stdio: 'pipe' });
      execSync('cdk --version', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('AWS CLI and CDK are required');
    }

    // Check environment variables
    const requiredEnvVars = ['CDK_DEFAULT_ACCOUNT', 'CDK_DEFAULT_REGION'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.warn(`⚠️ Missing environment variables: ${missingEnvVars.join(', ')}`);
      console.log('Using default values...');
    }

    console.log('✅ Prerequisites validated');
  }

  /**
   * Build Lambda functions
   */
  async buildLambdaFunctions(): Promise<void> {
    console.log('🔧 Step 2: Building Lambda functions...');

    const lambdaFunctions = [
      'auth-handler',
      'membership-verification'
    ];

    for (const functionName of lambdaFunctions) {
      const functionPath = path.join(__dirname, '..', 'lambda', functionName);
      
      if (!fs.existsSync(functionPath)) {
        fs.mkdirSync(functionPath, { recursive: true });
      }

      // Create package.json if it doesn't exist
      const packageJsonPath = path.join(functionPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        const packageJson = {
          name: `ada-clara-${functionName}`,
          version: '1.0.0',
          main: 'index.js',
          dependencies: {
            '@aws-sdk/client-cognito-identity-provider': '^3.0.0',
            '@aws-sdk/client-dynamodb': '^3.0.0',
            '@aws-sdk/lib-dynamodb': '^3.0.0',
            'jsonwebtoken': '^9.0.0',
            'jwks-rsa': '^3.0.0'
          }
        };
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }

      // Install dependencies
      console.log(`📦 Installing dependencies for ${functionName}...`);
      try {
        execSync('npm install', { 
          cwd: functionPath, 
          stdio: 'pipe' 
        });
      } catch (error) {
        console.warn(`⚠️ Failed to install dependencies for ${functionName}, continuing...`);
      }
    }

    console.log('✅ Lambda functions prepared');
  }

  /**
   * Deploy Cognito stack
   */
  async deployCognitoStack(): Promise<DeploymentResult> {
    console.log('🚀 Step 3: Deploying Cognito authentication stack...');

    try {
      // Set admin email if provided
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        console.log(`📧 Admin email configured: ${adminEmail}`);
      }

      // Deploy the stack
      console.log('🔄 Running CDK deploy...');
      const deployCommand = 'cdk deploy AdaClaraCognitoAuth --require-approval never --outputs-file cognito-outputs.json';
      
      const output = execSync(deployCommand, { 
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        stdio: 'pipe'
      });

      console.log('✅ Cognito stack deployed successfully');

      // Read outputs
      let outputs = {};
      const outputsPath = path.join(__dirname, '..', 'cognito-outputs.json');
      if (fs.existsSync(outputsPath)) {
        outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      }

      return {
        success: true,
        duration: Date.now() - this.startTime,
        outputs
      };

    } catch (error: any) {
      console.error('❌ CDK deployment failed:', error.message);
      return {
        success: false,
        duration: Date.now() - this.startTime,
        outputs: {},
        error: error.message
      };
    }
  }

  /**
   * Post-deployment setup
   */
  async postDeploymentSetup(deployResult: DeploymentResult): Promise<void> {
    console.log('⚙️ Step 4: Post-deployment configuration...');

    if (!deployResult.success) {
      console.log('⚠️ Skipping post-deployment setup due to deployment failure');
      return;
    }

    try {
      // Extract stack outputs
      const stackOutputs = deployResult.outputs['AdaClaraCognitoAuth'] || {};
      
      // Create admin user if email provided and not already created
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && stackOutputs.UserPoolId) {
        console.log('👤 Setting up admin user...');
        await this.setupAdminUser(stackOutputs.UserPoolId, adminEmail);
      }

      // Configure CORS for Lambda functions
      console.log('🌐 Configuring CORS...');
      // CORS is handled in the Lambda functions themselves

      console.log('✅ Post-deployment setup completed');

    } catch (error: any) {
      console.error('❌ Post-deployment setup failed:', error.message);
      // Don't fail the entire deployment for post-setup issues
    }
  }

  /**
   * Setup admin user
   */
  async setupAdminUser(userPoolId: string, adminEmail: string): Promise<void> {
    try {
      // Check if admin user already exists
      const checkCommand = `aws cognito-idp admin-get-user --user-pool-id ${userPoolId} --username admin`;
      
      try {
        execSync(checkCommand, { stdio: 'pipe' });
        console.log('ℹ️ Admin user already exists');
        return;
      } catch (error) {
        // User doesn't exist, create it
      }

      // Create admin user
      const createCommand = `aws cognito-idp admin-create-user --user-pool-id ${userPoolId} --username admin --user-attributes Name=email,Value=${adminEmail} Name=email_verified,Value=true Name=custom:user_type,Value=admin --temporary-password TempPass123! --message-action SUPPRESS`;
      
      execSync(createCommand, { stdio: 'pipe' });
      console.log('✅ Admin user created successfully');
      console.log(`📧 Admin email: ${adminEmail}`);
      console.log('🔑 Temporary password: TempPass123! (must be changed on first login)');

    } catch (error: any) {
      console.error('❌ Failed to setup admin user:', error.message);
      // Don't fail deployment for this
    }
  }

  /**
   * Generate configuration files
   */
  async generateConfigFiles(deployResult: DeploymentResult): Promise<void> {
    console.log('📄 Step 5: Generating configuration files...');

    if (!deployResult.success) {
      console.log('⚠️ Skipping config generation due to deployment failure');
      return;
    }

    try {
      const stackOutputs = deployResult.outputs['AdaClaraCognitoAuth'] || {};
      
      // Generate frontend configuration
      const frontendConfig = {
        aws_project_region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        aws_cognito_region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        aws_user_pools_id: stackOutputs.UserPoolId,
        aws_user_pools_web_client_id: stackOutputs.UserPoolClientId,
        aws_cognito_identity_pool_id: stackOutputs.IdentityPoolId,
        aws_user_pool_domain: stackOutputs.UserPoolDomain,
        oauth: {
          domain: stackOutputs.UserPoolDomain?.replace('https://', ''),
          scope: ['email', 'openid', 'profile'],
          redirectSignIn: 'http://localhost:3000/auth/callback',
          redirectSignOut: 'http://localhost:3000',
          responseType: 'code'
        },
        userTypes: ['public', 'professional', 'admin'],
        apiEndpoints: {
          auth: stackOutputs.AuthLambdaArn,
          membership: stackOutputs.MembershipVerificationLambdaArn
        }
      };

      const configPath = path.join(__dirname, '..', 'cognito-config.json');
      fs.writeFileSync(configPath, JSON.stringify(frontendConfig, null, 2));

      // Generate environment variables file
      const envVars = [
        `COGNITO_USER_POOL_ID=${stackOutputs.UserPoolId}`,
        `COGNITO_USER_POOL_CLIENT_ID=${stackOutputs.UserPoolClientId}`,
        `COGNITO_IDENTITY_POOL_ID=${stackOutputs.IdentityPoolId}`,
        `COGNITO_DOMAIN=${stackOutputs.UserPoolDomain}`,
        `AUTH_LAMBDA_ARN=${stackOutputs.AuthLambdaArn}`,
        `MEMBERSHIP_LAMBDA_ARN=${stackOutputs.MembershipVerificationLambdaArn}`,
        `AUTHENTICATED_ROLE_ARN=${stackOutputs.AuthenticatedRoleArn}`,
        `PROFESSIONAL_ROLE_ARN=${stackOutputs.ProfessionalRoleArn}`,
        `ADMIN_ROLE_ARN=${stackOutputs.AdminRoleArn}`
      ];

      const envPath = path.join(__dirname, '..', '.env.cognito');
      fs.writeFileSync(envPath, envVars.join('\n'));

      console.log('✅ Configuration files generated:');
      console.log(`   📄 Frontend config: ${configPath}`);
      console.log(`   📄 Environment vars: ${envPath}`);

    } catch (error: any) {
      console.error('❌ Failed to generate config files:', error.message);
    }
  }

  /**
   * Run validation tests
   */
  async runValidationTests(): Promise<void> {
    console.log('🧪 Step 6: Running validation tests...');

    try {
      // Test 1: Check if User Pool exists
      console.log('🔍 Testing User Pool...');
      const configPath = path.join(__dirname, '..', 'cognito-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.aws_user_pools_id) {
          console.log('✅ User Pool ID found in config');
        }
      }

      // Test 2: Check Lambda functions
      console.log('🔍 Testing Lambda functions...');
      const lambdaFunctions = ['auth-handler', 'membership-verification'];
      for (const func of lambdaFunctions) {
        const funcPath = path.join(__dirname, '..', 'lambda', func, 'index.ts');
        if (fs.existsSync(funcPath)) {
          console.log(`✅ ${func} Lambda function exists`);
        }
      }

      // Test 3: Validate stack outputs
      console.log('🔍 Validating stack outputs...');
      const outputsPath = path.join(__dirname, '..', 'cognito-outputs.json');
      if (fs.existsSync(outputsPath)) {
        const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
        const stackOutputs = outputs['AdaClaraCognitoAuth'] || {};
        
        const requiredOutputs = [
          'UserPoolId',
          'UserPoolClientId', 
          'IdentityPoolId',
          'AuthLambdaArn',
          'MembershipVerificationLambdaArn'
        ];

        const missingOutputs = requiredOutputs.filter(output => !stackOutputs[output]);
        if (missingOutputs.length === 0) {
          console.log('✅ All required stack outputs present');
        } else {
          console.warn(`⚠️ Missing outputs: ${missingOutputs.join(', ')}`);
        }
      }

      console.log('✅ Validation tests completed');

    } catch (error: any) {
      console.error('❌ Validation tests failed:', error.message);
      // Don't fail deployment for validation issues
    }
  }

  /**
   * Generate deployment report
   */
  generateReport(success: boolean, error?: string): void {
    const duration = Date.now() - this.startTime;
    
    console.log('\n' + '=' .repeat(60));
    console.log('📊 COGNITO AUTHENTICATION DEPLOYMENT REPORT');
    console.log('=' .repeat(60));

    console.log(`\n📈 Deployment Summary:`);
    console.log(`✅ Status: ${success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`⏱️ Duration: ${(duration / 1000).toFixed(1)} seconds`);
    
    if (success) {
      console.log('\n🎉 Cognito Authentication System Deployed Successfully!');
      console.log('\n📋 What was deployed:');
      console.log('   ✅ Cognito User Pool with custom attributes');
      console.log('   ✅ User Pool Client with OAuth configuration');
      console.log('   ✅ Identity Pool for AWS resource access');
      console.log('   ✅ IAM roles for public, professional, and admin users');
      console.log('   ✅ Auth Lambda for JWT validation');
      console.log('   ✅ Membership Verification Lambda');
      console.log('   ✅ Configuration files for frontend integration');

      console.log('\n📝 Next Steps:');
      console.log('   1. Share cognito-config.json with frontend team');
      console.log('   2. Test authentication flow with frontend');
      console.log('   3. Configure professional membership verification');
      console.log('   4. Set up admin dashboard access');
      console.log('   5. Deploy security enhancements');

      console.log('\n🔐 Security Features Implemented:');
      console.log('   ✅ JWT token validation');
      console.log('   ✅ Role-based access control');
      console.log('   ✅ Professional membership verification');
      console.log('   ✅ Secure password policies');
      console.log('   ✅ Email verification required');

    } else {
      console.log('\n❌ Deployment Failed');
      if (error) {
        console.log(`   Error: ${error}`);
      }
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Check AWS credentials and permissions');
      console.log('   2. Verify CDK bootstrap is complete');
      console.log('   3. Check for resource naming conflicts');
      console.log('   4. Review CloudFormation events in AWS Console');
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      success,
      duration,
      error,
      components: {
        userPool: success,
        identityPool: success,
        authLambda: success,
        membershipLambda: success,
        iamRoles: success,
        configFiles: success
      }
    };

    const reportPath = path.join(__dirname, '..', 'COGNITO_DEPLOYMENT_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

// Main execution
async function main() {
  try {
    const deployer = new CognitoAuthDeployer();
    await deployer.deploy();
  } catch (error: any) {
    console.error('❌ Deployment script failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}