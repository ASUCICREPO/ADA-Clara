import { Stack, StackProps, Duration, CfnOutput, PhysicalName } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Bucket, Index } from 'cdk-s3-vectors';

export interface BedrockKnowledgeBaseProps extends StackProps {
  contentBucket: s3.Bucket;
  vectorsBucket: Bucket;
  vectorIndex: Index;
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
  public readonly testFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: BedrockKnowledgeBaseProps) {
    super(scope, id, props);

    // IAM role for future Knowledge Base integration with S3 Vectors GA
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      roleName: `AdaClaraKBGARole-${Stack.of(this).region}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for future Bedrock Knowledge Base with S3 Vectors GA access',
    });

    // Grant access to content bucket
    props.contentBucket.grantRead(this.knowledgeBaseRole);

    // Grant S3 Vectors GA permissions
    props.vectorsBucket.grantListIndexes(this.knowledgeBaseRole);

    // Additional S3 Vectors GA permissions
    this.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:ListVectorBuckets',
        's3vectors:GetVectorBucket',
        's3vectors:ListIndexes',
        's3vectors:GetIndex',
        's3vectors:PutVectors',
        's3vectors:GetVectors',
        's3vectors:QueryVectors',
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
      ],
      resources: [
        props.vectorsBucket.vectorBucketArn,
        props.vectorIndex.indexArn,
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

    // Test function for GA S3 Vectors integration validation
    this.testFunction = new lambda.Function(this, 'GAIntegrationTestFunction', {
      functionName: `AdaClaraKBGATest-${Stack.of(this).region}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/bedrock-kb'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment: {
        VECTORS_BUCKET: props.vectorsBucket.vectorBucketName,
        VECTOR_INDEX: props.vectorIndex.indexName,
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
        's3vectors:GetIndex',
        's3vectors:PutVectors',
        's3vectors:GetVectors',
        's3vectors:QueryVectors',
        's3vectors:DeleteVectors',
        's3vectors:ListVectors',
      ],
      resources: [
        props.vectorsBucket.vectorBucketArn,
        props.vectorIndex.indexArn,
        `${props.vectorsBucket.vectorBucketArn}/*`,
      ],
    }));

    this.testFunction.addToRolePolicy(new iam.PolicyStatement({
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

    // Outputs
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