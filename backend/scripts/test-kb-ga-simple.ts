#!/usr/bin/env ts-node

/**
 * Simple Knowledge Base GA Integration Test
 * 
 * This script tests the basic functionality of the Knowledge Base GA
 * integration Lambda function.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

async function testKnowledgeBaseGA() {
  console.log('🧪 Testing Knowledge Base GA Integration Lambda...');
  
  const lambdaClient = new LambdaClient({ region: 'us-east-1' });
  const functionName = 'AdaClaraKBGATest-us-east-1';
  
  try {
    // Test basic function invocation
    console.log('📞 Invoking Lambda function...');
    
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify({
        action: 'test-kb-access'
      }),
    });

    const response = await lambdaClient.send(command);
    
    console.log('📋 Lambda Response:');
    console.log('   Status Code:', response.StatusCode);
    console.log('   Execution Duration:', response.ExecutedVersion);
    
    if (response.Payload) {
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      console.log('   Response Body:', JSON.stringify(result, null, 2));
      
      if (response.StatusCode === 200) {
        console.log('✅ Lambda function executed successfully');
        
        // Parse the actual response
        if (result.body) {
          const parsedBody = JSON.parse(result.body);
          console.log('📊 Parsed Response:', JSON.stringify(parsedBody, null, 2));
        }
      } else {
        console.log('❌ Lambda function returned error status');
      }
    } else {
      console.log('❌ No response payload received');
    }
    
  } catch (error: any) {
    console.error('❌ Lambda invocation failed:', error.message);
    
    // Check if it's a function not found error
    if (error.name === 'ResourceNotFoundException') {
      console.log('💡 The Lambda function may not exist or may not be accessible');
      console.log('   Function name:', functionName);
      console.log('   Region: us-east-1');
    }
  }
}

// Main execution
async function main() {
  try {
    await testKnowledgeBaseGA();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}