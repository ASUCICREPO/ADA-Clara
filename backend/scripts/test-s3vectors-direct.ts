// Test S3 Vectors API directly with minimal example
const { S3VectorsClient, PutVectorsCommand } = require('@aws-sdk/client-s3vectors');

const s3VectorsClient = new S3VectorsClient({ region: 'us-east-1' });

async function testS3VectorsDirect() {
  console.log('🧪 Testing S3 Vectors API directly...');
  
  try {
    // Try different parameter structures to find the correct one
    const testStructures = [
      // Structure 1: PascalCase (from AWS docs)
      {
        name: 'PascalCase',
        params: {
          VectorBucketName: 'ada-clara-vectors-minimal-023336033519-us-east-1',
          IndexName: 'ada-clara-vector-index',
          Vectors: [
            {
              VectorId: 'test-vector-1',
              Vector: new Array(1024).fill(0).map(() => Math.random() - 0.5),
              Metadata: {
                test: 'true',
                source: 'direct-test'
              }
            }
          ]
        }
      },
      // Structure 2: camelCase
      {
        name: 'camelCase',
        params: {
          vectorBucketName: 'ada-clara-vectors-minimal-023336033519-us-east-1',
          indexName: 'ada-clara-vector-index',
          vectors: [
            {
              vectorId: 'test-vector-1',
              vector: new Array(1024).fill(0).map(() => Math.random() - 0.5),
              metadata: {
                test: 'true',
                source: 'direct-test'
              }
            }
          ]
        }
      },
      // Structure 3: Mixed (common in AWS SDKs)
      {
        name: 'Mixed',
        params: {
          VectorBucketName: 'ada-clara-vectors-minimal-023336033519-us-east-1',
          IndexName: 'ada-clara-vector-index',
          Vectors: [
            {
              vectorId: 'test-vector-1',
              vector: new Array(1024).fill(0).map(() => Math.random() - 0.5),
              metadata: {
                test: 'true',
                source: 'direct-test'
              }
            }
          ]
        }
      }
    ];
    
    for (const structure of testStructures) {
      console.log(`\n📤 Trying ${structure.name} structure...`);
      try {
        const command = new PutVectorsCommand(structure.params);
        console.log('✅ Command created successfully with', structure.name);
        
        const result = await s3VectorsClient.send(command);
        console.log('🎉 SUCCESS! Vector stored with', structure.name);
        console.log('📥 Result:', JSON.stringify(result, null, 2));
        
        return {
          success: true,
          structure: structure.name,
          result
        };
        
      } catch (error) {
        console.log(`❌ ${structure.name} failed:`, error.message);
        if (error.fieldList) {
          console.log('🔍 Field errors:', error.fieldList);
        }
      }
    }
    
    return {
      success: false,
      error: 'All structures failed'
    };
    
  } catch (error) {
    console.error('❌ FAILED: S3 Vectors test failed');
    console.error('🔍 Error details:', {
      message: error.message,
      name: error.name,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      errorType: error.constructor.name
    });
    
    return {
      success: false,
      error: error.message,
      errorType: error.constructor.name
    };
  }
}

testS3VectorsDirect()
  .then(result => {
    console.log('\n🏁 Test Result:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('\n💥 Test execution failed:', error);
  });