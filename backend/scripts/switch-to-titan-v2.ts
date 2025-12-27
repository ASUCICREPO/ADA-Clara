// Script to switch from Titan V1 to Titan V2 when ready
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Switching to Titan Text Embedding V2...');

// Update Lambda code
const lambdaPath = 'lambda-minimal/index.js';
let lambdaCode = readFileSync(lambdaPath, 'utf8');

// Switch to Titan V2
lambdaCode = lambdaCode.replace(
  /const EMBEDDING_MODEL = process\.env\.EMBEDDING_MODEL \|\| 'amazon\.titan-embed-text-v1';/,
  "const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0';"
);

// Update request format for Titan V2
lambdaCode = lambdaCode.replace(
  /\/\/ Titan Text Embedding V1 request format \(simpler\)\s+const requestBody = JSON\.stringify\(\{\s+inputText: text\.substring\(0, 8000\) \/\/ Titan v1 limit\s+\}\);/,
  `// Titan Text Embedding V2 request format
      const requestBody = JSON.stringify({
        inputText: text.substring(0, 8000), // Titan v2 supports up to 8K tokens
        dimensions: 1536, // Match our S3 Vectors index configuration
        normalize: true // Normalize embeddings for better similarity search
      });`
);

writeFileSync(lambdaPath, lambdaCode);

// Update CDK stack
const stackPath = 'lib/s3-vectors-minimal-stack.ts';
let stackCode = readFileSync(stackPath, 'utf8');

stackCode = stackCode.replace(
  /EMBEDDING_MODEL: 'amazon\.titan-embed-text-v1',/,
  "EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',"
);

writeFileSync(stackPath, stackCode);

console.log('✅ Updated Lambda code for Titan V2');
console.log('✅ Updated CDK stack for Titan V2');
console.log('');
console.log('🚀 To deploy the changes:');
console.log('npm run deploy-s3-vectors-minimal-test');
console.log('');
console.log('📋 Titan V2 Benefits:');
console.log('- Configurable dimensions (we use 1536)');
console.log('- Normalization for better similarity search');
console.log('- Improved performance and accuracy');
console.log('- Up to 8K token input length');