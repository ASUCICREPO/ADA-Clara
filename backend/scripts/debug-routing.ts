#!/usr/bin/env ts-node

/**
 * Debug routing for Task 9 endpoints
 */

import { handler } from '../lambda/admin-analytics/index';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

async function testRoute(path: string, method: string = 'GET'): Promise<void> {
  console.log(`\n🔍 Testing route: ${method} ${path}`);
  
  const event: APIGatewayProxyEvent = {
    httpMethod: method,
    path: path,
    queryStringParameters: { startDate: '2024-01-01', endDate: '2024-01-31' },
    headers: { 'Content-Type': 'application/json' },
    body: null,
    isBase64Encoded: false,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      stage: 'test',
      httpMethod: method,
      path: path,
      protocol: 'HTTP/1.1',
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: '127.0.0.1', userAgent: 'test-agent' } as any,
      accountId: 'test-account',
      apiId: 'test-api',
      resourceId: 'test-resource',
      resourcePath: path
    } as any,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    resource: path
  };

  const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  };

  try {
    const result = await handler(event, context);
    console.log(`   Status: ${result.statusCode}`);
    
    if (result.statusCode === 200) {
      const body = JSON.parse(result.body);
      console.log(`   Success: ${body.success}`);
    } else {
      const body = JSON.parse(result.body);
      console.log(`   Error: ${body.error}`);
    }
  } catch (error) {
    console.log(`   Exception: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Debug routing for Task 9 endpoints');
  
  const routes = [
    '/admin/dashboard',
    '/admin/conversations',
    '/admin/questions',
    '/admin/realtime',
    '/admin/health',
    '/admin/escalations',
    '/admin/questions/enhanced',
    '/admin/questions/ranking'
  ];
  
  for (const route of routes) {
    await testRoute(route);
  }
}

if (require.main === module) {
  main().catch(console.error);
}