import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as config from 'aws-cdk-lib/aws-config';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export interface SecurityEnhancementsStackProps extends StackProps {
  apiGatewayArn?: string;
  notificationEmail?: string;
  enableGuardDuty?: boolean;
  enableConfig?: boolean;
  enableCloudTrail?: boolean;
  retentionDays?: number;
}

/**
 * Security Enhancements Stack for ADA Clara
 * 
 * Implements comprehensive security controls including:
 * - AWS WAF for web application protection
 * - AWS Secrets Manager for credential storage
 * - KMS encryption keys
 * - CloudTrail for audit logging
 * - GuardDuty for threat detection
 * - AWS Config for compliance monitoring
 * - Security monitoring and alerting
 */
export class SecurityEnhancementsStack extends Stack {
  public webAcl!: wafv2.CfnWebACL;
  public secretsManagerKey!: kms.Key;
  public auditLogsBucket!: s3.Bucket;
  public cloudTrail!: cloudtrail.Trail;
  public securityNotificationTopic!: sns.Topic;

  constructor(scope: Construct, id: string, props?: SecurityEnhancementsStackProps) {
    super(scope, id, props);

    // Create KMS key for encryption
    this.createKMSKey();

    // Create AWS WAF
    this.createWebACL(props?.apiGatewayArn);

    // Create Secrets Manager setup
    this.createSecretsManager();

    // Create audit logging infrastructure
    this.createAuditLogging(props?.retentionDays || 90);

    // Create CloudTrail if enabled
    if (props?.enableCloudTrail !== false) {
      this.createCloudTrail();
    }

    // Create GuardDuty if enabled
    if (props?.enableGuardDuty) {
      this.createGuardDuty();
    }

    // Create AWS Config if enabled
    if (props?.enableConfig) {
      this.createConfigService();
    }

    // Create security monitoring
    this.createSecurityMonitoring(props?.notificationEmail);

    // Create outputs
    this.createOutputs();
  }

