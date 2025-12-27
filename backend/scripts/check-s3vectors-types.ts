// Check S3 Vectors types
import { PutVectorsCommand, PutVectorsCommandInput } from '@aws-sdk/client-s3vectors';

// Let's see what TypeScript expects
const testInput: PutVectorsCommandInput = {
  vectorBucketName: 'test',
  indexName: 'test',
  vectors: [
    // Let's see what properties are available here
    // TypeScript will tell us what's expected
  ]
};

console.log('Type checking complete');