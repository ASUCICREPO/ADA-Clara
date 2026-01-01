import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface CognitoAuthStackProps extends StackProps {
  domainPrefix?: string;
  adminEmail?: string;
  enableMFA?: boolean;
  passwordPolicy?: {
    minLength?: number;
    requireLowercase?: boolean;
    requireUppercase?: boolean;
    requireDigits?: boolean;
    requireSymbols?: boolean;
  };
}

/**
 * Cognito Authentication Stack for ADA Clara
 * 
 * Provides user authentication, session management, and role-based access control
 * for the ADA Clara chatbot system with support for:
 * - Public users (no authentication required)
 * - Admin users (Cognito authentication for dashboard access)
 */
export class CognitoAuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authLambda: lambda.Function;

  // IAM roles for different user types
  public authenticatedRole!: iam.Role;
  public unauthenticatedRole!: iam.Role;
  public adminRole!: iam.Role;

  constructor(scope: Construct, id: string, props?: CognitoAuthStackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Groups
    const authLogGroup = new logs.LogGroup(this, 'AuthLambdaLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-auth-handler',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Password policy configuration
    const passwordPolicy = props?.passwordPolicy || {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: false
    };

    // Create User Pool
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
        'language_preference': new cognito.StringAttribute({
          mutable: true
        })
      },
      passwordPolicy: {
        minLength: passwordPolicy.minLength,
        requireLowercase: passwordPolicy.requireLowercase,
        requireUppercase: passwordPolicy.requireUppercase,
        requireDigits: passwordPolicy.requireDigits,
        requireSymbols: passwordPolicy.requireSymbols,
        tempPasswordValidity: Duration.days(7)
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY, // For development - change for production
      mfa: props?.enableMFA ? cognito.Mfa.OPTIONAL : cognito.Mfa.OFF,
      mfaSecondFactor: {
        sms: false,
        otp: props?.enableMFA || false
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
      generateSecret: false, // For web applications
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true,
        adminUserPassword: false
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://ada-clara.diabetes.org/auth/callback' // Production URL
        ],
        logoutUrls: [
          'http://localhost:3000',
          'https://ada-clara.diabetes.org'
        ]
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      enableTokenRevocation: true
    });

    // Create User Pool Domain
    const domainPrefix = props?.domainPrefix || `ada-clara-${this.account}`;
    new cognito.UserPoolDomain(this, 'AdaClaraUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix
      }
    });

    // Create Identity Pool for AWS resource access FIRST
    this.identityPool = new cognito.CfnIdentityPool(this, 'AdaClaraIdentityPool', {
      identityPoolName: 'ada-clara-identity-pool',
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
        serverSideTokenCheck: true
      }]
    });

    // Create IAM roles for different user types (after identity pool is created)
    this.createIAMRoles();

    // Attach roles to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
        unauthenticated: this.unauthenticatedRole.roleArn
      },
      roleMappings: {
        mapping: {
          type: 'Token',
          ambiguousRoleResolution: 'AuthenticatedRole',
          identityProvider: `${this.userPool.userPoolProviderName}:${this.userPoolClient.userPoolClientId}`
        }
      }
    });

    // Create Auth Lambda for JWT validation and user context
    this.authLambda = new lambda.Function(this, 'AuthLambda', {
      functionName: 'ada-clara-auth-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/auth-handler'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      logGroup: authLogGroup,
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        IDENTITY_POOL_ID: this.identityPool.ref,
        REGION: this.region,
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences'
      }
    });

    // Grant permissions to Lambda functions
    this.grantLambdaPermissions();

    // Create admin user if email provided
    if (props?.adminEmail) {
      this.createAdminUser(props.adminEmail);
    }

    // Outputs
    this.createOutputs(domainPrefix);
  }

  private createIAMRoles(): void {
    // Unauthenticated role (very limited access)
    this.unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      roleName: 'ada-clara-unauthenticated-role',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        UnauthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'mobileanalytics:PutEvents',
                'cognito-sync:*'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // Authenticated role (basic access)
    this.authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: 'ada-clara-authenticated-role',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AuthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'mobileanalytics:PutEvents',
                'cognito-sync:*',
                'cognito-identity:*'
              ],
              resources: ['*']
            }),
            // Allow access to chat APIs
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'execute-api:Invoke'
              ],
              resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/POST/chat`,
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/POST/query`,
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/GET/health`
              ]
            }),
            // Allow DynamoDB access for user sessions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query'
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-chat-sessions`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-user-preferences`
              ],
              conditions: {
                'ForAllValues:StringEquals': {
                  'dynamodb:LeadingKeys': ['${cognito-identity.amazonaws.com:sub}']
                }
              }
            })
          ]
        })
      }
    });
    // Admin role (full access)
    this.adminRole = new iam.Role(this, 'AdminRole', {
      roleName: 'ada-clara-admin-role',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AdminPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'mobileanalytics:PutEvents',
                'cognito-sync:*',
                'cognito-identity:*'
              ],
              resources: ['*']
            }),
            // Full API access for admins
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'execute-api:Invoke'
              ],
              resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/*`
              ]
            }),
            // Full DynamoDB access for admins
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:*'
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
              ]
            }),
            // CloudWatch access for monitoring
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:GetMetricStatistics',
                'cloudwatch:ListMetrics',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:GetLogEvents'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });
  }

  private grantLambdaPermissions(): void {
    // Grant Cognito permissions to Auth Lambda
    this.authLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:ListUsers',
        'cognito-identity:GetId',
        'cognito-identity:GetCredentialsForIdentity'
      ],
      resources: [
        this.userPool.userPoolArn,
        `arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/${this.identityPool.ref}`
      ]
    }));

    // Grant DynamoDB permissions
    this.authLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-chat-sessions`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-user-preferences`
      ]
    }));
  }

  private createAdminUser(adminEmail: string): void {
    new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'admin',
      userAttributes: [
        {
          name: 'email',
          value: adminEmail
        },
        {
          name: 'email_verified',
          value: 'true'
        },
        {
          name: 'custom:user_type',
          value: 'admin'
        }
      ],
      messageAction: 'SUPPRESS', // Don't send welcome email
      desiredDeliveryMediums: ['EMAIL']
    });
  }

  private createOutputs(domainPrefix: string): void {
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `AdaClara-${this.stackName}-UserPoolId`
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `AdaClara-${this.stackName}-UserPoolClientId`
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `AdaClara-${this.stackName}-IdentityPoolId`
    });

    new CfnOutput(this, 'UserPoolDomain', {
      value: `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain',
      exportName: `AdaClara-${this.stackName}-UserPoolDomain`
    });

    new CfnOutput(this, 'AuthLambdaArn', {
      value: this.authLambda.functionArn,
      description: 'Auth Lambda Function ARN',
      exportName: `AdaClara-${this.stackName}-AuthLambdaArn`
    });

    new CfnOutput(this, 'AuthenticatedRoleArn', {
      value: this.authenticatedRole.roleArn,
      description: 'Authenticated User Role ARN',
      exportName: `AdaClara-${this.stackName}-AuthenticatedRoleArn`
    });

    new CfnOutput(this, 'AdminRoleArn', {
      value: this.adminRole.roleArn,
      description: 'Admin User Role ARN',
      exportName: `AdaClara-${this.stackName}-AdminRoleArn`
    });

    new CfnOutput(this, 'CognitoConfig', {
      value: JSON.stringify({
        userPoolId: this.userPool.userPoolId,
        userPoolClientId: this.userPoolClient.userPoolClientId,
        identityPoolId: this.identityPool.ref,
        region: this.region,
        domain: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
        redirectSignIn: 'http://localhost:3000/auth/callback',
        redirectSignOut: 'http://localhost:3000',
        responseType: 'code',
        scope: ['email', 'openid', 'profile'],
        userTypes: ['public', 'admin']
      }),
      description: 'Complete Cognito configuration for frontend (simplified 2-user model)'
    });
  }
}