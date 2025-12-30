#!/usr/bin/env node

/**
 * Deploy API Only - Simple Test
 * 
 * This script deploys just the unified API with minimal dependencies for testing.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

class SimpleApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a simple test Lambda function
    const testFunction = new lambda.Function(this, 'TestFunction', {
      functionName: 'ada-clara-test-function',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: JSON.stringify({
              message: 'ADA Clara API is working!',
              timestamp: new Date().toISOString(),
              path: event.path,
              method: event.httpMethod
            })
          };
        };
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'AdaClaraTestAPI', {
      restApiName: 'ada-clara-test-api',
      description: 'ADA Clara Test API - Basic functionality test',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key']
      }
    });

    // Create Lambda integration
    const testIntegration = new apigateway.LambdaIntegration(testFunction, {
      proxy: true
    });

    // Add test endpoints
    const testResource = this.api.root.addResource('test');
    testResource.addMethod('GET', testIntegration);
    testResource.addMethod('POST', testIntegration);

    // Add health check
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            service: 'ada-clara-test-api',
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
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'ADA Clara Test API URL',
      exportName: 'ADA-Clara-Test-API-URL'
    });

    new cdk.CfnOutput(this, 'TestEndpoint', {
      value: `${this.api.url}test`,
      description: 'Test endpoint URL'
    });

    new cdk.CfnOutput(this, 'HealthEndpoint', {
      value: `${this.api.url}health`,
      description: 'Health check endpoint URL'
    });
  }
}

async function deployApiOnly() {
  console.log('🚀 Starting API-only deployment...');

  const app = new cdk.App();

  // Environment configuration
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  };

  console.log(`📍 Deploying to account: ${env.account}, region: ${env.region}`);

  try {
    // Deploy simple API stack
    console.log('🌐 Deploying Simple API stack...');
    const apiStack = new SimpleApiStack(app, 'AdaClaraSimpleAPI', {
      env,
      description: 'ADA Clara Simple API - Basic functionality test'
    });

    console.log('✅ Simple API stack defined successfully');
    console.log('📋 Available endpoints:');
    console.log('  GET  /test - Test endpoint');
    console.log('  POST /test - Test endpoint');
    console.log('  GET  /health - Health check');
    console.log('');
    console.log('📝 After deployment, test with:');
    console.log('  curl https://YOUR_API_URL/health');
    console.log('  curl https://YOUR_API_URL/test');

  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run deployment setup
deployApiOnly().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});