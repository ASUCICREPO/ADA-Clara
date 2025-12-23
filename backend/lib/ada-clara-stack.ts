import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AdaClaraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 buckets
    const contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `ada-clara-content-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const vectorsBucket = new s3.Bucket(this, 'VectorsBucket', {
      bucketName: `ada-clara-vectors-${this.account}-${this.region}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Crawler Lambda
    const crawlerFunction = new lambda.Function(this, 'Crawler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 's3-vectors-crawler.handler',
      code: lambda.Code.fromAsset('lambda/s3-vectors-crawler'),
      timeout: Duration.minutes(15),
      memorySize: 2048,
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        VECTORS_BUCKET: vectorsBucket.bucketName,
        TARGET_DOMAIN: 'diabetes.org',
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v1',
      },
    });

    // KB Manager Lambda
    const kbManagerFunction = new lambda.Function(this, 'KBManager', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'kb-manager.handler',
      code: lambda.Code.fromAsset('lambda/kb-manager'),
      timeout: Duration.minutes(10),
      memorySize: 512,
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        VECTORS_BUCKET: vectorsBucket.bucketName,
        CRAWLER_FUNCTION: crawlerFunction.functionName,
      },
    });

    // Permissions
    contentBucket.grantReadWrite(crawlerFunction);
    vectorsBucket.grantReadWrite(crawlerFunction);
    contentBucket.grantReadWrite(kbManagerFunction);
    vectorsBucket.grantReadWrite(kbManagerFunction);
    
    crawlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    kbManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:CreateKnowledgeBase',
        'bedrock:GetKnowledgeBase',
        'bedrock:CreateDataSource',
        'bedrock:StartIngestionJob',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
      ],
      resources: ['*'],
    }));

    crawlerFunction.grantInvoke(kbManagerFunction);
  }
}