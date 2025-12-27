// Check what's available in the S3 Vectors SDK
try {
  const s3VectorsModule = require('@aws-sdk/client-s3vectors');
  console.log('S3 Vectors SDK exports:');
  console.log(Object.keys(s3VectorsModule).sort());
  
  // Check if specific commands exist
  const commands = [
    'PutVectorCommand',
    'PutVectorsCommand', 
    'BatchPutVectorCommand',
    'BatchPutVectorsCommand',
    'ListVectorBucketsCommand',
    'S3VectorsClient'
  ];
  
  console.log('\nCommand availability:');
  commands.forEach(cmd => {
    console.log(`${cmd}: ${cmd in s3VectorsModule ? '✅' : '❌'}`);
  });
  
  // Try to inspect the PutInputVector structure
  console.log('\nTrying to understand PutInputVector structure...');
  const { PutVectorsCommand } = s3VectorsModule;
  
  // Create a test command to see what it expects
  try {
    const testCommand = new PutVectorsCommand({
      VectorBucketName: 'test',
      IndexName: 'test',
      Vectors: [{
        Key: 'test-key',
        Data: [0.1, 0.2, 0.3]
      }]
    });
    console.log('✅ PutVectorsCommand accepts: Key + Data structure');
  } catch (error: any) {
    console.log('❌ Key + Data structure failed:', error.message);
  }
  
  // Try different field names
  const fieldTests = [
    { VectorId: 'test', Vector: [0.1, 0.2, 0.3] },
    { Id: 'test', Vector: [0.1, 0.2, 0.3] },
    { Key: 'test', Vector: [0.1, 0.2, 0.3] },
    { Key: 'test', Data: [0.1, 0.2, 0.3] },
    { VectorId: 'test', Data: [0.1, 0.2, 0.3] }
  ];
  
  console.log('\nTesting different vector field structures:');
  fieldTests.forEach((fields, index) => {
    try {
      const testCommand = new PutVectorsCommand({
        VectorBucketName: 'test',
        IndexName: 'test',
        Vectors: [fields]
      });
      console.log(`✅ Structure ${index + 1} works:`, Object.keys(fields));
    } catch (error: any) {
      console.log(`❌ Structure ${index + 1} failed:`, Object.keys(fields), '-', error.message);
    }
  });
  
} catch (error: any) {
  console.error('Failed to load S3 Vectors SDK:', error.message);
}