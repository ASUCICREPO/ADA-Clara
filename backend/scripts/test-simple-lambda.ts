import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: 'us-east-1' });

// Use the deployed function name from CloudFormation outputs
const FUNCTION_NAME = 'AdaClaraS3VectorsWithLambd-CrawlerFunction614391C2-eYQ1BNKpzpb8';

async function testSimpleLambda() {
  console.log('Testing Simple Lambda function...');
  
  try {
    const testEvent = {
      action: 'test'
    };
    
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(testEvent),
    });
    
    console.log('Invoking Lambda function...');
    const response = await lambda.send(command);
    
    if (response.Payload) {
      const responseStr = new TextDecoder().decode(response.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Lambda function response:');
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
    console.error('❌ Lambda test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the test
testSimpleLambda()
  .then(result => {
    console.log('\nTest Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });