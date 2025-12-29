#!/usr/bin/env ts-node

/**
 * RAG Processor Deployment Script
 * 
 * Deploys the dedicated RAG (Retrieval-Augmented Generation) processor Lambda
 * with S3 Vectors integration for the ADA Clara chatbot system.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RAGProcessorStack } from '../lib/rag-processor-stack';
import * as s3 from 'aws-cdk-lib/aws-s3';

class RAGProcessorApp extends cdk.App {
  constructor() {
    super();

    // Get existing S3 buckets from environment or use defaults
    const account = process.env.CDK_DEFAULT_ACCOUNT || '023336033519';
    const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';
    
    const contentBucketName = process.env.CONTENT_BUCKET || `ada-clara-content-ga-${account}-${region}`;
    const vectorsBucketName = process.env.VECTORS_BUCKET || `ada-clara-vectors-ga-${account}-${region}`;
    const vectorIndexName = process.env.VECTOR_INDEX || 'ada-clara-vector-index-ga';

    // Reference existing content bucket (should exist from S3 Vectors GA deployment)
    const contentBucket = s3.Bucket.fromBucketName(
      this,
      'ExistingContentBucket',
      contentBucketName
    );

    // Create RAG Processor stack
    new RAGProcessorStack(this, 'AdaClaraRAGProcessor', {
      env: {
        account,
        region
      },
      contentBucket,
      vectorsBucket: vectorsBucketName,
      vectorIndex: vectorIndexName,
      description: 'ADA Clara RAG Processor - Dedicated RAG processing with S3 Vectors integration'
    });
  }
}

// Create and deploy the app
const app = new RAGProcessorApp();