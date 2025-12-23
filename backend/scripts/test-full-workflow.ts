#!/usr/bin/env node

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

interface WorkflowTestConfig {
  region: string;
  crawlerFunction: string;
  kbManagerFunction: string;
  contentBucket: string;
  vectorsBucket: string;
  outputDir: string;
}

const config: WorkflowTestConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  crawlerFunction: process.env.CRAWLER_FUNCTION || 'AdaClaraStack-Crawler8C39B76C-QevTS3DaJcSK',
  kbManagerFunction: process.env.KB_MANAGER_FUNCTION || 'AdaClaraStack-KBManager09C1194F-nlCIcaljjI4y',
  contentBucket: process.env.CONTENT_BUCKET || `ada-clara-content-756493389182-us-east-1`,
  vectorsBucket: process.env.VECTORS_BUCKET || `ada-clara-vectors-756493389182-us-east-1`,
  outputDir: './workflow-test-results'
};

const lambda = new LambdaClient({ region: config.region });
const s3 = new S3Client({ region: config.region });

async function testFullWorkflow() {
  console.log('🚀 Testing Full S3 Vectors Workflow...\n');
  console.log('📋 Workflow Steps:');
  console.log('   1. Scrape diabetes.org content');
  console.log('   2. Store raw content in S3');
  console.log('   3. Process content into chunks');
  console.log('   4. Generate embeddings with Bedrock');
  console.log('   5. Store vectors in S3 Vectors format');
  console.log('   6. Create Knowledge Base');
  console.log('   7. Test retrieval\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const workflowResults: any = {
    timestamp: new Date().toISOString(),
    steps: {}
  };

  try {
    // Step 1: Test crawl with a few URLs
    console.log('📋 Step 1: Testing crawler with sample URLs...');
    const crawlerResult = await invokeLambda(config.crawlerFunction, {
      action: 'test-crawl'
    });
    
    workflowResults.steps.crawl = crawlerResult;
    console.log(`   ✅ Crawled ${crawlerResult.successful} URLs successfully`);
    console.log(`   📊 Success Rate: ${crawlerResult.successRate.toFixed(1)}%`);
    console.log(`   📝 Avg Word Count: ${crawlerResult.averageWordCount.toFixed(0)}`);

    if (crawlerResult.successRate < 80) {
      throw new Error('Crawler success rate too low - check URLs and connectivity');
    }

    // Step 2: Check raw content storage
    console.log('\n📋 Step 2: Checking raw content storage...');
    const rawContentStats = await checkS3Storage(config.contentBucket, 'scraped-content/');
    workflowResults.steps.rawContent = rawContentStats;
    console.log(`   📁 Raw content files: ${rawContentStats.fileCount}`);
    console.log(`   📊 Total size: ${(rawContentStats.totalSize / 1024).toFixed(1)} KB`);

    // Step 3: Process content into chunks
    console.log('\n📋 Step 3: Processing content into chunks...');
    const processResult = await invokeLambda(config.crawlerFunction, {
      action: 'process-content'
    });
    
    workflowResults.steps.processing = processResult;
    console.log(`   ✅ Processed content into chunks`);

    // Step 4: Check chunk storage
    console.log('\n📋 Step 4: Checking chunk storage...');
    const chunkStats = await checkS3Storage(config.contentBucket, 'chunks/');
    workflowResults.steps.chunks = chunkStats;
    console.log(`   📁 Chunk files: ${chunkStats.fileCount}`);
    console.log(`   📊 Total size: ${(chunkStats.totalSize / 1024).toFixed(1)} KB`);

    // Step 5: Create embeddings
    console.log('\n📋 Step 5: Creating embeddings with Bedrock...');
    const embeddingResult = await invokeLambda(config.crawlerFunction, {
      action: 'create-embeddings'
    });
    
    workflowResults.steps.embeddings = embeddingResult;
    console.log(`   ✅ Created embeddings`);

    // Step 6: Check vector storage
    console.log('\n📋 Step 6: Checking vector storage...');
    const vectorStats = await checkS3Storage(config.vectorsBucket, 'vectors/'); // Updated to S3 Vectors format
    workflowResults.steps.vectors = vectorStats;
    console.log(`   📁 Vector files: ${vectorStats.fileCount}`);
    console.log(`   📊 Total size: ${(vectorStats.totalSize / 1024).toFixed(1)} KB`);

    // Step 7: Sample content inspection
    console.log('\n📋 Step 7: Inspecting sample content...');
    const contentSamples = await inspectSampleContent();
    workflowResults.steps.samples = contentSamples;
    
    console.log(`   📄 Sample raw content: ${contentSamples.rawContent?.title || 'N/A'}`);
    console.log(`   🧩 Sample chunk: ${contentSamples.chunk?.metadata?.title || 'N/A'}`);
    console.log(`   🔢 Sample vector dimensions: ${contentSamples.vector?.vector?.length || 'N/A'}`);

    // Step 8: Create Knowledge Base (optional - requires deployment)
    console.log('\n📋 Step 8: Knowledge Base creation (optional)...');
    try {
      const kbResult = await invokeLambda(config.kbManagerFunction, {
        action: 'create-kb'
      });
      workflowResults.steps.knowledgeBase = kbResult;
      console.log(`   ✅ Knowledge Base created: ${kbResult.knowledgeBaseId}`);
    } catch (error) {
      console.log(`   ⚠️  Knowledge Base creation skipped (requires deployment)`);
      workflowResults.steps.knowledgeBase = { skipped: true, reason: 'Not deployed' };
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(config.outputDir, `workflow-test-${timestamp}.json`),
      JSON.stringify(workflowResults, null, 2)
    );

    // Generate summary
    console.log('\n📊 WORKFLOW TEST SUMMARY');
    console.log('========================');
    console.log(`✅ Scraping: ${workflowResults.steps.crawl.successRate.toFixed(1)}% success rate`);
    console.log(`✅ Raw Storage: ${workflowResults.steps.rawContent.fileCount} files`);
    console.log(`✅ Chunking: ${workflowResults.steps.chunks.fileCount} chunks`);
    console.log(`✅ Embeddings: ${workflowResults.steps.vectors.fileCount} vectors`);
    
    const totalFiles = workflowResults.steps.rawContent.fileCount + 
                      workflowResults.steps.chunks.fileCount + 
                      workflowResults.steps.vectors.fileCount;
    
    console.log(`\n🎯 PIPELINE HEALTH: ${totalFiles > 0 ? 'HEALTHY' : 'NEEDS ATTENTION'}`);
    console.log(`💾 Results saved to: ${config.outputDir}`);

    if (totalFiles > 0) {
      console.log('\n🚀 NEXT STEPS:');
      console.log('1. Deploy the full S3 Vectors stack: npm run deploy-s3-vectors');
      console.log('2. Create Knowledge Base: npm run test-s3-vectors-full');
      console.log('3. Test retrieval and generation capabilities');
    }

    return workflowResults;

  } catch (error) {
    console.error('❌ Workflow test failed:', error);
    workflowResults.error = error instanceof Error ? error.message : 'Unknown error';
    
    // Save error results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(config.outputDir, `workflow-error-${timestamp}.json`),
      JSON.stringify(workflowResults, null, 2)
    );
    
    process.exit(1);
  }
}

