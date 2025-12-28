#!/usr/bin/env ts-node

/**
 * Isolated handler test for debugging
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

// Simplified handler that only handles /admin/conversations
export const testHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('🔍 Test handler invoked:', JSON.stringify(event, null, 2));

  const path = event.path;
  const method = event.httpMethod;
  const queryParams = event.queryStringParameters || {};

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
  };

  console.log(`📍 Path: ${path}`);
  console.log(`🔧 Method: ${method}`);
  console.log(`📋 Query params:`, queryParams);

  // Handle preflight requests
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Route requests
  if (method === 'GET') {
    console.log('✅ Method is GET');
    
    if (path === '/admin/conversations') {
      console.log('✅ Path matches /admin/conversations');
      
      // Return a simple success response
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: {
            message: 'Conversation analytics endpoint reached successfully',
            path: path,
            method: method,
            queryParams: queryParams
          },
          timestamp: new Date().toISOString()
        })
      };
    } else {
      console.log(`❌ Path does not match. Expected: '/admin/conversations', Got: '${path}'`);
    }
  } else {
    console.log(`❌ Method is not GET. Got: '${method}'`);
  }

  // Route not found
  console.log('❌ Route not found');
  return {
    statusCode: 404,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      error: 'Route not found',
      debug: {
        path: path,
        method: method,
        queryParams: queryParams
      }
    })
  };
};

// Test the handler
async function testIsolatedHandler(): Promise<void> {
  console.log('🚀 Testing isolated handler');
  
  const event: APIGatewayProxyEvent = {
    httpMethod: 'GET',
    path: '/admin/conversations',
    queryStringParameters: { startDate: '2024-01-01', endDate: '2024-01-31' },
    headers: { 'Content-Type': 'application/json' },
    body: null,
    isBase64Encoded: false,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      stage: 'test',
      httpMethod: 'GET',
      path: '/admin/conversations',
      protocol: 'HTTP/1.1',
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: '127.0.0.1', userAgent: 'test-agent' } as any,
      accountId: 'test-account',
      apiId: 'test-api',
      resourceId: 'test-resource',
      resourcePath: '/admin/conversations'
    } as any,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    resource: '/admin/conversations'
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
    const result = await testHandler(event, context);
    console.log(`\n📊 Result: Status ${result.statusCode}`);
    console.log(`📄 Body:`, JSON.parse(result.body));
  } catch (error) {
    console.error('❌ Handler failed:', error);
  }
}

if (require.main === module) {
  testIsolatedHandler().catch(console.error);
}