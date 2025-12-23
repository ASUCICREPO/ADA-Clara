import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index, KnowledgeBase } from 'cdk-s3-vectors';

export class S3VectorsStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly knowledgeBase: KnowledgeBase;
  public readonly crawlerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Regular S3 bucket for storing raw scraped content
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

    // S3 Vectors bucket using the official L2 construct
    this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
      vectorBucketName: `ada-clara-vectors-${this.account}-${this.region}`,
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

    // Lambda function for custom web crawling and S3 Vectors processing
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 's3-vectors-crawler.handler',
      code: lambda.Code.fromAsset('lambda/s3-vectors-crawler'),
      timeout: Duration.minutes(15),
      memorySize: 2048,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v1',
      },
    });

    // Grant S3 permissions for content bucket
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    
    // Grant S3 Vectors permissions using L2 construct methods
    this.vectorsBucket.grantListIndexes(this.crawlerFunction);
    this.vectorIndex.grantWrite(this.crawlerFunction);
    
    // Grant additional S3 permissions for vectors bucket (read/write objects)
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        this.vectorsBucket.vectorBucketArn,
        `${this.vectorsBucket.vectorBucketArn}/*`,
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

    // Create Knowledge Base using the L2 construct
    this.knowledgeBase = new KnowledgeBase(this, 'AdaClaraKnowledgeBase', {
      knowledgeBaseName: 'ada-clara-diabetes-kb',
      description: 'Knowledge Base for ADA Clara diabetes information using S3 Vectors',
      vectorBucketArn: this.vectorsBucket.vectorBucketArn,
      indexArn: this.vectorIndex.indexArn,
      knowledgeBaseConfiguration: {
        embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1',
        embeddingDataType: 'FLOAT32',
        dimensions: '1536'
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

    new CfnOutput(this, 'CrawlerFunctionName', {
      value: this.crawlerFunction.functionName,
      description: 'Name of the crawler Lambda function'
    });
  }
}