async function checkS3Storage(bucket: string, prefix: string) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await s3.send(command);
    const objects = response.Contents || [];

    const stats = {
      fileCount: objects.length,
      totalSize: objects.reduce((sum, obj) => sum + (obj.Size || 0), 0),
      lastModified: objects.length > 0 ? 
        Math.max(...objects.map(obj => obj.LastModified?.getTime() || 0)) : 0,
      sections: {} as Record<string, number>
    };

    // Count files by section
    objects.forEach(obj => {
      const pathParts = obj.Key?.split('/') || [];
      if (pathParts.length > 1) {
        const section = pathParts[1];
        stats.sections[section] = (stats.sections[section] || 0) + 1;
      }
    });

    return stats;
  } catch (error) {
    console.log(`   ⚠️  Could not access ${bucket}/${prefix} - bucket may not exist yet`);
    return {
      fileCount: 0,
      totalSize: 0,
      lastModified: 0,
      sections: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function inspectSampleContent() {
  const samples: any = {};

  try {
    // Get sample raw content
    const rawObjects = await s3.send(new ListObjectsV2Command({
      Bucket: config.contentBucket,
      Prefix: 'scraped-content/',
      MaxKeys: 1
    }));

    if (rawObjects.Contents && rawObjects.Contents.length > 0) {
      const rawContent = await s3.send(new GetObjectCommand({
        Bucket: config.contentBucket,
        Key: rawObjects.Contents[0].Key!
      }));
      
      const rawText = await rawContent.Body?.transformToString();
      if (rawText) {
        samples.rawContent = JSON.parse(rawText);
      }
    }

    // Get sample chunk
    const chunkObjects = await s3.send(new ListObjectsV2Command({
      Bucket: config.contentBucket,
      Prefix: 'chunks/',
      MaxKeys: 1
    }));

    if (chunkObjects.Contents && chunkObjects.Contents.length > 0) {
      const chunkContent = await s3.send(new GetObjectCommand({
        Bucket: config.contentBucket,
        Key: chunkObjects.Contents[0].Key!
      }));
      
      const chunkText = await chunkContent.Body?.transformToString();
      if (chunkText) {
        samples.chunk = JSON.parse(chunkText);
      }
    }

    // Get sample vector
    const vectorObjects = await s3.send(new ListObjectsV2Command({
      Bucket: config.vectorsBucket,
      Prefix: 'vectors/', // Updated to S3 Vectors format
      MaxKeys: 1
    }));

    if (vectorObjects.Contents && vectorObjects.Contents.length > 0) {
      const vectorContent = await s3.send(new GetObjectCommand({
        Bucket: config.vectorsBucket,
        Key: vectorObjects.Contents[0].Key!
      }));
      
      const vectorText = await vectorContent.Body?.transformToString();
      if (vectorText) {
        samples.vector = JSON.parse(vectorText);
      }
    }

  } catch (error) {
    samples.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return samples;
}

async function invokeLambda(functionName: string, payload: any) {
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: JSON.stringify(payload),
  });
  
  try {
    const response = await lambda.send(command);
    
    if (response.Payload) {
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      console.log(`   Lambda Response:`, JSON.stringify(result, null, 2));
      
      if (result.statusCode === 200) {
        return JSON.parse(result.body);
      } else {
        throw new Error(`Lambda function failed: ${result.body}`);
      }
    } else {
      throw new Error('No response payload from Lambda function');
    }
  } catch (error) {
    console.error(`   Lambda Error:`, error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testFullWorkflow().catch(console.error);
}

export { testFullWorkflow };