#!/usr/bin/env ts-node

console.log('🔍 Testing S3VectorsGAStack import...');

import { S3VectorsGAStack } from './lib/s3-vectors-ga-stack';

console.log('📦 S3VectorsGAStack imported:', typeof S3VectorsGAStack);
console.log('📦 S3VectorsGAStack constructor:', S3VectorsGAStack.constructor.name);
console.log('📦 S3VectorsGAStack prototype:', Object.getOwnPropertyNames(S3VectorsGAStack.prototype));

console.log('✅ Import test completed');