import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Bucket, Index } from 'cdk-s3-vectors';
import { AdaClaraDynamoDBStack } from './dynamodb-stack';

/**
 * Simplified S3 Vectors Stack
 * 
 * This is a simplified version without EventBridge scheduling to avoid circular dependencies.
 * EventBridge can be added later as a separate stack if needed.
 */

interface S3VectorsSimpleStackProps extends StackProps {
  dynamoDBStack?: AdaClaraDynamoDBStack;
}

export class S3VectorsSimpleStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: Bucket;
  public readonly vectorIndex: Index;
  public readonly crawlerFunction: lambda.Function;
  public readonly kbTestFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: S3VectorsSimpleStackProps) {
    super(scope, id, props);

    console.log('🚀 Starting S3VectorsSimpleStack construction...');

    // Regular S3 bucket for storing raw scraped content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-simple-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    console.log('🔍 Creating S3 Vectors bucket...');
    
    // S3 Vectors bucket
    this.vectorsBucket = new Bucket(this, 'VectorsBucket', {
      vectorBucketName: `ada-clara-vectors-simple-${this.account}-${this.region}`,
    });
    console.log('✅ S3 Vectors bucket created successfully');

    // S3 Vectors index
    this.vectorIndex = new Index(this, 'VectorIndex', {
      vectorBucketName: this.vectorsBucket.vectorBucketName,
      indexName: 'ada-clara-vector-index-simple',
      dimension: 1024, // Titan V2 dimensions
      distanceMetric: 'cosine',
      dataType: 'float32',
      metadataConfiguration: {
        nonFilterableMetadataKeys: [
          'url', 'title', 'section', 'contentType', 
          'sourceUrl', 'sourcePage', 'chunkIndex', 'totalChunks'
        ]
      }
    });
    console.log('✅ S3 Vectors index created successfully');

    // Create CloudWatch Log Group
    const crawlerLogGroup = new logs.LogGroup(this, 'CrawlerFunctionLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-crawler-simple',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Lambda function for crawling
    this.crawlerFunction = new lambda.Function(this, 'CrawlerFunction', {
      functionName: 'ada-clara-crawler-simple',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-ga'),
      timeout: Duration.minutes(15),
      memorySize: 3008,
      logGroup: crawlerLogGroup,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        MAX_CONCURRENT_REQUESTS: '10',
        CHUNK_SIZE: '1000',
        CHUNK_OVERLAP: '200'
      }
    });

    // Grant S3 permissions for content bucket
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    
    // Grant S3 Vectors permissions
    this.vectorsBucket.grantListIndexes(this.crawlerFunction);
    this.vectorIndex.grantWrite(this.crawlerFunction);
    
    // Grant additional S3 permissions for vectors bucket
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
    
    // Grant Bedrock permissions for embeddings
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: ['arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0']
    }));

    // Grant CloudWatch permissions
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    // Grant DynamoDB permissions if stack is provided
    if (props?.dynamoDBStack) {
      try {
        props.dynamoDBStack.contentTrackingTable.grantReadWriteData(this.crawlerFunction);
        this.crawlerFunction.addEnvironment('CONTENT_TRACKING_TABLE', props.dynamoDBStack.contentTrackingTable.tableName);
        console.log('✅ DynamoDB permissions added');
      } catch (error) {
        console.log('⚠️ Could not add DynamoDB permissions:', error);
      }
    }

    // KB Test Function (simplified)
    this.kbTestFunction = new lambda.Function(this, 'KBTestFunction', {
      functionName: 'ada-clara-kb-test-simple',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-kb-ga'),
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        VECTORS_BUCKET: this.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: this.vectorIndex.indexName,
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0'
      }
    });

    // Grant KB test function permissions
    this.vectorsBucket.grantListIndexes(this.kbTestFunction);
    // Note: Index doesn't have grantRead method, using bucket permissions instead
    
    this.kbTestFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:ListBucket',
      ],
      resources: [
        this.vectorsBucket.vectorBucketArn,
        `${this.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));
    
    this.kbTestFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: ['arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0']
    }));

    console.log('✅ S3VectorsSimpleStack construction completed successfully');

    // Outputs
    new CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'Name of the content storage bucket',
      exportName: `AdaClara-${this.stackName}-ContentBucket`
    });

    new CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'Name of the S3 Vectors bucket',
      exportName: `AdaClara-${this.stackName}-VectorsBucket`
    });

    new CfnOutput(this, 'VectorIndexName', {
      value: this.vectorIndex.indexName,
      description: 'Name of the S3 Vectors index',
      exportName: `AdaClara-${this.stackName}-VectorIndex`
    });

    new CfnOutput(this, 'CrawlerFunctionName', {
      value: this.crawlerFunction.functionName,
      description: 'Name of the crawler Lambda function',
      exportName: `AdaClara-${this.stackName}-CrawlerFunction`
    });

    new CfnOutput(this, 'CrawlerFunctionArn', {
      value: this.crawlerFunction.functionArn,
      description: 'ARN of the crawler Lambda function',
      exportName: `AdaClara-${this.stackName}-CrawlerFunctionArn`
    });
  }
}