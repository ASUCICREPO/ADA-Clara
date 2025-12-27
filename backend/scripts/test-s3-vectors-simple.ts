import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

// Use the deployed bucket names from CloudFormation outputs
const VECTORS_BUCKET = 'ada-clara-vectors-v2-756493389182-us-east-1';
const CONTENT_BUCKET = 'ada-clara-content-v2-756493389182-us-east-1';

async function testS3VectorsBasic() {
  console.log('Testing S3 Vectors bucket access...');
  
  try {
    // Test 1: Test content bucket access
    console.log('\n1. Testing content bucket access...');
    const contentData = {
      url: 'https://diabetes.org/about-diabetes/type-1',
      title: 'Type 1 Diabetes | ADA',
      content: 'Type 1 diabetes is an autoimmune condition where the body attacks insulin-producing cells in the pancreas.',
      extractedAt: new Date().toISOString(),
      contentType: 'article',
      wordCount: 17,
      contentHash: 'test-hash-123',
      metadata: {
        section: 'about-diabetes',
        language: 'en'
      }
    };
    
    const contentCommand = new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: 'test/sample-content.json',
      Body: JSON.stringify(contentData, null, 2),
      ContentType: 'application/json'
    });
    
    await s3.send(contentCommand);
    console.log('✅ Successfully stored test content in content bucket');
    
    // Test 2: Test S3 Vectors bucket access (using mock embedding)
    console.log('\n2. Testing S3 Vectors bucket access...');
    
    // Create a mock embedding vector (1536 dimensions for Titan)
    const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
    
    const vectorData = {
      id: 'test-chunk-001',
      vector: mockEmbedding,
      content: contentData.content,
      metadata: {
        url: contentData.url,
        title: contentData.title,
        section: 'about-diabetes',
        contentType: 'article',
        sourceUrl: contentData.url,
        sourcePage: 'About Diabetes > Type 1',
        chunkIndex: 0,
        totalChunks: 1
      },
      timestamp: new Date().toISOString()
    };
    
    const vectorCommand = new PutObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: 'vectors/about-diabetes/test-chunk-001.json',
      Body: JSON.stringify(vectorData, null, 2),
      ContentType: 'application/json',
      Metadata: {
        chunkId: 'test-chunk-001',
        section: 'about-diabetes',
        embeddingModel: 'amazon.titan-embed-text-v1',
        vectorDimensions: mockEmbedding.length.toString()
      }
    });
    
    await s3.send(vectorCommand);
    console.log('✅ Successfully stored test vector in S3 Vectors bucket');
    
    // Test 3: List objects in both buckets
    console.log('\n3. Listing objects in buckets...');
    
    const listContentCommand = new ListObjectsV2Command({
      Bucket: CONTENT_BUCKET,
      Prefix: 'test/',
      MaxKeys: 10
    });
    
    const contentResponse = await s3.send(listContentCommand);
    const contentObjects = contentResponse.Contents || [];
    
    console.log(`✅ Content bucket has ${contentObjects.length} test objects:`);
    contentObjects.forEach(obj => {
      console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
    });
    
    const listVectorCommand = new ListObjectsV2Command({
      Bucket: VECTORS_BUCKET,
      Prefix: 'vectors/',
      MaxKeys: 10
    });
    
    const vectorResponse = await s3.send(listVectorCommand);
    const vectorObjects = vectorResponse.Contents || [];
    
    console.log(`✅ Vectors bucket has ${vectorObjects.length} vector objects:`);
    vectorObjects.forEach(obj => {
      console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
    });
    
    // Test 4: Read back the vector data
    console.log('\n4. Reading back vector data...');
    
    const getVectorCommand = new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: 'vectors/about-diabetes/test-chunk-001.json'
    });
    
    const vectorReadResponse = await s3.send(getVectorCommand);
    const vectorDataStr = await vectorReadResponse.Body?.transformToString();
    
    if (vectorDataStr) {
      const readVectorData = JSON.parse(vectorDataStr);
      console.log('✅ Successfully read vector data:');
      console.log(`  - ID: ${readVectorData.id}`);
      console.log(`  - Vector dimensions: ${readVectorData.vector.length}`);
      console.log(`  - Content preview: ${readVectorData.content.substring(0, 100)}...`);
      console.log(`  - Source URL: ${readVectorData.metadata.sourceUrl}`);
    }
    
    console.log('\n🎉 All S3 Vectors bucket tests passed!');
    
    return {
      success: true,
      vectorsBucket: VECTORS_BUCKET,
      contentBucket: CONTENT_BUCKET,
      contentObjects: contentObjects.length,
      vectorObjects: vectorObjects.length,
      vectorDimensions: mockEmbedding.length
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
testS3VectorsBasic()
  .then(result => {
    console.log('\nTest Result:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Test execution failed:', error);
  });