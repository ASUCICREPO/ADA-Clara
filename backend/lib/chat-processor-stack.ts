import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * Chat Processor Stack for ADA Clara Chatbot
 * Deploys the chat processing Lambda function with API Gateway
 */
export class AdaClaraChatProcessorStack extends Stack {
  public readonly chatFunction: lambda.Function;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Group for the Lambda function
    const chatLogGroup = new logs.LogGroup(this, 'ChatProcessorLogGroup', {
      logGroupName: '/aws/lambda/ada-clara-chat-processor',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Chat Processing Lambda Function
    this.chatFunction = new lambda.Function(this, 'ChatProcessorFunction', {
      functionName: 'ada-clara-chat-processor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-processor'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: chatLogGroup,
      environment: {
        CHAT_SESSIONS_TABLE: 'ada-clara-chat-sessions',
        PROFESSIONAL_MEMBERS_TABLE: 'ada-clara-professional-members',
        ANALYTICS_TABLE: 'ada-clara-analytics',
        AUDIT_LOGS_TABLE: 'ada-clara-audit-logs',
        USER_PREFERENCES_TABLE: 'ada-clara-user-preferences',
        ESCALATION_QUEUE_TABLE: 'ada-clara-escalation-queue',
        KNOWLEDGE_CONTENT_TABLE: 'ada-clara-knowledge-content',
        CONTENT_BUCKET: 'ada-clara-content-minimal-023336033519-us-east-1',
        VECTORS_BUCKET: 'ada-clara-vectors-minimal-023336033519-us-east-1'
      }
    });

    // Grant DynamoDB permissions
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/ada-clara-*/index/*`
      ]
    }));

    // Grant S3 permissions
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        'arn:aws:s3:::ada-clara-content-minimal-*',
        'arn:aws:s3:::ada-clara-content-minimal-*/*',
        'arn:aws:s3:::ada-clara-vectors-minimal-*',
        'arn:aws:s3:::ada-clara-vectors-minimal-*/*'
      ]
    }));

    // Grant Bedrock permissions
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: ['*']
    }));

    // Grant Comprehend permissions
    this.chatFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'comprehend:DetectDominantLanguage',
        'comprehend:DetectSentiment'
      ],
      resources: ['*']
    }));

    // API Gateway
    this.api = new apigateway.RestApi(this, 'ChatProcessorApi', {
      restApiName: 'ADA Clara Chat API',
      description: 'API for ADA Clara chatbot interactions',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // Chat endpoint
    const chatResource = this.api.root.addResource('chat');
    const chatIntegration = new apigateway.LambdaIntegration(this.chatFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    chatResource.addMethod('POST', chatIntegration);
    chatResource.addMethod('GET', chatIntegration); // For health checks

    // Health endpoint
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', chatIntegration);

    // Outputs
    new CfnOutput(this, 'ChatFunctionName', {
      value: this.chatFunction.functionName,
      description: 'Name of the chat processing Lambda function',
      exportName: `AdaClara-${this.stackName}-ChatFunction`
    });

    new CfnOutput(this, 'ChatFunctionArn', {
      value: this.chatFunction.functionArn,
      description: 'ARN of the chat processing Lambda function',
      exportName: `AdaClara-${this.stackName}-ChatFunctionArn`
    });

    new CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'URL of the API Gateway for chat interactions',
      exportName: `AdaClara-${this.stackName}-ApiUrl`
    });

    new CfnOutput(this, 'ChatEndpoint', {
      value: `${this.api.url}chat`,
      description: 'Chat endpoint URL',
      exportName: `AdaClara-${this.stackName}-ChatEndpoint`
    });

    new CfnOutput(this, 'HealthEndpoint', {
      value: `${this.api.url}health`,
      description: 'Health check endpoint URL',
      exportName: `AdaClara-${this.stackName}-HealthEndpoint`
    });
  }
}