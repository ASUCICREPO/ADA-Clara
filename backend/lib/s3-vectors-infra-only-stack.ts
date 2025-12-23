import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index, KnowledgeBase } from 'cdk-s3-vectors';

export class S3VectorsInfraOnlyStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly knowledgeBase: KnowledgeBase;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Regular S3 bucket for storing raw scraped content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-v2-${this.account}-${this.region}`,
      versioned: true,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For testing - change for production
    });

    // S3 Vectors bucket using the official L2 construct
    this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
      vectorBucketName: `ada-clara-vectors-v2-${this.account}-${this.region}`,
    });

    // S3 Vectors index using the official L2 construct
    this.vectorIndex = new Index(this, 'VectorIndex', {
      vectorBucketName: this.vectorsBucket.vectorBucketName,
      indexName: 'ada-clara-vector-index',
      dimension: 1536, // Titan Embed Text v1 dimensions
      distanceMetric: 'cosine',
      dataType: 'float32',
      metadataConfiguration: {
        nonFilterableMetadataKeys: ['url', 'title', 'section', 'contentType', 'sourceUrl', 'sourcePage']
      }
    });

    // Create Knowledge Base using the L2 construct
    this.knowledgeBase = new KnowledgeBase(this, 'AdaClaraKnowledgeBase', {
      knowledgeBaseName: 'ada-clara-diabetes-kb',
      description: 'Knowledge Base for ADA Clara diabetes information using S3 Vectors',
      vectorBucketArn: this.vectorsBucket.vectorBucketArn,
      indexArn: this.vectorIndex.indexArn,
      knowledgeBaseConfiguration: {
        embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1',
        embeddingDataType: 'FLOAT32'
        // Note: Titan Embed Text v1 doesn't support configurable dimensions, so we omit the dimensions parameter
      }
    });

    // Outputs
    new CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'Name of the S3 bucket for storing raw content'
    });

    new CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'Name of the S3 Vectors bucket'
    });

    new CfnOutput(this, 'VectorIndexName', {
      value: this.vectorIndex.indexName,
      description: 'Name of the S3 Vectors index'
    });

    new CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.knowledgeBaseId,
      description: 'ID of the Bedrock Knowledge Base'
    });

    new CfnOutput(this, 'VectorsBucketArn', {
      value: this.vectorsBucket.vectorBucketArn,
      description: 'ARN of the S3 Vectors bucket'
    });

    new CfnOutput(this, 'VectorIndexArn', {
      value: this.vectorIndex.indexArn,
      description: 'ARN of the S3 Vectors index'
    });
  }
}