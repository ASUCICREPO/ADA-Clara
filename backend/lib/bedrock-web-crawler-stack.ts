import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchserverless';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class BedrockWebCrawlerStack extends Stack {
  public readonly knowledgeBaseId: string;
  public readonly dataSourceId: string;
  public readonly vectorCollectionArn: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // IAM role for Bedrock Knowledge Base
    const bedrockKnowledgeBaseRole = new iam.Role(this, 'BedrockKnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
      ],
      inlinePolicies: {
        OpenSearchServerlessAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'aoss:APIAccessAll',
                'aoss:DashboardsAccessAll',
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems'
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // OpenSearch Serverless collection for vector storage
    const vectorCollection = new opensearch.CfnCollection(this, 'VectorCollection', {
      name: 'ada-clara-vectors',
      description: 'Vector collection for ADA Clara diabetes content',
      type: 'VECTORSEARCH',
    });

    // Network policy for OpenSearch Serverless
    const networkPolicy = new opensearch.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: 'ada-clara-network-policy',
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${vectorCollection.name}`],
              ResourceType: 'collection'
            }
          ],
          AllowFromPublic: true
        }
      ])
    });

    // Data access policy for OpenSearch Serverless
    const dataAccessPolicy = new opensearch.CfnAccessPolicy(this, 'DataAccessPolicy', {
      name: 'ada-clara-data-access-policy',
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${vectorCollection.name}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems'
              ],
              ResourceType: 'collection'
            },
            {
              Resource: [`index/${vectorCollection.name}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument'
              ],
              ResourceType: 'index'
            }
          ],
          Principal: [
            bedrockKnowledgeBaseRole.roleArn,
            `arn:aws:iam::${this.account}:root`
          ]
        }
      ])
    });

    // Encryption policy for OpenSearch Serverless
    const encryptionPolicy = new opensearch.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: 'ada-clara-encryption-policy',
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            Resource: [`collection/${vectorCollection.name}`],
            ResourceType: 'collection'
          }
        ],
        AWSOwnedKey: true
      })
    });

    // Ensure policies are created before collection
    vectorCollection.addDependency(networkPolicy);
    vectorCollection.addDependency(dataAccessPolicy);
    vectorCollection.addDependency(encryptionPolicy);

    this.vectorCollectionArn = `arn:aws:aoss:${this.region}:${this.account}:collection/${vectorCollection.attrId}`;

    // Lambda function to manage Bedrock Knowledge Base and Data Source
    const bedrockManagerRole = new iam.Role(this, 'BedrockManagerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:CreateKnowledgeBase',
                'bedrock:GetKnowledgeBase',
                'bedrock:UpdateKnowledgeBase',
                'bedrock:DeleteKnowledgeBase',
                'bedrock:ListKnowledgeBases',
                'bedrock:CreateDataSource',
                'bedrock:GetDataSource',
                'bedrock:UpdateDataSource',
                'bedrock:DeleteDataSource',
                'bedrock:ListDataSources',
                'bedrock:StartIngestionJob',
                'bedrock:GetIngestionJob',
                'bedrock:ListIngestionJobs'
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['iam:PassRole'],
              resources: [bedrockKnowledgeBaseRole.roleArn],
            }),
          ],
        }),
      },
    });

    const bedrockManagerLambda = new lambda.Function(this, 'BedrockManagerLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bedrock-manager.handler',
      code: lambda.Code.fromAsset('lambda/bedrock-manager'),
      timeout: Duration.minutes(15),
      memorySize: 512,
      role: bedrockManagerRole,
      environment: {
        KNOWLEDGE_BASE_ROLE_ARN: bedrockKnowledgeBaseRole.roleArn,
        VECTOR_COLLECTION_ARN: this.vectorCollectionArn,
        VECTOR_COLLECTION_ID: vectorCollection.attrId!,
      },
    });

    // Lambda function to test and compare crawling results
    const crawlerTestLambda = new lambda.Function(this, 'CrawlerTestLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'crawler-test.handler',
      code: lambda.Code.fromAsset('lambda/crawler-test'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      role: bedrockManagerRole,
      environment: {
        BEDROCK_MANAGER_FUNCTION: bedrockManagerLambda.functionName,
      },
    });

    // Grant invoke permissions
    bedrockManagerLambda.grantInvoke(crawlerTestLambda);

    // EventBridge rule for weekly crawling (disabled by default)
    const weeklySchedule = new events.Rule(this, 'WeeklyCrawlSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        weekDay: 'SUN',
      }),
      enabled: false, // Start disabled for testing
      description: 'Weekly crawl of diabetes.org for ADA Clara'
    });

    weeklySchedule.addTarget(new targets.LambdaFunction(crawlerTestLambda, {
      event: events.RuleTargetInput.fromObject({
        action: 'sync',
        source: 'eventbridge'
      })
    }));

    // Output important values
    this.knowledgeBaseId = 'TBD'; // Will be set by Lambda function
    this.dataSourceId = 'TBD'; // Will be set by Lambda function
  }
}