#!/usr/bin/env node

/**
 * Deploy Simplified Cognito Authentication
 * 
 * This script deploys a simplified Cognito setup with only two user types:
 * - public: No authentication required (for diabetes.org visitors)
 * - admin: Cognito authentication required (for admin dashboard)
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class SimplifiedCognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create log group for auth function
    const authLogGroup = new logs.LogGroup(this, 'AuthLambdaLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-simple-auth-handler',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create User Pool with simplified schema (admin users only)
    this.userPool = new cognito.UserPool(this, 'AdaClaraUserPool', {
      userPoolName: 'ada-clara-simple-users',
      selfSignUpEnabled: false, // Only admins, no self-signup
      signInAliases: {
        email: true,
        username: false,
        phone: false
      },
      autoVerify: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        },
        givenName: {
          required: false,
          mutable: true
        },
        familyName: {
          required: false,
          mutable: true
        }
      },
      customAttributes: {
        'user_type': new cognito.StringAttribute({
          mutable: false // Admin type is fixed
        }),
        'language_preference': new cognito.StringAttribute({
          mutable: true
        })
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7)
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      mfa: cognito.Mfa.OFF,
      userVerification: {
        emailSubject: 'ADA Clara Admin - Verify your email',
        emailBody: 'Hello {username}, Welcome to ADA Clara Admin! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE
      }
    });

    // Create User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'AdaClaraUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'ada-clara-admin-client',
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userSrp: true,
        userPassword: true
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO
      ],
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true
        })
        .withCustomAttributes('user_type', 'language_preference'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true
        })
        .withCustomAttributes('language_preference'),
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(8), // Longer for admin sessions
      idTokenValidity: cdk.Duration.hours(8),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true
    });

    // Create User Pool Domain
    const domainPrefix = `ada-clara-simple-${this.account}`;
    const userPoolDomain = new cognito.UserPoolDomain(this, 'AdaClaraUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: domainPrefix
      }
    });

    // Create Simplified Auth Lambda Function (admin-only validation)
    this.authLambda = new lambda.Function(this, 'AuthLambda', {
      functionName: 'ada-clara-simple-auth-handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/simple-auth-handler'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: authLogGroup,
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        REGION: this.region
      }
    });

    // Grant Cognito permissions to auth lambda
    this.authLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers'
      ],
      resources: [this.userPool.userPoolArn]
    }));

    // Create Identity Pool (for admin AWS resource access)
    this.identityPool = new cognito.CfnIdentityPool(this, 'AdaClaraIdentityPool', {
      identityPoolName: 'ada-clara-simple-identity-pool',
      allowUnauthenticatedIdentities: false, // Only authenticated admins
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
        serverSideTokenCheck: true
      }]
    });

    // Create IAM role for authenticated admins
    const authenticatedRole = new iam.Role(this, 'AuthenticatedAdminRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        'StringEquals': {
          'cognito-identity.amazonaws.com:aud': this.identityPool.ref
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated'
        }
      }, 'sts:AssumeRoleWithWebIdentity'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonCognitoPowerUser')
      ]
    });

    // Attach role to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn
      }
    });

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID (Admin Only)',
      exportName: 'ADA-Clara-Simple-UserPool-ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'ADA-Clara-Simple-UserPool-Client-ID'
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'ADA-Clara-Simple-Identity-Pool-ID'
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain',
      exportName: 'ADA-Clara-Simple-UserPool-Domain'
    });

    new cdk.CfnOutput(this, 'AuthLambdaArn', {
      value: this.authLambda.functionArn,
      description: 'Simple Auth Lambda Function ARN',
      exportName: 'ADA-Clara-Simple-Auth-Lambda-ARN'
    });

    // Complete configuration for frontend
    new cdk.CfnOutput(this, 'SimplifiedConfig', {
      value: JSON.stringify({
        userPoolId: this.userPool.userPoolId,
        userPoolClientId: this.userPoolClient.userPoolClientId,
        identityPoolId: this.identityPool.ref,
        region: this.region,
        domain: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
        redirectSignIn: 'http://localhost:3000/admin/callback',
        redirectSignOut: 'http://localhost:3000',
        responseType: 'code',
        scope: ['email', 'openid', 'profile'],
        userTypes: ['public', 'admin'], // Simplified!
        authRequired: {
          chat: false, // Public chat access
          admin: true  // Admin dashboard requires auth
        }
      }),
      description: 'Complete simplified configuration for frontend'
    });
  }
}

async function deploySimplifiedCognito() {
  console.log('🚀 Starting Simplified Cognito deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy simplified Cognito stack
    console.log('🔐 Deploying Simplified Cognito Authentication stack...');
    const cognitoStack = new SimplifiedCognitoStack(app, 'AdaClaraSimpleCognito', {
      env,
      description: 'ADA Clara Simplified Cognito - Admin authentication only'
    });

    console.log('✅ Simplified Cognito stack defined successfully');
    console.log('📋 Simplified User Model:');
    console.log('  👤 Public Users:');
    console.log('    - No authentication required');
    console.log('    - Can use chat freely');
    console.log('    - Access to diabetes.org content');
    console.log('');
    console.log('  👨‍💼 Admin Users:');
    console.log('    - Cognito authentication required');
    console.log('    - Access to admin dashboard');
    console.log('    - Manage system and view analytics');
    console.log('');
    console.log('🔧 Removed Complexity:');
    console.log('  ❌ Professional verification');
    console.log('  ❌ Membership validation');
    console.log('  ❌ Professional user type');
    console.log('  ❌ Complex custom attributes');
    console.log('');
    console.log('📝 After deployment, configuration will be available in outputs');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deploySimplifiedCognito().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});