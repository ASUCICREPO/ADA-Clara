import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: 'us-east-1' });

// Use the deployed function name from CloudFormation outputs
const FUNCTION_NAME = 'AdaClaraS3VectorsMinimalTe-CrawlerFunction614391C2-xShwQwkFJUhj';

async function testLambdaVector() {
  console.log('Testing Lambda vector creation...');
  
  try {
    // Test single vector creation
    const vectorEvent = {
      action: 'create-single-vector'
    };
    
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(vectorEvent),
    });
    
    console.log('Invoking Lambda function for vector creation...');
    const response = await lambda.send(command);
    
    if (response.Payload) {
      const responseStr = new TextDecoder().decode(response.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Lambda vector response:');
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
    console.error('❌ Lambda vector test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the test
testLambdaVector()
  .then(result => {
    console.log('\nVector Test Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });