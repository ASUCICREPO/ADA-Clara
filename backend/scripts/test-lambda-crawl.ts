import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: 'us-east-1' });

// Use the deployed function name from CloudFormation outputs
const FUNCTION_NAME = 'AdaClaraS3VectorsMinimalTe-CrawlerFunction614391C2-xShwQwkFJUhj';

async function testLambdaCrawl() {
  console.log('Testing Lambda crawl functionality...');
  
  try {
    // Test crawling first
    const crawlEvent = {
      action: 'test-crawl'
    };
    
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(crawlEvent),
    });
    
    console.log('Invoking Lambda function for crawling...');
    const response = await lambda.send(command);
    
    if (response.Payload) {
      const responseStr = new TextDecoder().decode(response.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Lambda crawl response:');
      console.log(JSON.stringify(result, null, 2));
      
      return {
        success: true,
        result
      };
    } else {
      console.log('❌ No response payload');
      return {
        success: false,
        error: 'No response payload'
      };
    }
    
  } catch (error) {
    console.error('❌ Lambda crawl test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the test
testLambdaCrawl()
  .then(result => {
    console.log('\nCrawl Test Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });