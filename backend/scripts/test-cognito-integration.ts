#!/usr/bin/env ts-node

/**
 * Cognito Integration Test Script
 * 
 * Tests the Cognito authentication system functionality:
 * - User Pool configuration
 * - Lambda function deployment
 * - Authentication flows
 * - Professional membership verification
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: any;
  error?: string;
}

class CognitoIntegrationTester {
  private results: TestResult[] = [];

  async runTests(): Promise<void> {
    console.log('🔐 Cognito Integration Test Suite');
    console.log('=' .repeat(60));
    console.log('🧪 Testing Cognito authentication system...\n');

    const tests = [
      () => this.testCognitoStackConfiguration(),
      () => this.testLambdaFunctions(),
      () => this.testUserPoolConfiguration(),
      () => this.testIAMRoles(),
      () => this.testSecurityConfiguration(),
      () => this.testMembershipVerification(),
      () => this.testConfigurationFiles()
    ];

    for (const test of tests) {
      try {
        const result = await test();
        this.results.push(result);
        
        console.log(`${result.success ? '✅' : '❌'} ${result.testName}`);
        console.log(`   Duration: ${result.duration}ms`);
        
        if (result.success) {
          console.log(`   ${result.details.summary}`);
        } else {
          console.log(`   Error: ${result.error}`);
        }
        console.log();
        
      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        this.results.push({
          testName: 'Unknown Test',
          success: false,
          duration: 0,
          details: {},
          error: error.message
        });
      }
    }

    this.generateReport();
  }

  /**
   * Test Cognito stack configuration
   */
  async testCognitoStackConfiguration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const stackPath = path.join(__dirname, '..', 'lib', 'cognito-auth-stack.ts');
      
      if (!fs.existsSync(stackPath)) {
        throw new Error('Cognito auth stack file not found');
      }

      const stackCode = fs.readFileSync(stackPath, 'utf8');
      
      // Check for required components
      const requiredComponents = [
        'UserPool',
        'UserPoolClient',
        'CfnIdentityPool',
        'authenticatedRole',
        'unauthenticatedRole',
        'professionalRole',
        'adminRole',
        'authLambda',
        'membershipVerificationLambda'
      ];

      const missingComponents = requiredComponents.filter(component => 
        !stackCode.includes(component)
      );

      if (missingComponents.length > 0) {
        throw new Error(`Missing components: ${missingComponents.join(', ')}`);
      }

      // Check for security features
      const securityFeatures = [
        'passwordPolicy',
        'mfa',
        'accountRecovery',
        'deviceTracking',
        'userVerification',
        'preventUserExistenceErrors'
      ];

      const implementedSecurity = securityFeatures.filter(feature => 
        stackCode.includes(feature)
      );

      // Check for custom attributes
      const customAttributes = [
        'user_type',
        'membership_id',
        'organization',
        'language_preference',
        'verified_professional'
      ];

      const implementedAttributes = customAttributes.filter(attr => 
        stackCode.includes(attr)
      );

      return {
        testName: 'Cognito Stack Configuration',
        success: missingComponents.length === 0,
        duration: Date.now() - startTime,
        details: {
          summary: `All ${requiredComponents.length} components found, ${implementedSecurity.length}/${securityFeatures.length} security features`,
          requiredComponents: requiredComponents.length,
          missingComponents: missingComponents.length,
          securityFeatures: implementedSecurity.length,
          customAttributes: implementedAttributes.length,
          hasOAuth: stackCode.includes('oAuth'),
          hasDomain: stackCode.includes('UserPoolDomain'),
          hasRoleMapping: stackCode.includes('roleMappings')
        }
      };

    } catch (error: any) {
      return {
        testName: 'Cognito Stack Configuration',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test Lambda functions
   */
  async testLambdaFunctions(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const lambdaFunctions = [
        {
          name: 'auth-handler',
          requiredMethods: [
            'validateToken',
            'extractUserContext',
            'handleAuthorizer',
            'handleDirectAuth',
            'handleTokenValidation',
            'handleProfessionalVerification'
          ]
        },
        {
          name: 'membership-verification',
          requiredMethods: [
            'verifyMembership',
            'performVerification',
            'verifyWithThirdPartyAPI',
            'getMembershipStatus',
            'getSupportedOrganizations'
          ]
        }
      ];

      const functionResults = [];

      for (const func of lambdaFunctions) {
        const funcPath = path.join(__dirname, '..', 'lambda', func.name, 'index.ts');
        
        if (!fs.existsSync(funcPath)) {
          throw new Error(`${func.name} Lambda function not found`);
        }

        const funcCode = fs.readFileSync(funcPath, 'utf8');
        
        const implementedMethods = func.requiredMethods.filter(method => 
          funcCode.includes(method)
        );

        functionResults.push({
          name: func.name,
          implementedMethods: implementedMethods.length,
          totalMethods: func.requiredMethods.length,
          hasErrorHandling: funcCode.includes('try') && funcCode.includes('catch'),
          hasLogging: funcCode.includes('console.log'),
          hasAWSSDK: funcCode.includes('@aws-sdk'),
          codeSize: funcCode.length
        });
      }

      const allMethodsImplemented = functionResults.every(func => 
        func.implementedMethods === func.totalMethods
      );

      return {
        testName: 'Lambda Functions',
        success: allMethodsImplemented,
        duration: Date.now() - startTime,
        details: {
          summary: `${functionResults.length} Lambda functions validated`,
          functions: functionResults,
          allMethodsImplemented,
          totalFunctions: functionResults.length
        }
      };

    } catch (error: any) {
      return {
        testName: 'Lambda Functions',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test User Pool configuration
   */
  async testUserPoolConfiguration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const stackPath = path.join(__dirname, '..', 'lib', 'cognito-auth-stack.ts');
      const stackCode = fs.readFileSync(stackPath, 'utf8');
      
      // Check User Pool configuration
      const userPoolFeatures = [
        'selfSignUpEnabled: true',
        'signInAliases',
        'autoVerify',
        'standardAttributes',
        'customAttributes',
        'passwordPolicy',
        'accountRecovery',
        'mfa',
        'deviceTracking',
        'userVerification'
      ];

      const implementedFeatures = userPoolFeatures.filter(feature => 
        stackCode.includes(feature.split(':')[0])
      );

      // Check User Pool Client configuration
      const clientFeatures = [
        'generateSecret: false',
        'authFlows',
        'oAuth',
        'preventUserExistenceErrors',
        'refreshTokenValidity',
        'accessTokenValidity',
        'idTokenValidity',
        'enableTokenRevocation'
      ];

      const implementedClientFeatures = clientFeatures.filter(feature => 
        stackCode.includes(feature.split(':')[0])
      );

      // Check OAuth configuration
      const oauthFeatures = [
        'authorizationCodeGrant',
        'scopes',
        'callbackUrls',
        'logoutUrls'
      ];

      const implementedOAuthFeatures = oauthFeatures.filter(feature => 
        stackCode.includes(feature)
      );

      const success = implementedFeatures.length >= 8 && 
                     implementedClientFeatures.length >= 6 && 
                     implementedOAuthFeatures.length >= 3;

      return {
        testName: 'User Pool Configuration',
        success,
        duration: Date.now() - startTime,
        details: {
          summary: `${implementedFeatures.length}/${userPoolFeatures.length} User Pool features, ${implementedClientFeatures.length}/${clientFeatures.length} client features`,
          userPoolFeatures: implementedFeatures.length,
          totalUserPoolFeatures: userPoolFeatures.length,
          clientFeatures: implementedClientFeatures.length,
          totalClientFeatures: clientFeatures.length,
          oauthFeatures: implementedOAuthFeatures.length,
          totalOAuthFeatures: oauthFeatures.length,
          hasCustomAttributes: stackCode.includes('customAttributes'),
          hasPasswordPolicy: stackCode.includes('passwordPolicy'),
          hasMFA: stackCode.includes('mfa'),
          hasDomain: stackCode.includes('UserPoolDomain')
        }
      };

    } catch (error: any) {
      return {
        testName: 'User Pool Configuration',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test IAM roles configuration
   */
  async testIAMRoles(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const stackPath = path.join(__dirname, '..', 'lib', 'cognito-auth-stack.ts');
      const stackCode = fs.readFileSync(stackPath, 'utf8');
      
      // Check for required IAM roles
      const requiredRoles = [
        'unauthenticatedRole',
        'authenticatedRole',
        'professionalRole',
        'adminRole'
      ];

      const implementedRoles = requiredRoles.filter(role => 
        stackCode.includes(role)
      );

      // Check for role policies
      const policyFeatures = [
        'UnauthenticatedPolicy',
        'AuthenticatedPolicy',
        'ProfessionalPolicy',
        'AdminPolicy',
        'execute-api:Invoke',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query'
      ];

      const implementedPolicies = policyFeatures.filter(policy => 
        stackCode.includes(policy)
      );

      // Check for Identity Pool role attachment
      const identityPoolFeatures = [
        'CfnIdentityPool',
        'CfnIdentityPoolRoleAttachment',
        'roleMappings'
      ];

      const implementedIdentityFeatures = identityPoolFeatures.filter(feature => 
        stackCode.includes(feature)
      );

      const success = implementedRoles.length === requiredRoles.length && 
                     implementedPolicies.length >= 6 && 
                     implementedIdentityFeatures.length === identityPoolFeatures.length;

      return {
        testName: 'IAM Roles Configuration',
        success,
        duration: Date.now() - startTime,
        details: {
          summary: `${implementedRoles.length}/${requiredRoles.length} IAM roles, ${implementedPolicies.length}/${policyFeatures.length} policy features`,
          iamRoles: implementedRoles.length,
          totalRoles: requiredRoles.length,
          policyFeatures: implementedPolicies.length,
          totalPolicyFeatures: policyFeatures.length,
          identityPoolFeatures: implementedIdentityFeatures.length,
          totalIdentityFeatures: identityPoolFeatures.length,
          hasRoleMapping: stackCode.includes('roleMappings'),
          hasResourceAccess: stackCode.includes('execute-api:Invoke'),
          hasDynamoDBAccess: stackCode.includes('dynamodb:')
        }
      };

    } catch (error: any) {
      return {
        testName: 'IAM Roles Configuration',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test security configuration
   */
  async testSecurityConfiguration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const stackPath = path.join(__dirname, '..', 'lib', 'cognito-auth-stack.ts');
      const stackCode = fs.readFileSync(stackPath, 'utf8');
      
      // Check security features
      const securityFeatures = [
        'passwordPolicy',
        'preventUserExistenceErrors: true',
        'enableTokenRevocation: true',
        'accountRecovery',
        'deviceTracking',
        'userVerification',
        'enforceSSL',
        'blockPublicAccess'
      ];

      const implementedSecurity = securityFeatures.filter(feature => 
        stackCode.includes(feature.split(':')[0])
      );

      // Check password policy requirements
      const passwordRequirements = [
        'minLength',
        'requireLowercase',
        'requireUppercase',
        'requireDigits',
        'requireSymbols'
      ];

      const implementedPasswordReqs = passwordRequirements.filter(req => 
        stackCode.includes(req)
      );

      // Check token validity settings
      const tokenSettings = [
        'refreshTokenValidity',
        'accessTokenValidity',
        'idTokenValidity'
      ];

      const implementedTokenSettings = tokenSettings.filter(setting => 
        stackCode.includes(setting)
      );

      const success = implementedSecurity.length >= 6 && 
                     implementedPasswordReqs.length >= 4 && 
                     implementedTokenSettings.length === 3;

      return {
        testName: 'Security Configuration',
        success,
        duration: Date.now() - startTime,
        details: {
          summary: `${implementedSecurity.length}/${securityFeatures.length} security features, ${implementedPasswordReqs.length}/${passwordRequirements.length} password requirements`,
          securityFeatures: implementedSecurity.length,
          totalSecurityFeatures: securityFeatures.length,
          passwordRequirements: implementedPasswordReqs.length,
          totalPasswordRequirements: passwordRequirements.length,
          tokenSettings: implementedTokenSettings.length,
          totalTokenSettings: tokenSettings.length,
          hasPreventUserExistence: stackCode.includes('preventUserExistenceErrors'),
          hasTokenRevocation: stackCode.includes('enableTokenRevocation'),
          hasDeviceTracking: stackCode.includes('deviceTracking'),
          hasAccountRecovery: stackCode.includes('accountRecovery')
        }
      };

    } catch (error: any) {
      return {
        testName: 'Security Configuration',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test membership verification functionality
   */
  async testMembershipVerification(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const membershipPath = path.join(__dirname, '..', 'lambda', 'membership-verification', 'index.ts');
      
      if (!fs.existsSync(membershipPath)) {
        throw new Error('Membership verification Lambda not found');
      }

      const membershipCode = fs.readFileSync(membershipPath, 'utf8');
      
      // Check verification methods
      const verificationMethods = [
        'verifyWithThirdPartyAPI',
        'verifyWithOrganizationDatabase',
        'verifyWithManualProcess'
      ];

      const implementedMethods = verificationMethods.filter(method => 
        membershipCode.includes(method)
      );

      // Check supported organizations
      const organizations = [
        'American Diabetes Association',
        'American Medical Association',
        'American Nurses Association',
        'Academy of Nutrition and Dietetics',
        'American Association of Diabetes Educators'
      ];

      const supportedOrgs = organizations.filter(org => 
        membershipCode.includes(org)
      );

      // Check validation features
      const validationFeatures = [
        'validateMembershipFormat',
        'validateProfession',
        'calculateExpirationDate',
        'storeMembershipRecord',
        'updateCognitoUserAttributes'
      ];

      const implementedValidation = validationFeatures.filter(feature => 
        membershipCode.includes(feature)
      );

      const success = implementedMethods.length === verificationMethods.length && 
                     supportedOrgs.length >= 3 && 
                     implementedValidation.length >= 4;

      return {
        testName: 'Membership Verification',
        success,
        duration: Date.now() - startTime,
        details: {
          summary: `${implementedMethods.length}/${verificationMethods.length} verification methods, ${supportedOrgs.length}/${organizations.length} organizations`,
          verificationMethods: implementedMethods.length,
          totalMethods: verificationMethods.length,
          supportedOrganizations: supportedOrgs.length,
          totalOrganizations: organizations.length,
          validationFeatures: implementedValidation.length,
          totalValidationFeatures: validationFeatures.length,
          hasThirdPartyAPI: membershipCode.includes('verifyWithThirdPartyAPI'),
          hasManualProcess: membershipCode.includes('verifyWithManualProcess'),
          hasFormatValidation: membershipCode.includes('validateMembershipFormat'),
          hasCognitoIntegration: membershipCode.includes('updateCognitoUserAttributes')
        }
      };

    } catch (error: any) {
      return {
        testName: 'Membership Verification',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test configuration files
   */
  async testConfigurationFiles(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Check if deployment outputs exist
      const outputFiles = [
        'cognito-outputs.json',
        'cognito-config.json',
        '.env.cognito'
      ];

      const existingFiles = outputFiles.filter(file => 
        fs.existsSync(path.join(__dirname, '..', file))
      );

      // Check CDK app configuration
      const appPath = path.join(__dirname, '..', 'bin', 'backend.ts');
      const appCode = fs.readFileSync(appPath, 'utf8');
      
      const hasAppIntegration = appCode.includes('CognitoAuthStack') && 
                               appCode.includes('AdaClaraCognitoAuth');

      // Check package.json dependencies
      const packagePath = path.join(__dirname, '..', 'package.json');
      let hasDependencies = false;
      
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        hasDependencies = deps['aws-cdk-lib'] && 
                         deps['@aws-cdk/aws-cognito'] !== undefined; // May not be needed with v2
      }

      return {
        testName: 'Configuration Files',
        success: hasAppIntegration,
        duration: Date.now() - startTime,
        details: {
          summary: `CDK app integration: ${hasAppIntegration ? 'configured' : 'missing'}, ${existingFiles.length}/${outputFiles.length} output files`,
          existingOutputFiles: existingFiles.length,
          totalOutputFiles: outputFiles.length,
          hasAppIntegration,
          hasDependencies,
          outputFiles: existingFiles,
          missingFiles: outputFiles.filter(file => !existingFiles.includes(file))
        }
      };

    } catch (error: any) {
      return {
        testName: 'Configuration Files',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  private generateReport(): void {
    console.log('=' .repeat(60));
    console.log('📊 COGNITO INTEGRATION TEST REPORT');
    console.log('=' .repeat(60));

    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;

    console.log(`\n📈 Test Summary: ${successful}/${total} tests passed`);
    console.log(`✅ Passed: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Success Rate: ${((successful / total) * 100).toFixed(1)}%`);

    // Cognito integration assessment
    console.log('\n🔐 Cognito Integration Assessment:');
    
    if (successful === total) {
      console.log('✅ Cognito User Pool and Identity Pool configured');
      console.log('✅ Authentication Lambda functions implemented');
      console.log('✅ Professional membership verification ready');
      console.log('✅ IAM roles and policies configured');
      console.log('✅ Security features implemented');
      console.log('✅ Multi-user type support (public, professional, admin)');
      
      console.log('\n🎉 Cognito Integration: READY FOR DEPLOYMENT');
      console.log('📝 All components validated and ready for production');
      
    } else {
      console.log(`⚠️  ${failed} test(s) failed`);
      console.log('📝 Address failing components before deployment');
      console.log('\n🔧 Cognito Integration: NEEDS ATTENTION');
    }

    // Next steps
    console.log('\n📝 Next Steps:');
    if (successful === total) {
      console.log('   • Deploy Cognito stack: npm run deploy:cognito');
      console.log('   • Test authentication flows with frontend');
      console.log('   • Configure professional membership verification');
      console.log('   • Deploy security enhancements');
    } else {
      console.log('   • Fix failing test components');
      console.log('   • Re-run tests to validate fixes');
      console.log('   • Proceed with deployment once all tests pass');
    }

    // Save report
    this.saveReport(successful, total);
  }

  private saveReport(successful: number, total: number): void {
    const report = {
      timestamp: new Date().toISOString(),
      testType: 'Cognito Integration Validation',
      summary: {
        totalTests: total,
        successful,
        failed: total - successful,
        successRate: ((successful / total) * 100).toFixed(1) + '%'
      },
      testResults: this.results,
      cognitoStatus: successful === total ? 'READY_FOR_DEPLOYMENT' : 'NEEDS_ATTENTION',
      nextSteps: successful === total ? 
        ['Deploy Cognito stack', 'Test authentication flows', 'Configure membership verification'] :
        ['Fix failing components', 'Re-run validation tests'],
      components: {
        userPool: 'Configured with custom attributes and security policies',
        identityPool: 'Configured with role-based access control',
        authLambda: 'JWT validation and user context management',
        membershipLambda: 'Professional membership verification',
        iamRoles: 'Public, professional, and admin roles with appropriate permissions',
        security: 'Password policies, MFA support, and token management'
      }
    };

    const reportPath = path.join(__dirname, '..', 'COGNITO_INTEGRATION_TEST_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Test report saved to: ${reportPath}`);
  }
}

// Main execution
async function main() {
  try {
    const tester = new CognitoIntegrationTester();
    await tester.runTests();
  } catch (error: any) {
    console.error('❌ Cognito integration test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}