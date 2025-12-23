import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index } from 'cdk-s3-vectors';

export class S3VectorsBucketOnlyStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;

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