import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({ region: 'us-east-1' });

// Use the deployed function name from CloudFormation outputs
const FUNCTION_NAME = 'AdaClaraS3VectorsWithLambd-CrawlerFunction614391C2-JOPh2y79u7Tm';

async function testS3VectorsLambda() {
  console.log('Testing S3 Vectors Lambda function...');
  
  try {
    // Test 1: Test crawl with a few URLs
    console.log('\n1. Testing crawl functionality...');
    const testCrawlEvent = {
      action: 'test-crawl',
      urls: [
        'https://diabetes.org/about-diabetes',
        'https://diabetes.org/about-diabetes/type-1',
        'https://diabetes.org/about-diabetes/type-2'
      ]
    };
    
    const testCrawlCommand = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(testCrawlEvent),
    });
    
    console.log('Invoking Lambda function for test crawl...');
    const testCrawlResponse = await lambda.send(testCrawlCommand);
    
    if (testCrawlResponse.Payload) {
      const responseStr = new TextDecoder().decode(testCrawlResponse.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Test crawl completed:');
      console.log(`  Status Code: ${result.statusCode}`);
      
      if (result.statusCode === 200) {
        const body = JSON.parse(result.body);
        console.log(`  Total URLs: ${body.totalUrls}`);
        console.log(`  Successful: ${body.successful}`);
        console.log(`  Failed: ${body.failed}`);
        console.log(`  Success Rate: ${body.successRate}%`);
        console.log(`  Average Word Count: ${Math.round(body.averageWordCount || 0)}`);
        
        if (body.results && body.results.length > 0) {
          console.log('\n  Sample Results:');
          body.results.slice(0, 2).forEach((result: any, index: number) => {
            console.log(`    ${index + 1}. ${result.title}`);
            console.log(`       URL: ${result.url}`);
            console.log(`       Words: ${result.wordCount}`);
            console.log(`       Section: ${result.metadata.section}`);
          });
        }
        
        if (body.errors && body.errors.length > 0) {
          console.log('\n  Errors:');
          body.errors.forEach((error: any, index: number) => {
            console.log(`    ${index + 1}. ${error.url}: ${error.error}`);
          });
        }
      } else {
        console.log('❌ Test crawl failed:', result);
      }
    }
    
    // Test 2: Process content (if we have any)
    console.log('\n2. Testing content processing...');
    const processContentEvent = {
      action: 'process-content'
    };
    
    const processContentCommand = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(processContentEvent),
    });
    
    console.log('Invoking Lambda function for content processing...');
    const processContentResponse = await lambda.send(processContentCommand);
    
    if (processContentResponse.Payload) {
      const responseStr = new TextDecoder().decode(processContentResponse.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Content processing completed:');
      console.log(`  Status Code: ${result.statusCode}`);
      
      if (result.statusCode === 200) {
        console.log(`  Processed items: ${result.body}`);
      } else {
        console.log('❌ Content processing failed:', result);
      }
    }
    
    // Test 3: Create embeddings (if we have chunks)
    console.log('\n3. Testing embedding creation...');
    const createEmbeddingsEvent = {
      action: 'create-embeddings'
    };
    
    const createEmbeddingsCommand = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: JSON.stringify(createEmbeddingsEvent),
    });
    
    console.log('Invoking Lambda function for embedding creation...');
    const createEmbeddingsResponse = await lambda.send(createEmbeddingsCommand);
    
    if (createEmbeddingsResponse.Payload) {
      const responseStr = new TextDecoder().decode(createEmbeddingsResponse.Payload);
      const result = JSON.parse(responseStr);
      
      console.log('✅ Embedding creation completed:');
      console.log(`  Status Code: ${result.statusCode}`);
      
      if (result.statusCode === 200) {
        console.log(`  Embeddings created: ${result.body}`);
      } else {
        console.log('❌ Embedding creation failed:', result);
      }
    }
    
    console.log('\n🎉 Lambda function testing completed!');
    
    return {
      success: true,
      functionName: FUNCTION_NAME
    };
    
  } catch (error) {
    console.error('❌ Lambda test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the test
testS3VectorsLambda()
  .then(result => {
    console.log('\nTest Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });