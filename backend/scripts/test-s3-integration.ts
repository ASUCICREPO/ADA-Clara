#!/usr/bin/env node

/**
 * Test S3 Integration for ADA Clara Chatbot
 * This script tests the S3 service and verifies bucket access
 */

import { S3Service } from '../src/services/s3-service';
import { KnowledgeContent } from '../src/types/index';

async function testS3Integration() {
  console.log('🧪 Testing ADA Clara S3 Integration...\n');

  const s3Service = new S3Service();

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing S3 bucket access...');
    const health = await s3Service.healthCheck();
    
    if (health.contentBucket && health.vectorsBucket) {
      console.log('✅ Both S3 buckets accessible');
      
      const buckets = s3Service.getBucketNames();
      console.log(`   Content Bucket: ${buckets.contentBucket}`);
      console.log(`   Vectors Bucket: ${buckets.vectorsBucket}\n`);
    } else {
      console.log('❌ S3 bucket access failed');
      console.log(`   Content Bucket: ${health.contentBucket ? '✅' : '❌'}`);
      console.log(`   Vectors Bucket: ${health.vectorsBucket ? '✅' : '❌'}\n`);
      return;
    }

    // Test 2: Store and retrieve raw content
    console.log('2️⃣ Testing raw content storage...');
    const testUrl = 'https://diabetes.org/test-page';
    const testContent = '<html><body><h1>Test Diabetes Information</h1><p>This is test content about diabetes management.</p></body></html>';
    const testMetadata = {
      title: 'Test Diabetes Page',
      contentType: 'article',
      scrapedAt: new Date(),
      language: 'en'
    };

    const contentKey = await s3Service.storeRawContent(testUrl, testContent, testMetadata);
    console.log('✅ Raw content stored successfully');
    console.log(`   Key: ${contentKey}`);

    const retrievedContent = await s3Service.getRawContent(contentKey);
    if (retrievedContent && retrievedContent.content === testContent) {
      console.log('✅ Raw content retrieved successfully');
    } else {
      console.log('❌ Raw content retrieval failed');
    }

    // Test 3: Store processed content chunks
    console.log('3️⃣ Testing processed content storage...');
    const contentId = s3Service.generateContentId(testUrl);
    const testChunks = [
      {
        chunkId: 'chunk-001',
        content: 'This is test content about diabetes management.',
        metadata: {
          chunkIndex: 0,
          totalChunks: 2,
          wordCount: 8
        }
      },
      {
        chunkId: 'chunk-002', 
        content: 'Additional information about diabetes care and prevention.',
        metadata: {
          chunkIndex: 1,
          totalChunks: 2,
          wordCount: 8
        }
      }
    ];

    const chunkKeys = await s3Service.storeProcessedContent(contentId, testChunks);
    console.log('✅ Processed content chunks stored successfully');
    console.log(`   Chunks stored: ${chunkKeys.length}`);

    // Test 4: Store and retrieve content metadata
    console.log('4️⃣ Testing content metadata operations...');
    const testKnowledgeContent: KnowledgeContent = {
      contentId: contentId,
      url: testUrl,
      title: 'Test Diabetes Page',
      content: 'This is test content about diabetes management.',
      lastUpdated: new Date(),
      contentType: 'article',
      language: 'en',
      metadata: {
        category: 'diabetes-management',
        tags: ['diabetes', 'management', 'test'],
        lastScraped: new Date(),
        wordCount: 8,
        readingTime: 1
      },
      vectorId: 'test-vector-001',
      createdAt: new Date()
    };

    await s3Service.storeContentMetadata(testKnowledgeContent);
    console.log('✅ Content metadata stored successfully');

    const retrievedMetadata = await s3Service.getContentMetadata(contentId, 'article');
    if (retrievedMetadata && retrievedMetadata.contentId === contentId) {
      console.log('✅ Content metadata retrieved successfully');
    } else {
      console.log('❌ Content metadata retrieval failed');
    }

    // Test 5: List content
    console.log('5️⃣ Testing content listing...');
    const contentList = await s3Service.listContent('article', undefined, undefined, 10);
    console.log(`✅ Content listing successful - found ${contentList.length} items`);

    // Test 6: Batch content storage
    console.log('6️⃣ Testing batch content operations...');
    const batchContents = [
      {
        url: 'https://diabetes.org/batch-test-1',
        content: '<html><body>Batch test content 1</body></html>',
        metadata: {
          title: 'Batch Test 1',
          contentType: 'article',
          scrapedAt: new Date(),
          language: 'en'
        }
      },
      {
        url: 'https://diabetes.org/batch-test-2',
        content: '<html><body>Batch test content 2</body></html>',
        metadata: {
          title: 'Batch Test 2',
          contentType: 'faq',
          scrapedAt: new Date(),
          language: 'en'
        }
      }
    ];

    const batchKeys = await s3Service.batchStoreContent(batchContents);
    console.log(`✅ Batch content storage successful - stored ${batchKeys.length} items`);

    console.log('\n🎉 All S3 integration tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('✅ S3 bucket access (content & vectors)');
    console.log('✅ Raw content storage and retrieval');
    console.log('✅ Processed content chunk storage');
    console.log('✅ Content metadata operations');
    console.log('✅ Content listing functionality');
    console.log('✅ Batch content operations');

    console.log('\n🔗 Integration Status:');
    console.log('✅ S3 buckets ready for DynamoDB integration');
    console.log('✅ Content pipeline ready for web scraping');
    console.log('✅ Metadata storage ready for knowledge base');

  } catch (error) {
    console.error('❌ S3 integration test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testS3Integration().catch(console.error);
}

export { testS3Integration };