import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const s3 = new S3Client({ region: 'us-east-1' });
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

// Use the deployed bucket names
const VECTORS_BUCKET = 'ada-clara-vectors-v2-756493389182-us-east-1';
const CONTENT_BUCKET = 'ada-clara-content-v2-756493389182-us-east-1';

async function testS3VectorsIntegration() {
  console.log('Testing S3 Vectors integration with deployed infrastructure...');
  
  try {
    // Test 1: Create a sample embedding
    console.log('\n1. Creating sample embedding...');
    const sampleText = 'Type 1 diabetes is an autoimmune condition where the body attacks insulin-producing cells in the pancreas.';
    
    const embeddingCommand = new InvokeModelCommand({
      modelId: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: sampleText
      })
    });
    
    const embeddingResponse = await bedrock.send(embeddingCommand);
    const embeddingResult = JSON.parse(new TextDecoder().decode(embeddingResponse.body));
    const embedding = embeddingResult.embedding;
    
    console.log(`✅ Created embedding with ${embedding.length} dimensions`);
    
    // Test 2: Store vector in S3 Vectors format
    console.log('\n2. Storing vector in S3 Vectors format...');
    const vectorData = {
      id: 'test-chunk-001',
      vector: embedding,
      content: sampleText,
      metadata: {
        url: 'https://diabetes.org/about-diabetes/type-1',
        title: 'Type 1 Diabetes | ADA',
        section: 'about-diabetes',
        contentType: 'article',
        sourceUrl: 'https://diabetes.org/about-diabetes/type-1',
        sourcePage: 'About Diabetes > Type 1',
        chunkIndex: 0,
        totalChunks: 1
      },
      timestamp: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: 'vectors/about-diabetes/test-chunk-001.json',
      Body: JSON.stringify(vectorData, null, 2),
      ContentType: 'application/json',
      Metadata: {
        chunkId: 'test-chunk-001',
        section: 'about-diabetes',
        embeddingModel: 'amazon.titan-embed-text-v1',
        vectorDimensions: embedding.length.toString()
      }
    });
    
    await s3.send(putCommand);
    console.log('✅ Successfully stored vector in S3 Vectors bucket');
    
    // Test 3: List vectors in bucket
    console.log('\n3. Listing vectors in bucket...');
    const listCommand = new ListObjectsV2Command({
      Bucket: VECTORS_BUCKET,
      Prefix: 'vectors/',
      MaxKeys: 10
    });
    
    const listResponse = await s3.send(listCommand);
    const objects = listResponse.Contents || [];
    
    console.log(`✅ Found ${objects.length} vector objects in bucket:`);
    objects.forEach(obj => {
      console.log(`  - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
    });
    
    // Test 4: Test content bucket
    console.log('\n4. Testing content bucket...');
    const contentData = {
      url: 'https://diabetes.org/about-diabetes/type-1',
      title: 'Type 1 Diabetes | ADA',
      content: sampleText,
      extractedAt: new Date().toISOString(),
      contentType: 'article',
      wordCount: sampleText.split(' ').length,
      contentHash: 'test-hash-123',
      metadata: {
        section: 'about-diabetes',
        language: 'en'
      }
    };
    
    const contentCommand = new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: 'scraped-content/about-diabetes/test-content.json',
      Body: JSON.stringify(contentData, null, 2),
      ContentType: 'application/json'
    });
    
    await s3.send(contentCommand);
    console.log('✅ Successfully stored content in content bucket');
    
    console.log('\n🎉 All tests passed! S3 Vectors infrastructure is working correctly.');
    
    return {
      success: true,
      vectorsBucket: VECTORS_BUCKET,
      contentBucket: CONTENT_BUCKET,
      embeddingDimensions: embedding.length,
      vectorsStored: objects.length
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Run the test
testS3VectorsIntegration()
  .then(result => {
    console.log('\nTest Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });