// Test S3 Vectors API structure
const s3VectorsModule = require('@aws-sdk/client-s3vectors');

console.log('PutVectorsCommand input schema:');
try {
  const PutVectorsCommand = s3VectorsModule.PutVectorsCommand;
  
  // Create a test command to see the expected structure
  const testCommand = new PutVectorsCommand({
    VectorBucketName: 'test-bucket',
    IndexName: 'test-index',
    Vectors: [{
      VectorId: 'test-id',
      Vector: [0.1, 0.2, 0.3],
      Metadata: {
        key: 'value'
      }
    }]
  });
  
  console.log('✅ PutVectorsCommand created successfully');
  console.log('Input structure:', JSON.stringify(testCommand.input, null, 2));
  
} catch (error: any) {
  console.error('❌ Error creating PutVectorsCommand:', error.message);
  console.error('Available exports:', Object.keys(s3VectorsModule).filter(k => k.includes('Put')));
}