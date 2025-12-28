import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index } from 'cdk-s3-vectors';

/**
 * S3 Vectors GA Stack
 * 
 * This stack creates S3 Vectors infrastructure using GA (General Availability) APIs
 * with enhanced features including:
 * - 2 billion vectors per index (40x improvement from preview)
 * - Sub-100ms query latency for frequent operations
 * - 1,000 vectors/second write throughput
 * - SSE-S3 encryption by default
 * - Enhanced metadata configuration (50 keys, 2KB size)
 */
export class S3VectorsGAStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly crawlerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Regular S3 bucket for storing raw scraped content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-ga-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // GA: SSE-S3 by default
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For development - change for production
    });

    // GA S3 Vectors bucket with enhanced features
    this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
      vectorBucketName: `ada-clara-vectors-ga-${this.account}-${this.region}`,
      // GA features - encryption handled at bucket level
    });

    // GA S3 Vectors index with improved scale and performance
    this.vectorIndex = new Index(this, 'VectorIndex', {
      vectorBucketName: this.vectorsBucket.vectorBucketName,
      indexName: 'ada-clara-vector-index-ga',
      dimension: 1024, // Titan V2 dimensions
      distanceMetric: 'cosine',
      dataType: 'float32',
      // GA enhancements
      metadataConfiguration: {
        // GA supports up to 50 metadata keys, but nonFilterableMetadataKeys limited to 10
        nonFilterableMetadataKeys: [
          'url', 'title', 'section', 'contentType', 
          'sourceUrl', 'sourcePage', 'chunkIndex', 'totalChunks',
          'language', 'scrapedAt'
        ],
        // GA metadata limits: 50 keys max, 2KB total size, 10 non-filterable keys max
      }
    });

    // Lambda function optimized for GA performance
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X, // Updated to Node.js 20 for better compatibility
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-ga'), // Compiled JavaScript
      timeout: Duration.minutes(15),
      memorySize: 3008, // Increased for GA throughput (1,000 vectors/second)
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        // GA-specific configuration
        GA_MODE: 'true',
        MAX_BATCH_SIZE: '100', // GA optimal batch size
        MAX_THROUGHPUT: '1000', // GA throughput limit (vectors/second)
        METADATA_SIZE_LIMIT: '2048', // GA metadata size limit (bytes)
        MAX_METADATA_KEYS: '50', // GA metadata keys limit (10 non-filterable)
      },
    });

    // Grant S3 permissions for content bucket
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    
    // Grant S3 Vectors permissions using GA L2 construct methods
    this.vectorsBucket.grantListIndexes(this.crawlerFunction);
    this.vectorIndex.grantWrite(this.crawlerFunction);
    
    // Grant GA-specific S3 Vectors permissions
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // GA API actions (updated from preview)
        's3vectors:ListVectorBuckets',
        's3vectors:GetVectorBucket',
        's3vectors:ListIndexes', // GA uses 'ListIndexes' not 'ListIndices'
        's3vectors:GetIndex', // GA uses 'GetIndex' not 'DescribeIndex'
        's3vectors:PutVectors', // GA batch API
        's3vectors:GetVectors',
        's3vectors:QueryVectors', // GA search API
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
      ],
      resources: ['*'], // S3 Vectors requires wildcard for some operations
    }));
    
    // Grant additional S3 permissions for vectors bucket
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:GetBucketVersioning',
      ],
      resources: [
        this.vectorsBucket.vectorBucketArn,
        `${this.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));
    
    // Grant Bedrock permissions for embeddings
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
      ],
    }));

    // Grant CloudWatch permissions for GA monitoring
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // Outputs for GA infrastructure
    new CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'Name of the S3 bucket for storing raw content (GA)'
    });

    new CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'Name of the S3 Vectors bucket (GA)'
    });

    new CfnOutput(this, 'VectorIndexName', {
      value: this.vectorIndex.indexName,
      description: 'Name of the S3 Vectors index (GA)'
    });

    new CfnOutput(this, 'CrawlerFunctionName', {
      value: this.crawlerFunction.functionName,
      description: 'Name of the GA-optimized crawler Lambda function'
    });

    new CfnOutput(this, 'VectorsBucketArn', {
      value: this.vectorsBucket.vectorBucketArn,
      description: 'ARN of the S3 Vectors bucket (GA)'
    });

    new CfnOutput(this, 'VectorIndexArn', {
      value: this.vectorIndex.indexArn,
      description: 'ARN of the S3 Vectors index (GA)'
    });

    // GA-specific outputs
    new CfnOutput(this, 'GAFeatures', {
      value: JSON.stringify({
        maxVectorsPerIndex: '2,000,000,000',
        maxThroughput: '1,000 vectors/second',
        queryLatency: 'sub-100ms for frequent queries',
        metadataKeys: '50 max',
        metadataSize: '2KB max',
        encryption: 'SSE-S3'
      }),
      description: 'GA feature capabilities'
    });
  }
}