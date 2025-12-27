// Check S3 Vectors parameter structure
const s3VectorsModule = require('@aws-sdk/client-s3vectors');

console.log('Checking PutVectorsCommand parameter structure...');

// Look for input types
const inputTypes = Object.keys(s3VectorsModule).filter(key => key.includes('Input'));
console.log('Available Input types:', inputTypes);

// Check PutVectorsInput specifically
if (s3VectorsModule.PutVectorsInput$) {
  console.log('PutVectorsInput$ found');
} else {
  console.log('PutVectorsInput$ not found');
}

// Try to find the correct parameter structure
console.log('\nAll exports containing "Vector":');
Object.keys(s3VectorsModule)
  .filter(key => key.toLowerCase().includes('vector'))
  .forEach(key => console.log(key));

// Check if there are any examples in the module
console.log('\nAll exports containing "Put":');
Object.keys(s3VectorsModule)
  .filter(key => key.toLowerCase().includes('put'))
  .forEach(key => console.log(key));