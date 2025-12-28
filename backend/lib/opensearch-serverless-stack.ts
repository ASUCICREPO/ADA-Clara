import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface OpenSearchServerlessStackProps extends cdk.StackProps {
  readonly environment: 'dev' | 'staging' | 'prod';
}

export class OpenSearchServerlessStack extends cdk.Stack {
  public readonly collection: opensearch.CfnCollection;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  constructor(scope: Construct, id: string, props: OpenSearchServerlessStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create network security policy for the collection
    const networkPolicy = new opensearch.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `ada-clara-network-policy-${environment}`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/ada-clara-vectors-${environment}`],
              ResourceType: 'collection'
            }
          ],
          AllowFromPublic: true
        }
      ])
    });

    // Create encryption security policy
    const encryptionPolicy = new opensearch.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `ada-clara-encryption-policy-${environment}`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            Resource: [`collection/ada-clara-vectors-${environment}`],
            ResourceType: 'collection'
          }
        ],
        AWSOwnedKey: true
      })
    });

    // Create the OpenSearch Serverless collection
    this.collection = new opensearch.CfnCollection(this, 'VectorCollection', {
      name: `ada-clara-vectors-${environment}`,
      type: 'VECTORSEARCH',
      description: 'Vector collection for ADA Clara chatbot knowledge base',
      tags: [
        {
          key: 'Project',
          value: 'ADA-Clara'
        },
        {
          key: 'Environment',
          value: environment
        },
        {
          key: 'Purpose',
          value: 'RAG-Vector-Storage'
        }
      ]
    });

    // Add dependencies
    this.collection.addDependency(networkPolicy);
    this.collection.addDependency(encryptionPolicy);

    // Create IAM role for Bedrock Knowledge Base
    const knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      roleName: `ADA-Clara-KB-Role-${environment}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Bedrock Knowledge Base to access OpenSearch Serverless',
      inlinePolicies: {
        OpenSearchServerlessAccess: new iam.PolicyDocument({
          statements: [
            // OpenSearch Serverless permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'aoss:APIAccessAll'
              ],
              resources: [this.collection.attrArn]
            }),
            // Bedrock model access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel'
              ],
              resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`
              ]
            }),
            // S3 access for data source
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:ListBucket'
              ],
              resources: [
                `arn:aws:s3:::ada-clara-content-minimal-*`,
                `arn:aws:s3:::ada-clara-content-minimal-*/*`
              ]
            })
          ]
        })
      }
    });

    // Create data access policy for the Knowledge Base role
    const dataAccessPolicy = new opensearch.CfnAccessPolicy(this, 'DataAccessPolicy', {
      name: `ada-clara-data-access-policy-${environment}`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/ada-clara-vectors-${environment}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems'
              ],
              ResourceType: 'collection'
            },
            {
              Resource: [`index/ada-clara-vectors-${environment}/*`],
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
          Principal: [knowledgeBaseRole.roleArn]
        }
      ])
    });

    // Create Bedrock Knowledge Base
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `ada-clara-kb-${environment}`,
      description: 'ADA Clara chatbot knowledge base with diabetes information',
      roleArn: knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: 1024
            }
          }
        }
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: this.collection.attrArn,
          vectorIndexName: 'ada-clara-index',
          fieldMapping: {
            vectorField: 'vector',
            textField: 'text',
            metadataField: 'metadata'
          }
        }
      },
      tags: {
        Project: 'ADA-Clara',
        Environment: environment,
        Purpose: 'RAG-Knowledge-Base'
      }
    });

    // Add dependencies for Knowledge Base
    this.knowledgeBase.addDependency(dataAccessPolicy);

    // Create data source for the Knowledge Base
    this.dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: `ada-clara-datasource-${environment}`,
      description: 'Data source for scraped diabetes.org content',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: `arn:aws:s3:::ada-clara-content-minimal-${this.account}-${this.region}`,
          inclusionPrefixes: ['processed/']
        }
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20
          }
        }
      }
    });

    // Output important values
    new cdk.CfnOutput(this, 'CollectionArn', {
      value: this.collection.attrArn,
      description: 'OpenSearch Serverless Collection ARN',
      exportName: `ADA-Clara-Collection-ARN-${environment}`
    });

    new cdk.CfnOutput(this, 'CollectionEndpoint', {
      value: this.collection.attrCollectionEndpoint,
      description: 'OpenSearch Serverless Collection Endpoint',
      exportName: `ADA-Clara-Collection-Endpoint-${environment}`
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.attrKnowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
      exportName: `ADA-Clara-KB-ID-${environment}`
    });

    new cdk.CfnOutput(this, 'DataSourceId', {
      value: this.dataSource.attrDataSourceId,
      description: 'Bedrock Data Source ID',
      exportName: `ADA-Clara-DataSource-ID-${environment}`
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseArn', {
      value: this.knowledgeBase.attrKnowledgeBaseArn,
      description: 'Bedrock Knowledge Base ARN',
      exportName: `ADA-Clara-KB-ARN-${environment}`
    });

    // Cost monitoring outputs
    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: '$356-700 (2-4 OCUs + storage)',
      description: 'Estimated monthly cost for OpenSearch Serverless'
    });
  }
}