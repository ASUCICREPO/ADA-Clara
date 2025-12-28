#!/usr/bin/env ts-node

/**
 * Simple test to check what actions are available in the Lambda function
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

async function testLambdaActions() {
  console.log('🧪 Testing Lambda function actions...');
  
  try {
    // Test with invalid action to see what actions are supported
    const command = new InvokeCommand({
      FunctionName: 'AdaClaraS3VectorsGA-CrawlerFunction614391C2-Sp82ZQ1pSMUL',
      Payload: JSON.stringify({ action: 'invalid-action' }),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    
    console.log('Lambda Response:', JSON.stringify(result, null, 2));
    
    if (result.statusCode === 400) {
      const body = JSON.parse(result.body);
      console.log('\nSupported Actions:');
      if (body.supportedActions) {
        body.supportedActions.forEach((action: string) => {
          console.log(`  - ${action}`);
        });
      }
    }
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

testLambdaActions();