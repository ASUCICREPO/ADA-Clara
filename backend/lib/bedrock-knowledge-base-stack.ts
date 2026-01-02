import { Stack, StackProps, Duration, CfnOutput, PhysicalName } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { CfnKnowledgeBase, CfnDataSource } from 'aws-cdk-lib/aws-bedrock';
import { Bucket, Index } from 'cdk-s3-vectors';

export interface BedrockKnowledgeBaseProps extends StackProps {
  contentBucket: s3.Bucket;
  vectorsBucket: Bucket;
  vectorIndex: Index; // Required - we'll create the index that KB will use
}

/**
 * Bedrock Knowledge Base GA Stack
 * 
 * This stack creates infrastructure to test S3 Vectors GA integration
 * with Bedrock services. Since direct S3 Vectors support in Knowledge Base
 * may not be fully available in CDK yet, this focuses on testing the
 * GA S3 Vectors functionality that will integrate with Knowledge Base.
 */
export class BedrockKnowledgeBaseStack extends Stack {
  public readonly knowledgeBaseRole: iam.Role;
  public readonly knowledgeBase: CfnKnowledgeBase;
  public readonly dataSource: CfnDataSource;
  public readonly testFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: BedrockKnowledgeBaseProps) {
    super(scope, id, props);

    // Environment-based configuration
    const environment = this.node.tryGetContext('environment') || 'development';
    const bucketSuffix = environment === 'production' ? '' : '-dev';

    // IAM role for Knowledge Base with S3 Vectors - enhanced permissions based on AWS docs
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      roleName: `AdaClaraKBRole-${Stack.of(this).region}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for Bedrock Knowledge Base with S3 Vectors access',
    });

    // Grant access to content bucket
    props.contentBucket.grantRead(this.knowledgeBaseRole);

    // Grant S3 Vectors permissions - use wildcards as required by S3 Vectors service
    // The S3 Vectors service requires broad permissions with wildcard resources
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:*',
      ],
      resources: ['*'],
    }));

    // Also grant specific S3 Vectors permissions for the exact resources
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:QueryVectors',
        's3vectors:GetVectors',
        's3vectors:ListVectors',
        's3vectors:SearchVectors',
        's3vectors:GetIndex',
        's3vectors:ListIndexes',
        's3vectors:GetVectorBucket',
        's3vectors:ListVectorBuckets',
      ],
      resources: [
        props.vectorsBucket.vectorBucketArn,
        props.vectorIndex!.indexArn,
        `${props.vectorIndex!.indexArn}/*`,
      ],
    }));

    // Additional S3 bucket permissions for vectors storage
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        props.vectorsBucket.vectorBucketArn,
        `${props.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));

    // Grant Bedrock model access
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0',
      ],
    }));

    // Grant AWS KMS permissions as mentioned in the documentation
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:Decrypt',
        'kms:GenerateDataKey',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'kms:ViaService': [`s3.${this.region}.amazonaws.com`]
        }
      }
    }));

    // Try using CfnKnowledgeBase directly with minimal configuration to avoid schema conflicts
    this.knowledgeBase = new CfnKnowledgeBase(this, 'AdaClaraKnowledgeBase', {
      name: 'ada-clara-diabetes-kb',
      description: 'ADA Clara Diabetes Knowledge Base with S3 Vectors backend',
      roleArn: this.knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0',
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: 1024,
              embeddingDataType: 'FLOAT32'
            }
          }
        }
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          vectorBucketArn: props.vectorsBucket.vectorBucketArn,
          indexArn: props.vectorIndex!.indexArn
        }
      }
    });

    // Ensure Knowledge Base is created after IAM role and policies are ready
    this.knowledgeBase.node.addDependency(this.knowledgeBaseRole);

    // Create Data Source using CfnDataSource
    this.dataSource = new CfnDataSource(this, 'AdaClaraDataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: 'diabetes-org-content',
      description: 'Diabetes.org content source for ADA Clara Knowledge Base',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.contentBucket.bucketArn,
          inclusionPrefixes: ['diabetes-content/']
        }
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 20
          }
        }
      }
    });

    // Test function for GA S3 Vectors integration validation
    this.testFunction = new lambda.Function(this, 'GAIntegrationTestFunction', {
      functionName: `AdaClaraKBGATest-${Stack.of(this).region}${bucketSuffix}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('src/handlers/bedrock-kb'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment: {
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        DATA_SOURCE_ID: this.dataSource.attrDataSourceId,
        VECTORS_BUCKET: props.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: props.vectorIndex!.indexName,
        CONTENT_BUCKET: props.contentBucket.bucketName,
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        GENERATION_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
    });

    // Grant test function permissions
    props.contentBucket.grantRead(this.testFunction);
    props.vectorsBucket.grantListIndexes(this.testFunction);

    this.testFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:ListVectorBuckets',
        's3vectors:GetVectorBucket', 
        's3vectors:ListIndexes',
      ],
      resources: [
        props.vectorsBucket.vectorBucketArn,
      ],
    }));

    this.testFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:GetIndex',
        's3vectors:PutVectors',
        's3vectors:GetVectors',
        's3vectors:QueryVectors',
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
        's3vectors:SearchVectors',
      ],
      resources: [
        props.vectorIndex!.indexArn,
        `${props.vectorIndex!.indexArn}/*`,
      ],
    }));

    this.testFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
        'bedrock:ListIngestionJobs',
        'bedrock:GetKnowledgeBase',
        'bedrock:ListKnowledgeBases',
        'bedrock:GetDataSource',
        'bedrock:ListDataSources'
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0',
        this.knowledgeBase.attrKnowledgeBaseArn,
        `${this.knowledgeBase.attrKnowledgeBaseArn}/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:data-source/*`
      ],
    }));

    // Outputs
    new CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.attrKnowledgeBaseId,
      description: 'Knowledge Base ID for ADA Clara',
      exportName: 'AdaClaraKnowledgeBaseId'
    });

    new CfnOutput(this, 'DataSourceId', {
      value: this.dataSource.attrDataSourceId,
      description: 'Data Source ID for diabetes.org content',
      exportName: 'AdaClaraDataSourceId'
    });

    new CfnOutput(this, 'KnowledgeBaseArn', {
      value: this.knowledgeBase.attrKnowledgeBaseArn,
      description: 'Knowledge Base ARN for ADA Clara',
      exportName: 'AdaClaraKnowledgeBaseArn'
    });

    new CfnOutput(this, 'KnowledgeBaseRoleArn', {
      value: this.knowledgeBaseRole.roleArn,
      description: 'IAM role ARN for future Knowledge Base GA S3 Vectors integration'
    });

    new CfnOutput(this, 'GAIntegrationTestFunctionName', {
      value: this.testFunction.functionName,
      description: 'Lambda function for testing GA S3 Vectors integration'
    });

    new CfnOutput(this, 'GAIntegrationConfig', {
      value: JSON.stringify({
        vectorBackend: 'S3_VECTORS_GA',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        dimensions: 1024,
        maxResults: 100,
        queryLatency: 'sub-100ms',
        scaleLimit: '2 billion vectors',
        status: 'Ready for Knowledge Base integration when CDK support is available'
      }),
      description: 'GA S3 Vectors integration configuration'
    });
  }
}