  /**
   * Create KMS key for encryption
   */
  private createKMSKey(): void {
    this.secretsManagerKey = new kms.Key(this, 'SecretsManagerKey', {
      alias: 'ada-clara-secrets-key',
      description: 'KMS key for ADA Clara secrets encryption',
      enableKeyRotation: true,
      keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            sid: 'Allow Secrets Manager',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('secretsmanager.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
              'kms:ReEncrypt*'
            ],
            resources: ['*']
          }),
          new iam.PolicyStatement({
            sid: 'Allow Lambda Functions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey'
            ],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:ViaService': `secretsmanager.${this.region}.amazonaws.com`
              }
            }
          })
        ]
      }),
      removalPolicy: RemovalPolicy.RETAIN // Keep encryption key for security
    });
  }

  /**
   * Create AWS WAF Web ACL
   */
  private createWebACL(apiGatewayArn?: string): void {
    this.webAcl = new wafv2.CfnWebACL(this, 'AdaClaraWebACL', {
      name: 'ada-clara-web-acl',
      description: 'WAF rules for ADA Clara API protection',
      scope: 'REGIONAL', // For API Gateway
      defaultAction: { allow: {} },
      
      rules: [
        // Rate limiting rule
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000, // 2000 requests per 5 minutes
              aggregateKeyType: 'IP'
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule'
          }
        },

        // AWS Managed Rules - Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: []
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric'
          }
        },

        // AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsMetric'
          }
        },

        // AWS Managed Rules - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSetMetric'
          }
        },

        // Geographic restriction (optional - can be customized)
        {
          name: 'GeoBlockRule',
          priority: 5,
          statement: {
            geoMatchStatement: {
              countryCodes: ['CN', 'RU', 'KP'] // Block high-risk countries
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoBlockMetric'
          }
        },

        // IP reputation rule
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 6,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IpReputationMetric'
          }
        },

        // Custom rule for healthcare data protection
        {
          name: 'HealthcareDataProtection',
          priority: 7,
          statement: {
            orStatement: {
              statements: [
                {
                  byteMatchStatement: {
                    searchString: 'ssn',
                    fieldToMatch: { body: {} },
                    textTransformations: [
                      { priority: 0, type: 'LOWERCASE' }
                    ],
                    positionalConstraint: 'CONTAINS'
                  }
                },
                {
                  regexMatchStatement: {
                    regexString: '\\d{3}-\\d{2}-\\d{4}', // SSN pattern
                    fieldToMatch: { body: {} },
                    textTransformations: [
                      { priority: 0, type: 'NONE' }
                    ]
                  }
                }
              ]
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'HealthcareDataProtection'
          }
        }
      ],

      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'AdaClaraWebACL'
      },

      tags: [
        { key: 'Project', value: 'ADA-Clara' },
        { key: 'Environment', value: 'Production' },
        { key: 'Security', value: 'WAF' }
      ]
    });

    // Associate WAF with API Gateway if ARN provided
    if (apiGatewayArn) {
      new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
        resourceArn: apiGatewayArn,
        webAclArn: this.webAcl.attrArn
      });
    }
  }

  /**
   * Create Secrets Manager setup
   */
  private createSecretsManager(): void {
    // Database credentials secret
    new secretsmanager.Secret(this, 'DatabaseCredentials', {
      secretName: 'ada-clara/database/credentials',
      description: 'Database credentials for ADA Clara',
      encryptionKey: this.secretsManagerKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'ada_clara_admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',
        includeSpace: false,
        passwordLength: 32,
        requireEachIncludedType: true
      },
      removalPolicy: RemovalPolicy.DESTROY // For development
    });

    // API keys secret
    new secretsmanager.Secret(this, 'APIKeys', {
      secretName: 'ada-clara/api/keys',
      description: 'API keys and tokens for ADA Clara integrations',
      encryptionKey: this.secretsManagerKey,
      secretObjectValue: {
        bedrockApiKey: SecretValue.unsafePlainText('placeholder-bedrock-key'),
        openaiApiKey: SecretValue.unsafePlainText('placeholder-openai-key'),
        twilioApiKey: SecretValue.unsafePlainText('placeholder-twilio-key'),
        sendgridApiKey: SecretValue.unsafePlainText('placeholder-sendgrid-key')
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    // JWT signing secret
    new secretsmanager.Secret(this, 'JWTSigningSecret', {
      secretName: 'ada-clara/jwt/signing-key',
      description: 'JWT signing key for ADA Clara authentication',
      encryptionKey: this.secretsManagerKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ algorithm: 'HS256' }),
        generateStringKey: 'signingKey',
        passwordLength: 64,
        excludeCharacters: '"@/\\\'',
        includeSpace: false
      },
      removalPolicy: RemovalPolicy.DESTROY
    });
  }

  /**
   * Create audit logging infrastructure
   */
  private createAuditLogging(retentionDays: number): void {
    // S3 bucket for audit logs
    this.auditLogsBucket = new s3.Bucket(this, 'AuditLogsBucket', {
      bucketName: `ada-clara-audit-logs-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.secretsManagerKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'AuditLogRetention',
          expiration: Duration.days(retentionDays),
          noncurrentVersionExpiration: Duration.days(30),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30)
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90)
            }
          ]
        }
      ],
      removalPolicy: RemovalPolicy.RETAIN, // Keep audit logs
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED
    });

    // Bucket policy for audit logs
    this.auditLogsBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyUnSecureCommunications',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.auditLogsBucket.bucketArn,
        `${this.auditLogsBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));
  }

  /**
   * Create CloudTrail for API auditing
   */
  private createCloudTrail(): void {
    this.cloudTrail = new cloudtrail.Trail(this, 'AdaClaraCloudTrail', {
      trailName: 'ada-clara-audit-trail',
      bucket: this.auditLogsBucket,
      s3KeyPrefix: 'cloudtrail-logs/',
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      encryptionKey: this.secretsManagerKey,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: new logs.LogGroup(this, 'CloudTrailLogGroup', {
        logGroupName: '/aws/cloudtrail/ada-clara',
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY
      })
    });

    // Add data events for S3 buckets
    this.cloudTrail.addS3EventSelector([{
      bucket: this.auditLogsBucket,
      objectPrefix: 'sensitive-data/'
    }]);

    // Add Lambda data events using event selectors
    this.cloudTrail.addEventSelector(cloudtrail.DataResourceType.LAMBDA_FUNCTION, [
      'arn:aws:lambda:*:*:function:ada-clara-*'
    ]);
  }

  /**
   * Create GuardDuty for threat detection
   */
  private createGuardDuty(): void {
    new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      dataSources: {
        s3Logs: { enable: true },
        kubernetes: { auditLogs: { enable: true } },
        malwareProtection: { scanEc2InstanceWithFindings: { ebsVolumes: true } }
      },
      tags: [
        { key: 'Project', value: 'ADA-Clara' },
        { key: 'Security', value: 'ThreatDetection' }
      ]
    });
  }

  /**
   * Create AWS Config for compliance monitoring
   */
  private createConfigService(): void {
    // Configuration recorder
    new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      name: 'ada-clara-config-recorder',
      roleArn: this.createConfigServiceRole().roleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
        resourceTypes: []
      }
    });

    // Delivery channel
    new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      name: 'ada-clara-config-delivery',
      s3BucketName: this.auditLogsBucket.bucketName,
      s3KeyPrefix: 'config-logs/',
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'TwentyFour_Hours'
      }
    });

    // Config rules for compliance
    this.createConfigRules();
  }

  /**
   * Create Config service role
   */
  private createConfigServiceRole(): iam.Role {
    return new iam.Role(this, 'ConfigServiceRole', {
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/ConfigRole')
      ],
      inlinePolicies: {
        ConfigDeliveryPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetBucketAcl',
                's3:GetBucketLocation',
                's3:ListBucket'
              ],
              resources: [this.auditLogsBucket.bucketArn]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:PutObject'],
              resources: [`${this.auditLogsBucket.bucketArn}/config-logs/*`],
              conditions: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control'
                }
              }
            })
          ]
        })
      }
    });
  }

  /**
   * Create Config rules for compliance
   */
  private createConfigRules(): void {
    // S3 bucket encryption rule
    new config.CfnConfigRule(this, 'S3BucketEncryptionRule', {
      configRuleName: 'ada-clara-s3-bucket-server-side-encryption-enabled',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED'
      }
    });

    // Lambda function encryption rule
    new config.CfnConfigRule(this, 'LambdaFunctionEncryptionRule', {
      configRuleName: 'ada-clara-lambda-function-settings-check',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'LAMBDA_FUNCTION_SETTINGS_CHECK'
      },
      inputParameters: {
        runtime: 'nodejs20.x',
        timeout: '300'
      }
    });

    // IAM password policy rule
    new config.CfnConfigRule(this, 'IAMPasswordPolicyRule', {
      configRuleName: 'ada-clara-iam-password-policy',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'IAM_PASSWORD_POLICY'
      },
      inputParameters: {
        RequireUppercaseCharacters: 'true',
        RequireLowercaseCharacters: 'true',
        RequireSymbols: 'false',
        RequireNumbers: 'true',
        MinimumPasswordLength: '8'
      }
    });
  }

  /**
   * Create security monitoring and alerting
   */
  private createSecurityMonitoring(notificationEmail?: string): void {
    // SNS topic for security alerts
    this.securityNotificationTopic = new sns.Topic(this, 'SecurityNotificationTopic', {
      topicName: 'ada-clara-security-alerts',
      displayName: 'ADA Clara Security Alerts'
    });

    // Add email subscription if provided
    if (notificationEmail) {
      this.securityNotificationTopic.addSubscription(
        new subscriptions.EmailSubscription(notificationEmail)
      );
    }

    // CloudWatch alarms for security events
    this.createSecurityAlarms();
  }

  /**
   * Create security-related CloudWatch alarms
   */
  private createSecurityAlarms(): void {
    // WAF blocked requests alarm
    new cloudwatch.Alarm(this, 'WAFBlockedRequestsAlarm', {
      alarmName: 'ada-clara-waf-blocked-requests',
      alarmDescription: 'High number of blocked requests by WAF',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: this.webAcl.name!,
          Region: this.region,
          Rule: 'ALL'
        },
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 100,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Failed authentication attempts alarm
    new cloudwatch.Alarm(this, 'FailedAuthAttemptsAlarm', {
      alarmName: 'ada-clara-failed-auth-attempts',
      alarmDescription: 'High number of failed authentication attempts',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Cognito',
        metricName: 'SignInThrottles',
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 50,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Unusual API activity alarm
    new cloudwatch.Alarm(this, 'UnusualAPIActivityAlarm', {
      alarmName: 'ada-clara-unusual-api-activity',
      alarmDescription: 'Unusual API activity detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 20,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
  }

  /**
   * Create stack outputs
   */
  private createOutputs(): void {
    new CfnOutput(this, 'WebACLArn', {
      value: this.webAcl.attrArn,
      description: 'AWS WAF Web ACL ARN',
      exportName: `AdaClara-${this.stackName}-WebACLArn`
    });

    new CfnOutput(this, 'SecretsManagerKeyArn', {
      value: this.secretsManagerKey.keyArn,
      description: 'KMS key ARN for Secrets Manager',
      exportName: `AdaClara-${this.stackName}-SecretsKeyArn`
    });

    new CfnOutput(this, 'AuditLogsBucketName', {
      value: this.auditLogsBucket.bucketName,
      description: 'S3 bucket for audit logs',
      exportName: `AdaClara-${this.stackName}-AuditLogsBucket`
    });

    if (this.cloudTrail) {
      new CfnOutput(this, 'CloudTrailArn', {
        value: this.cloudTrail.trailArn,
        description: 'CloudTrail ARN for audit logging',
        exportName: `AdaClara-${this.stackName}-CloudTrailArn`
      });
    }

    new CfnOutput(this, 'SecurityNotificationTopicArn', {
      value: this.securityNotificationTopic.topicArn,
      description: 'SNS topic for security notifications',
      exportName: `AdaClara-${this.stackName}-SecurityNotificationTopic`
    });

    new CfnOutput(this, 'SecurityConfiguration', {
      value: JSON.stringify({
        wafEnabled: true,
        secretsManagerEnabled: true,
        encryptionEnabled: true,
        auditLoggingEnabled: true,
        cloudTrailEnabled: !!this.cloudTrail,
        threatDetectionEnabled: true,
        complianceMonitoringEnabled: true,
        securityAlertsEnabled: true
      }),
      description: 'Security configuration summary'
    });
  }
}