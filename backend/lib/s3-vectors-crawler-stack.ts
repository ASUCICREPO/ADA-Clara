import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class S3VectorsCrawlerStack extends Stack {
  public readonly contentBucket: s3.Bucket;
  public readonly vectorsBucket: s3.Bucket;
  public readonly crawlerFunction: lambda.Function;
  public readonly kbManagerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for storing raw scraped content
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

    // S3 bucket for vector embeddings with S3 Vectors capabilities
    this.vectorsBucket = new s3.Bucket(this, 'VectorsBucket', {
      bucketName: `ada-clara-vectors-${this.account}-${this.region}`,
      versioned: false,
      lifecycleRules: [{
        id: 'DeleteOldEmbeddings',
        expiration: Duration.days(180), // Keep vectors longer
      }],
      removalPolicy: RemovalPolicy.DESTROY, // For testing - change for production
    });

    // Enable S3 Vectors on the bucket (using L1 construct for latest features)
    const cfnVectorsBucket = this.vectorsBucket.node.defaultChild as s3.CfnBucket;
    cfnVectorsBucket.addPropertyOverride('VectorConfiguration', {
      VectorIndexName: 'ada-clara-vector-index',
      Dimensions: 1536, // Titan Embed Text v1 dimensions
      SimilarityMetric: 'COSINE',
      VectorField: 'vector',
      MetadataFields: ['url', 'title', 'section', 'contentType', 'sourceUrl', 'sourcePage']
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

    // Lambda function for Knowledge Base management
    this.kbManagerFunction = new lambda.Function(this, 'KBManagerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'kb-manager.handler',
      code: lambda.Code.fromAsset('lambda/kb-manager'),
      timeout: Duration.minutes(10),
      memorySize: 512,
      environment: {
        CONTENT_BUCKET: this.contentBucket.bucketName,
        VECTORS_BUCKET: this.vectorsBucket.bucketName,
        CRAWLER_FUNCTION: this.crawlerFunction.functionName,
      },
    });

    // Grant S3 permissions including S3 Vectors capabilities
    this.contentBucket.grantReadWrite(this.crawlerFunction);
    this.vectorsBucket.grantReadWrite(this.crawlerFunction);
    this.contentBucket.grantReadWrite(this.kbManagerFunction);
    this.vectorsBucket.grantReadWrite(this.kbManagerFunction);
    
    // Grant S3 Vectors specific permissions
    const s3VectorsPolicy = new iam.PolicyStatement({
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
    });
    
    this.crawlerFunction.addToRolePolicy(s3VectorsPolicy);
    this.kbManagerFunction.addToRolePolicy(s3VectorsPolicy);
    
    // Grant Bedrock permissions to crawler
    this.crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    // Grant Bedrock permissions to KB manager
    this.kbManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:CreateKnowledgeBase',
        'bedrock:GetKnowledgeBase',
        'bedrock:UpdateKnowledgeBase',
        'bedrock:ListKnowledgeBases',
        'bedrock:CreateDataSource',
        'bedrock:GetDataSource',
        'bedrock:UpdateDataSource',
        'bedrock:ListDataSources',
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
        'bedrock:ListIngestionJobs',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
      ],
      resources: ['*'],
    }));

    // Grant invoke permissions (KB manager can invoke crawler)
    this.crawlerFunction.grantInvoke(this.kbManagerFunction);
  }
}