import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class S3VectorsSimpleStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: s3.Bucket;
  public readonly crawlerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for storing raw scraped content (regular S3 bucket)
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-${this.account}-${this.region}`,
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
      bucketName: `ada-clara-vectors-${this.account}-${this.region}`,
      versioned: false,
      lifecycleRules: [{
        id: 'DeleteOldEmbeddings',
        expiration: Duration.days(180), // Keep vectors longer
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For testing - change for production
    });

    // Lambda function for custom web crawling and S3 Vectors processing
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 's3-vectors-crawler.handler',
      code: lambda.Code.fromAsset('lambda/s3-vectors-crawler'),
      timeout: Duration.minutes(15),
      memorySize: 2048,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.bucketName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v1',
      },
    });

    // Grant S3 permissions for both buckets
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    this.vectorsBucket.grantReadWrite(this.crawlerFunction);
    
    // Grant S3 Vectors specific permissions (for when we enable S3 Vectors)
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:SearchVectors',
        's3:CreateVectorIndex',
        's3:DeleteVectorIndex',
        's3:DescribeVectorIndex',
        's3:ListVectorIndices',
      ],
      resources: [
        this.vectorsBucket.bucketArn,
        `${this.vectorsBucket.bucketArn}/*`,
      ],
    }));
    
    // Grant Bedrock permissions
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));
  }
}