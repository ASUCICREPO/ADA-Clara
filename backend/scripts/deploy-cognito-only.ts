#!/usr/bin/env node

/**
 * Deploy Cognito Authentication Only
 * 
 * This script deploys just the Cognito authentication system with the correct schema.
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class CognitoOnlyStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authLambda: lambda.Function;
  public readonly membershipVerificationLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create log groups first
    const authLogGroup = new logs.LogGroup(this, 'AuthLambdaLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-auth-handler',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const membershipLogGroup = new logs.LogGroup(this, 'MembershipLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-membership-verification',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create User Pool with FIXED schema (verified_pro instead of verified_professional)
    this.userPool = new cognito.UserPool(this, 'AdaClaraUserPool', {
      userPoolName: 'ada-clara-users',
      selfSignUpEnabled: true,
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
        },
        preferredUsername: {
          required: false,
          mutable: true
        }
      },
      customAttributes: {
        'user_type': new cognito.StringAttribute({
          mutable: true
        }),
        'membership_id': new cognito.StringAttribute({
          mutable: true
        }),
        'organization': new cognito.StringAttribute({
          mutable: true
        }),
        'language_preference': new cognito.StringAttribute({
          mutable: true
        }),
        'verified_pro': new cognito.StringAttribute({  // FIXED: 12 chars instead of 21
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
      mfaSecondFactor: {
        sms: false,
        otp: false
      },
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: false
      },
      userVerification: {
        emailSubject: 'Welcome to ADA Clara - Verify your email',
        emailBody: 'Hello {username}, Welcome to ADA Clara! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE
      },
      userInvitation: {
        emailSubject: 'Welcome to ADA Clara',
        emailBody: 'Hello {username}, you have been invited to join ADA Clara. Your temporary password is {####}',
        smsMessage: 'Hello {username}, your ADA Clara temporary password is {####}'
      }
    });

    // Create User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'AdaClaraUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'ada-clara-web-client',
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
          familyName: true,
          preferredUsername: true
        })
        .withCustomAttributes('user_type', 'membership_id', 'organization', 'language_preference', 'verified_pro'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          preferredUsername: true
        })
        .withCustomAttributes('user_type', 'membership_id', 'organization', 'language_preference', 'verified_pro'),
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true
    });

    // Create User Pool Domain
    const domainPrefix = `ada-clara-${this.account}`;
    const userPoolDomain = new cognito.UserPoolDomain(this, 'AdaClaraUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: domainPrefix
      }
    });

    // Create Auth Lambda Function
    this.authLambda = new lambda.Function(this, 'AuthLambda', {
      functionName: 'ada-clara-auth-handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/auth-handler'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: authLogGroup,
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences'
      }
    });

    // Create Membership Verification Lambda Function
    this.membershipVerificationLambda = new lambda.Function(this, 'MembershipVerificationLambda', {
      functionName: 'ada-clara-membership-verification',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/membership-verification'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup: membershipLogGroup,
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs'
      }
    });

    // Grant Cognito permissions to auth lambda
    this.authLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-identity:GetCredentialsForIdentity',
        'cognito-identity:GetId',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:ListUsers'
      ],
      resources: [
        this.userPool.userPoolArn,
        `arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`
      ]
    }));

    // Grant Cognito permissions to membership lambda
    this.membershipVerificationLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes'
      ],
      resources: [this.userPool.userPoolArn]
    }));

    // Grant DynamoDB permissions
    const dynamoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
      ]
    });

    this.authLambda.addToRolePolicy(dynamoPolicy);
    this.membershipVerificationLambda.addToRolePolicy(dynamoPolicy);

    // Create Identity Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'AdaClaraIdentityPool', {
      identityPoolName: 'ada-clara-identity-pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
        serverSideTokenCheck: true
      }]
    });

    // Create IAM roles for Identity Pool
    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
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

    const unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        'StringEquals': {
          'cognito-identity.amazonaws.com:aud': this.identityPool.ref
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'unauthenticated'
        }
      }, 'sts:AssumeRoleWithWebIdentity')
    });

    // Attach roles to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn
      }
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'ADA-Clara-UserPool-ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'ADA-Clara-UserPool-Client-ID'
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'ADA-Clara-Identity-Pool-ID'
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain',
      exportName: 'ADA-Clara-UserPool-Domain'
    });

    new cdk.CfnOutput(this, 'AuthLambdaArn', {
      value: this.authLambda.functionArn,
      description: 'Auth Lambda Function ARN',
      exportName: 'ADA-Clara-Auth-Lambda-ARN'
    });

    new cdk.CfnOutput(this, 'MembershipVerificationLambdaArn', {
      value: this.membershipVerificationLambda.functionArn,
      description: 'Membership Verification Lambda Function ARN',
      exportName: 'ADA-Clara-Membership-Lambda-ARN'
    });
  }
}

async function deployCognitoOnly() {
  console.log('🚀 Starting Cognito-only deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy Cognito stack
    console.log('🔐 Deploying Cognito Authentication stack...');
    const cognitoStack = new CognitoOnlyStack(app, 'AdaClaraCognitoAuth', {
      env,
      description: 'ADA Clara Cognito Authentication - Fixed schema'
    });

    console.log('✅ Cognito stack defined successfully');
    console.log('📋 Authentication features:');
    console.log('  - User Pool with email sign-in');
    console.log('  - Custom attributes: user_type, membership_id, organization, language_preference, verified_pro');
    console.log('  - Identity Pool for AWS resource access');
    console.log('  - Auth Lambda for JWT validation');
    console.log('  - Membership verification Lambda');
    console.log('');
    console.log('📝 After deployment, configuration will be available in outputs');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployCognitoOnly().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});