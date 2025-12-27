import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testTitanV2Simple() {
  console.log('🧪 Testing Titan Text Embedding V2 in fresh AWS account...');
  
  try {
    const testText = 'This is a simple test for Titan Text Embedding V2.';
    const modelId = 'amazon.titan-embed-text-v2:0';
    
    console.log(`📝 Test text: "${testText}"`);
    console.log(`🤖 Model: ${modelId}`);
    
    // Simple request format for Titan V2
    const requestBody = JSON.stringify({
      inputText: testText
    });
    
    console.log('📤 Request body:', requestBody);
    
    const command = new InvokeModelCommand({
      modelId: modelId,
      body: requestBody
    });
    
    console.log('⏳ Invoking Bedrock model...');
    const startTime = Date.now();
    
    const response = await bedrockClient.send(command);
    const endTime = Date.now();
    
    console.log(`⚡ Response time: ${endTime - startTime}ms`);
    
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    console.log('📥 Response keys:', Object.keys(responseBody));
    
    if (responseBody.embedding) {
      console.log('✅ SUCCESS! Embedding generated successfully');
      console.log(`📊 Embedding dimensions: ${responseBody.embedding.length}`);
      console.log(`🔢 First 5 values: [${responseBody.embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}]`);
      console.log(`🔢 Last 5 values: [${responseBody.embedding.slice(-5).map((v: number) => v.toFixed(4)).join(', ')}]`);
      
      // Verify dimensions match expected (1536 for Titan V2)
      if (responseBody.embedding.length === 1536) {
        console.log('✅ Dimensions match expected (1536)');
      } else {
        console.log(`⚠️  Unexpected dimensions: ${responseBody.embedding.length} (expected 1536)`);
      }
      
      return {
        success: true,
        dimensions: responseBody.embedding.length,
        responseTime: endTime - startTime,
        embedding: responseBody.embedding
      };
    } else {
      console.log('❌ FAILED: No embedding in response');
      console.log('📥 Full response:', JSON.stringify(responseBody, null, 2));
      
      return {
        success: false,
        error: 'No embedding in response',
        response: responseBody
      };
    }
    
  } catch (error: any) {
    console.error('❌ FAILED: Titan V2 test failed');
    console.error('🔍 Error details:', {
      message: error.message,
      name: error.name,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      errorType: error.constructor.name
    });
    
    // Check for common error types
    if (error.message?.includes('AccessDeniedException')) {
      console.error('🚫 Access denied - check if Bedrock model access is enabled');
      console.error('💡 Go to AWS Console > Bedrock > Model access and enable Titan Text Embedding V2');
    } else if (error.message?.includes('ValidationException')) {
      console.error('⚠️  Validation error - check request format');
    } else if (error.message?.includes('ThrottlingException') || error.message?.includes('Too many requests')) {
      console.error('🐌 Rate limited - this should not happen in fresh account');
    } else if (error.message?.includes('ModelNotReadyException')) {
      console.error('⏳ Model not ready - may need to enable model access');
    }
    
    return {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      httpStatusCode: error.$metadata?.httpStatusCode
    };
  }
}

// Run the test
testTitanV2Simple()
  .then(result => {
    console.log('\n🏁 Test Result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n🎉 Titan V2 is working! Ready to proceed with deployment.');
    } else {
      console.log('\n💥 Titan V2 test failed. Fix the issue before deploying.');
    }
  })
  .catch(error => {
    console.error('\n💥 Test execution failed:', error);
  });