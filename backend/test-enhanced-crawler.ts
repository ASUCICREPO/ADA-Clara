/**
 * Test script for enhanced crawler functionality
 * Tests the weekly crawler scheduling enhancements
 */

import { handler } from './lambda-ga/index';
import { Context } from 'aws-lambda';

// Mock Lambda context
const mockContext: Context = {
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

async function testEnhancedCrawler() {
  console.log('🧪 Testing Enhanced Crawler Functionality');
  
  try {
    // Test 1: Crawler scheduling functionality
    console.log('\n1. Testing crawler scheduling...');
    const crawlerTest = await handler({
      body: JSON.stringify({
        action: 'test-crawler-scheduling',
        targetUrls: [
          'https://diabetes.org/about-diabetes/type-1',
          'https://diabetes.org/about-diabetes/type-2'
        ],
        forceRefresh: false
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/test',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    }, mockContext, () => {});
    
    console.log('✅ Crawler scheduling test result:', JSON.parse(crawlerTest.body!));
    
    // Test 2: Content detection functionality
    console.log('\n2. Testing content detection...');
    const contentDetectionTest = await handler({
      body: JSON.stringify({
        action: 'test-content-detection',
        testUrl: 'https://diabetes.org/about-diabetes/type-1'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/test',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    }, mockContext, () => {});
    
    console.log('✅ Content detection test result:', JSON.parse(contentDetectionTest.body!));
    
    // Test 3: EventBridge handler functionality
    console.log('\n3. Testing EventBridge handler...');
    const eventBridgeTest = await handler({
      body: JSON.stringify({
        action: 'test-eventbridge-handler',
        targetUrls: [
          'https://diabetes.org/about-diabetes/type-1'
        ]
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/test',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    }, mockContext, () => {});
    
    console.log('✅ EventBridge handler test result:', JSON.parse(eventBridgeTest.body!));
    
    console.log('\n🎉 All enhanced crawler tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Enhanced crawler test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testEnhancedCrawler()
    .then(() => {
      console.log('\n✅ Enhanced crawler functionality validation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Enhanced crawler functionality validation failed:', error);
      process.exit(1);
    });
}

export { testEnhancedCrawler };