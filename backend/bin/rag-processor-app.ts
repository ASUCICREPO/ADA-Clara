#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { RAGProcessorStack } from '../lib/rag-processor-stack';

const app = new cdk.App();

// Reference existing content bucket
const contentBucket = s3.Bucket.fromBucketName(
  app, 
  'ExistingContentBucket', 
  'ada-clara-content-minimal-023336033519-us-east-1'
);

new RAGProcessorStack(app, 'ADA-Clara-RAG-Processor', {
  contentBucket,
  vectorsBucket: 'ada-clara-vectors-minimal-023336033519-us-east-1',
  vectorIndex: 'ada-clara-vector-index',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});
