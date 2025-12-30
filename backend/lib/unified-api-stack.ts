import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface UnifiedApiStackProps extends cdk.StackProps {
  chatFunction: lambda.Function;
  ragFunction: lambda.Function;
  adminFunction?: lambda.Function; // Make optional
  authFunction?: lambda.Function; // Make optional
  membershipFunction?: lambda.Function; // Make optional
  domainName?: string;
  certificateArn?: string;
}

export class UnifiedApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: UnifiedApiStackProps) {
    super(scope, id, props);

    // Create unified API Gateway
    this.api = new apigateway.RestApi(this, 'UnifiedAPI', {
      restApiName: `ada-clara-unified-api-${this.account}`,
      description: 'ADA Clara Unified API Gateway - All endpoints in one place',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent'
        ],
        allowCredentials: true
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true
      }
    });

    // Create Lambda integrations
    const chatIntegration = new apigateway.LambdaIntegration(props.chatFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
      proxy: true
    });

    const ragIntegration = new apigateway.LambdaIntegration(props.ragFunction, {
      proxy: true
    });

    const adminIntegration = props.adminFunction ? new apigateway.LambdaIntegration(props.adminFunction, {
      proxy: true
    }) : undefined;

    const authIntegration = props.authFunction ? new apigateway.LambdaIntegration(props.authFunction, {
      proxy: true
    }) : undefined;

    const membershipIntegration = props.membershipFunction ? new apigateway.LambdaIntegration(props.membershipFunction, {
      proxy: true
    }) : undefined;

    // ===== HEALTH CHECK ENDPOINT =====
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            timestamp: '$context.requestTime',
            version: '1.0.0',
            service: 'ada-clara-unified-api'
          })
        }
      }],
      requestTemplates: {
        'application/json': '{"statusCode": 200}'
      }
    }), {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        }
      }]
    });

    // ===== AUTHENTICATION ENDPOINTS (if auth functions available) =====
    if (authIntegration) {
      const authResource = this.api.root.addResource('auth');
      
      // JWT validation and user context
      authResource.addMethod('GET', authIntegration); // GET /auth - get user context
      authResource.addMethod('POST', authIntegration); // POST /auth - validate token
      
      // User context endpoint
      const userResource = authResource.addResource('user');
      userResource.addMethod('GET', authIntegration);
      
      // Auth health check
      const authHealthResource = authResource.addResource('health');
      authHealthResource.addMethod('GET', authIntegration);
      
      // Professional verification endpoint (if membership function available)
      if (membershipIntegration) {
        const verifyResource = authResource.addResource('verify-professional');
        verifyResource.addMethod('POST', membershipIntegration);
      }
    }

    // ===== CHAT ENDPOINTS =====
    const chatResource = this.api.root.addResource('chat');
    
    // Main chat endpoint
    chatResource.addMethod('POST', chatIntegration);
    chatResource.addMethod('GET', chatIntegration); // For health checks
    
    // Chat history endpoints
    const historyResource = chatResource.addResource('history');
    historyResource.addMethod('GET', chatIntegration); // GET /chat/history - all user sessions
    
    const sessionHistoryResource = historyResource.addResource('{sessionId}');
    sessionHistoryResource.addMethod('GET', chatIntegration); // GET /chat/history/{sessionId}
    
    // User sessions endpoint
    const sessionsResource = chatResource.addResource('sessions');
    sessionsResource.addMethod('GET', chatIntegration); // GET /chat/sessions

    // ===== RAG/QUERY ENDPOINTS =====
    const queryResource = this.api.root.addResource('query');
    queryResource.addMethod('POST', ragIntegration);
    queryResource.addMethod('GET', ragIntegration); // For health checks

    // ===== ADMIN ENDPOINTS (CONDITIONAL) =====
    if (adminIntegration) {
      const adminResource = this.api.root.addResource('admin');
      
      // Dashboard endpoint
      const dashboardResource = adminResource.addResource('dashboard');
      dashboardResource.addMethod('GET', adminIntegration);
      
      // Conversations endpoint
      const conversationsResource = adminResource.addResource('conversations');
      conversationsResource.addMethod('GET', adminIntegration);
      
      // Specific conversation endpoint
      const conversationDetailResource = conversationsResource.addResource('{conversationId}');
      conversationDetailResource.addMethod('GET', adminIntegration);
      
      // Questions endpoint
      const questionsResource = adminResource.addResource('questions');
      questionsResource.addMethod('GET', adminIntegration);
      
      // Enhanced questions endpoint
      const questionsEnhancedResource = questionsResource.addResource('enhanced');
      questionsEnhancedResource.addMethod('GET', adminIntegration);
      
      // Question ranking endpoint
      const questionsRankingResource = questionsResource.addResource('ranking');
      questionsRankingResource.addMethod('GET', adminIntegration);
      
      // Escalations endpoint
      const escalationsResource = adminResource.addResource('escalations');
      escalationsResource.addMethod('GET', adminIntegration);
      
      // Escalation triggers endpoint
      const escalationTriggersResource = escalationsResource.addResource('triggers');
      escalationTriggersResource.addMethod('GET', adminIntegration);
      
      // Escalation reasons endpoint
      const escalationReasonsResource = escalationsResource.addResource('reasons');
      escalationReasonsResource.addMethod('GET', adminIntegration);
      
      // Real-time metrics endpoint
      const realtimeResource = adminResource.addResource('realtime');
      realtimeResource.addMethod('GET', adminIntegration);
      
      // Chat history endpoint (admin view)
      const chatHistoryResource = adminResource.addResource('chat-history');
      chatHistoryResource.addMethod('GET', adminIntegration);
      
      // Admin health endpoint
      const adminHealthResource = adminResource.addResource('health');
      adminHealthResource.addMethod('GET', adminIntegration);
    }

    // ===== CUSTOM DOMAIN (OPTIONAL) =====
    if (props.domainName && props.certificateArn) {
      const domainName = new apigateway.DomainName(this, 'ApiDomainName', {
        domainName: props.domainName,
        certificate: cdk.aws_certificatemanager.Certificate.fromCertificateArn(
          this, 'ApiCertificate', props.certificateArn
        ),
        endpointType: apigateway.EndpointType.REGIONAL
      });

      new apigateway.BasePathMapping(this, 'ApiBasePathMapping', {
        domainName: domainName,
        restApi: this.api,
        basePath: 'api'
      });

      this.apiUrl = `https://${props.domainName}/api`;
    } else {
      this.apiUrl = this.api.url;
    }

    // ===== OUTPUTS =====
    new cdk.CfnOutput(this, 'UnifiedApiUrl', {
      value: this.apiUrl,
      description: 'Unified API Gateway URL',
      exportName: `${this.stackName}-ApiUrl`
    });

    new cdk.CfnOutput(this, 'UnifiedApiId', {
      value: this.api.restApiId,
      description: 'Unified API Gateway ID',
      exportName: `${this.stackName}-ApiId`
    });

    new cdk.CfnOutput(this, 'UnifiedApiArn', {
      value: this.api.arnForExecuteApi(),
      description: 'Unified API Gateway ARN for security policies',
      exportName: `${this.stackName}-ApiArn`
    });

    // ===== CLOUDWATCH DASHBOARD =====
    const dashboard = new cdk.aws_cloudwatch.Dashboard(this, 'UnifiedApiDashboard', {
      dashboardName: `ada-clara-unified-api-${this.account}`,
      widgets: [
        [
          new cdk.aws_cloudwatch.GraphWidget({
            title: 'API Gateway Requests',
            left: [
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Count',
                dimensionsMap: {
                  ApiName: this.api.restApiName
                },
                statistic: 'Sum'
              })
            ]
          }),
          new cdk.aws_cloudwatch.GraphWidget({
            title: 'API Gateway Latency',
            left: [
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Latency',
                dimensionsMap: {
                  ApiName: this.api.restApiName
                },
                statistic: 'Average'
              })
            ]
          })
        ],
        [
          new cdk.aws_cloudwatch.GraphWidget({
            title: 'API Gateway Errors',
            left: [
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: '4XXError',
                dimensionsMap: {
                  ApiName: this.api.restApiName
                },
                statistic: 'Sum'
              }),
              new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: '5XXError',
                dimensionsMap: {
                  ApiName: this.api.restApiName
                },
                statistic: 'Sum'
              })
            ]
          })
        ]
      ]
    });
  }
}