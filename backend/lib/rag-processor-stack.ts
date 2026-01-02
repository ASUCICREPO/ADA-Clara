import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface RAGProcessorStackProps extends StackProps {
  contentBucket?: s3.IBucket; // Optional - will create one if not provided
  vectorsBucket: string;
  vectorIndex: string;
  knowledgeBaseId: string; // Required - Knowledge Base ID from BedrockKnowledgeBaseStack
}

/**
 * RAG Processor Stack
 * 
 * This stack creates the RAG (Retrieval-Augmented Generation) query processing
 * Lambda function and API Gateway integration for the ADA Clara chatbot system.
 */
export class RAGProcessorStack extends Stack {
  public readonly ragFunction: lambda.Function;
  public readonly api: apigateway.RestApi;
  public readonly contentBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: RAGProcessorStackProps) {
    super(scope, id, props);

    // Create or use provided content bucket
    this.contentBucket = props.contentBucket || new s3.Bucket(this, 'RAGContentBucket', {
      bucketName: `ada-clara-rag-content-${Stack.of(this).account}-${Stack.of(this).region}`,
      versioned: true,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create RAG processing Lambda function
    this.ragFunction = new lambda.Function(this, 'RAGProcessorFunction', {
      functionName: `ada-clara-rag-processor-${Stack.of(this).region}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/rag-processor'), // New clean architecture build
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        VECTORS_BUCKET: props.vectorsBucket,
        VECTOR_INDEX: props.vectorIndex,
        CONTENT_BUCKET: this.contentBucket.bucketName,
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
        GENERATION_MODEL: 'anthropic.claude-3-sonnet-20240229-v1:0',
        CONFIDENCE_THRESHOLD: '0.95'
      },
      description: 'RAG query processing with RAGAS confidence system - Industry standard'
    });

    // Grant S3 Vectors permissions
    this.ragFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3vectors:SearchVectors',
        's3vectors:GetVector',
        's3vectors:ListVectors',
        's3vectors:GetVectorBucket',
        's3vectors:GetIndex',
        's3vectors:ListIndexes'
      ],
      resources: [
        `arn:aws:s3vectors:${Stack.of(this).region}:${Stack.of(this).account}:bucket/${props.vectorsBucket}`,
        `arn:aws:s3vectors:${Stack.of(this).region}:${Stack.of(this).account}:bucket/${props.vectorsBucket}/index/${props.vectorIndex}`,
        `arn:aws:s3vectors:${Stack.of(this).region}:${Stack.of(this).account}:bucket/${props.vectorsBucket}/*`
      ]
    }));

    // Grant Bedrock model access
    this.ragFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
        `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`
      ]
    }));

    // Grant Bedrock Agent permissions for Knowledge Base access
    this.ragFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:RetrieveAndGenerate',
        'bedrock:Retrieve'
      ],
      resources: [
        `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/${props.knowledgeBaseId}`
      ]
    }));

    // Grant content bucket read access
    this.contentBucket.grantRead(this.ragFunction);

    // Create API Gateway for RAG processing
    this.api = new apigateway.RestApi(this, 'RAGProcessorAPI', {
      restApiName: `ada-clara-rag-api-${Stack.of(this).region}`,
      description: 'API Gateway for ADA Clara RAG query processing',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token']
      }
    });

    // Create Lambda integration
    const ragIntegration = new apigateway.LambdaIntegration(this.ragFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    // Add API Gateway resources and methods
    const queryResource = this.api.root.addResource('query');
    queryResource.addMethod('POST', ragIntegration, {
      apiKeyRequired: false,
      requestValidator: new apigateway.RequestValidator(this, 'RAGRequestValidator', {
        restApi: this.api,
        validateRequestBody: true,
        requestValidatorName: 'RAG Query Validator'
      }),
      requestModels: {
        'application/json': new apigateway.Model(this, 'RAGQueryModel', {
          restApi: this.api,
          contentType: 'application/json',
          modelName: 'RAGQueryModel',
          schema: {
            type: apigateway.JsonSchemaType.OBJECT,
            properties: {
              query: {
                type: apigateway.JsonSchemaType.STRING,
                minLength: 1,
                maxLength: 1000
              },
              language: {
                type: apigateway.JsonSchemaType.STRING,
                enum: ['en', 'es']
              },
              sessionId: {
                type: apigateway.JsonSchemaType.STRING
              },
              maxResults: {
                type: apigateway.JsonSchemaType.INTEGER,
                minimum: 1,
                maximum: 10
              }
            },
            required: ['query']
          }
        })
      }
    });

    // Add health check endpoint
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            service: 'ada-clara-rag-processor',
            timestamp: '$context.requestTime'
          })
        }
      }],
      requestTemplates: {
        'application/json': '{ "statusCode": 200 }'
      }
    }), {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        }
      }]
    });

    // Outputs
    new CfnOutput(this, 'RAGProcessorFunctionName', {
      value: this.ragFunction.functionName,
      description: 'RAG Processor Lambda function name',
      exportName: `ADA-Clara-RAG-Function-${Stack.of(this).region}`
    });

    new CfnOutput(this, 'RAGProcessorFunctionArn', {
      value: this.ragFunction.functionArn,
      description: 'RAG Processor Lambda function ARN',
      exportName: `ADA-Clara-RAG-Function-ARN-${Stack.of(this).region}`
    });

    new CfnOutput(this, 'RAGAPIEndpoint', {
      value: this.api.url,
      description: 'RAG Processor API Gateway endpoint',
      exportName: `ADA-Clara-RAG-API-${Stack.of(this).region}`
    });

    new CfnOutput(this, 'RAGQueryEndpoint', {
      value: `${this.api.url}query`,
      description: 'RAG query processing endpoint',
      exportName: `ADA-Clara-RAG-Query-Endpoint-${Stack.of(this).region}`
    });

    new CfnOutput(this, 'RAGHealthEndpoint', {
      value: `${this.api.url}health`,
      description: 'RAG processor health check endpoint',
      exportName: `ADA-Clara-RAG-Health-Endpoint-${Stack.of(this).region}`
    });

    // Configuration summary
    new CfnOutput(this, 'RAGConfiguration', {
      value: JSON.stringify({
        vectorStore: 'S3_VECTORS',
        embeddingModel: 'amazon.titan-embed-text-v2:0',
        generationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
        maxQueryLength: 1000,
        maxResults: 10,
        timeout: '5 minutes',
        memorySize: '1024 MB',
        languages: ['en', 'es'],
        accuracyTarget: '>95%'
      }),
      description: 'RAG processor configuration summary'
    });
  }
}