import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * DynamoDB Stack for ADA Clara Chatbot
 * Comprehensive data storage using DynamoDB-only architecture
 */
export class AdaClaraDynamoDBStack extends Stack {
  public readonly chatSessionsTable: dynamodb.Table;
  public readonly professionalMembersTable: dynamodb.Table;
  public readonly analyticsTable: dynamodb.Table;
  public readonly auditLogsTable: dynamodb.Table;
  public readonly userPreferencesTable: dynamodb.Table;
  public readonly escalationQueueTable: dynamodb.Table;
  public readonly knowledgeContentTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Chat Sessions Table - Real-time session management
    this.chatSessionsTable = new dynamodb.Table(this, 'ChatSessionsTable', {
      tableName: 'ada-clara-chat-sessions',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // Professional Members Table - Membership data
    this.professionalMembersTable = new dynamodb.Table(this, 'ProfessionalMembersTable', {
      tableName: 'ada-clara-professional-members',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI for querying members by status
    this.professionalMembersTable.addGlobalSecondaryIndex({
      indexName: 'MemberStatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'expirationDate',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // Analytics Table - Metrics and reporting data
    this.analyticsTable = new dynamodb.Table(this, 'AnalyticsTable', {
      tableName: 'ada-clara-analytics',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI for querying analytics by type
    this.analyticsTable.addGlobalSecondaryIndex({
      indexName: 'AnalyticsTypeIndex',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'date',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // Audit Logs Table - Security and compliance tracking
    this.auditLogsTable = new dynamodb.Table(this, 'AuditLogsTable', {
      tableName: 'ada-clara-audit-logs',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // 7 years retention for compliance
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.RETAIN, // Always retain audit logs
    });

    // GSI for querying audit logs by event type
    this.auditLogsTable.addGlobalSecondaryIndex({
      indexName: 'EventTypeIndex',
      partitionKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI for querying audit logs by severity
    this.auditLogsTable.addGlobalSecondaryIndex({
      indexName: 'SeverityIndex',
      partitionKey: {
        name: 'severity',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // User Preferences Table - User settings and preferences
    this.userPreferencesTable = new dynamodb.Table(this, 'UserPreferencesTable', {
      tableName: 'ada-clara-user-preferences',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Escalation Queue Table - Pending escalations to human agents
    this.escalationQueueTable = new dynamodb.Table(this, 'EscalationQueueTable', {
      tableName: 'ada-clara-escalation-queue',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI for querying escalations by priority
    this.escalationQueueTable.addGlobalSecondaryIndex({
      indexName: 'PriorityIndex',
      partitionKey: {
        name: 'priority',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // Knowledge Content Table - Scraped content metadata
    this.knowledgeContentTable = new dynamodb.Table(this, 'KnowledgeContentTable', {
      tableName: 'ada-clara-knowledge-content',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI for querying content by type and language
    this.knowledgeContentTable.addGlobalSecondaryIndex({
      indexName: 'ContentTypeLanguageIndex',
      partitionKey: {
        name: 'contentType',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'language',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI for querying content by last updated
    this.knowledgeContentTable.addGlobalSecondaryIndex({
      indexName: 'LastUpdatedIndex',
      partitionKey: {
        name: 'contentType',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'lastUpdated',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });
  }

  /**
   * Create IAM policy for Lambda functions to access DynamoDB tables
   */
  public createLambdaAccessPolicy(): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
          ],
          resources: [
            this.chatSessionsTable.tableArn,
            this.professionalMembersTable.tableArn,
            this.analyticsTable.tableArn,
            this.auditLogsTable.tableArn,
            this.userPreferencesTable.tableArn,
            this.escalationQueueTable.tableArn,
            this.knowledgeContentTable.tableArn,
            // Include GSI ARNs
            `${this.chatSessionsTable.tableArn}/index/*`,
            `${this.professionalMembersTable.tableArn}/index/*`,
            `${this.analyticsTable.tableArn}/index/*`,
            `${this.auditLogsTable.tableArn}/index/*`,
            `${this.escalationQueueTable.tableArn}/index/*`,
            `${this.knowledgeContentTable.tableArn}/index/*`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:DescribeStream',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:ListStreams',
          ],
          resources: [
            `${this.chatSessionsTable.tableArn}/stream/*`,
            `${this.escalationQueueTable.tableArn}/stream/*`,
          ],
        }),
      ],
    });
  }

  /**
   * Grant read/write access to all tables for a Lambda function
   */
  public grantFullAccess(grantee: iam.IGrantable): void {
    this.chatSessionsTable.grantReadWriteData(grantee);
    this.professionalMembersTable.grantReadWriteData(grantee);
    this.analyticsTable.grantReadWriteData(grantee);
    this.auditLogsTable.grantReadWriteData(grantee);
    this.userPreferencesTable.grantReadWriteData(grantee);
    this.escalationQueueTable.grantReadWriteData(grantee);
    this.knowledgeContentTable.grantReadWriteData(grantee);
  }

  /**
   * Grant read-only access to all tables for a Lambda function
   */
  public grantReadAccess(grantee: iam.IGrantable): void {
    this.chatSessionsTable.grantReadData(grantee);
    this.professionalMembersTable.grantReadData(grantee);
    this.analyticsTable.grantReadData(grantee);
    this.auditLogsTable.grantReadData(grantee);
    this.userPreferencesTable.grantReadData(grantee);
    this.escalationQueueTable.grantReadData(grantee);
    this.knowledgeContentTable.grantReadData(grantee);
  }
}