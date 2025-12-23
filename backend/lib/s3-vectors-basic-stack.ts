import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class S3VectorsBasicStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for storing raw scraped content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      versioned: true,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For testing - change for production
    });

    // S3 bucket for vectors - S3 Vectors will be enabled after deployment
    this.vectorsBucket = new s3.Bucket(this, 'VectorsBucket', {
      versioned: false,
      lifecycleRules: [{
        id: 'DeleteOldEmbeddings',
        expiration: Duration.days(180), // Keep vectors longer
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For testing - change for production
    });
  }
}