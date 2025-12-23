#!/usr/bin/env node

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';

interface S3VectorsTestConfig {
  region: string;
  crawlerFunction: string;
  kbManagerFunction: string;
  outputDir: string;
}

const config: S3VectorsTestConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  crawlerFunction: process.env.CRAWLER_FUNCTION || 'S3VectorsCrawlerStack-S3VectorsCrawler',
  kbManagerFunction: process.env.KB_MANAGER_FUNCTION || 'S3VectorsCrawlerStack-KnowledgeBaseManager',
  outputDir: './s3-vectors-results'
};

const lambda = new LambdaClient({ region: config.region });

async function testS3VectorsCrawler() {
  console.log('🚀 Starting S3 Vectors Crawler and Knowledge Base test...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  try {
    console.log('📋 Step 1: Testing crawler with sample URLs...');
    const crawlerTestResult = await invokeLambda(config.crawlerFunction, {
      action: 'test-crawl'
    });

    console.log('✅ Crawler Test Results:');
    console.log(`   Success Rate: ${crawlerTestResult.successRate.toFixed(1)}%`);
    console.log(`   Average Word Count: ${crawlerTestResult.averageWordCount.toFixed(0)}`);
    console.log(`   Successful URLs: ${crawlerTestResult.successful}`);

    if (crawlerTestResult.successRate < 80) {
      console.log('⚠️  Low success rate - check crawler configuration');
      return;
    }

    console.log('\n📋 Step 2: Running full setup (crawler + Knowledge Base)...');
    const fullSetupResult = await invokeLambda(config.kbManagerFunction, {
      action: 'full-setup'
    });

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    fs.writeFileSync(
      path.join(config.outputDir, `s3-vectors-test-${timestamp}.json`),
      JSON.stringify({
        crawlerTest: crawlerTestResult,
        fullSetup: fullSetupResult
      }, null, 2)
    );

    console.log('\n📊 S3 VECTORS KNOWLEDGE BASE RESULTS');
    console.log('====================================');
    
    if (fullSetupResult.steps?.knowledgeBase) {
      console.log(`✅ Knowledge Base ID: ${fullSetupResult.steps.knowledgeBase.knowledgeBaseId}`);
      console.log(`✅ Data Source ID: ${fullSetupResult.steps.knowledgeBase.dataSourceId}`);
    }

    if (fullSetupResult.steps?.sync) {
      console.log(`📈 Content Stats - Chunks: ${fullSetupResult.steps.sync.contentStats.chunks}, Embeddings: ${fullSetupResult.steps.sync.contentStats.embeddings}`);
    }

    if (fullSetupResult.steps?.test) {
      const test = fullSetupResult.steps.test;
      console.log(`🎯 Query Success Rate: ${test.qualityMetrics.successRate.toFixed(1)}%`);
      console.log(`📝 Average Results per Query: ${test.qualityMetrics.averageResultsPerQuery.toFixed(1)}`);
      console.log(`🔗 Queries with Citations: ${test.qualityMetrics.queriesWithCitations}`);
    }

    console.log(`\n🏆 Recommendation: ${fullSetupResult.recommendation}`);
    console.log(`💾 Detailed results saved to: ${config.outputDir}`);

    // Provide next steps
    if (fullSetupResult.steps?.knowledgeBase?.knowledgeBaseId) {
      console.log('\n🔧 NEXT STEPS');
      console.log('=============');
      console.log('Your S3 Vectors Knowledge Base is ready! You can now:');
      console.log('1. Integrate with your chatbot application');
      console.log('2. Set up weekly crawling schedule');
      console.log('3. Monitor content freshness and quality');
      console.log(`\nKnowledge Base ID: ${fullSetupResult.steps.knowledgeBase.knowledgeBaseId}`);
    }

    return fullSetupResult;

  } catch (error) {
    console.error('❌ S3 Vectors test failed:', error);
    process.exit(1);
  }
}

async function testCrawlerOnly() {
  console.log('🧪 Testing S3 Vectors Crawler only...\n');

  try {
    // Test crawl
    console.log('📋 Running test crawl...');
    const testResult = await invokeLambda(config.crawlerFunction, {
      action: 'test-crawl'
    });

    console.log('📊 CRAWLER TEST RESULTS');
    console.log('=======================');
    console.log(`Success Rate: ${testResult.successRate.toFixed(1)}%`);
    console.log(`Total URLs: ${testResult.totalUrls}`);
    console.log(`Successful: ${testResult.successful}`);
    console.log(`Failed: ${testResult.failed}`);
    console.log(`Average Word Count: ${testResult.averageWordCount.toFixed(0)}`);

    if (testResult.results && testResult.results.length > 0) {
      console.log('\n📝 Sample Results:');
      testResult.results.slice(0, 2).forEach((r: any, i: number) => {
        console.log(`\n${i + 1}. ${r.title}`);
        console.log(`   URL: ${r.url}`);
        console.log(`   Words: ${r.wordCount}`);
        console.log(`   Type: ${r.contentType}`);
        console.log(`   Section: ${r.metadata.section}`);
      });
    }

    if (testResult.errors && testResult.errors.length > 0) {
      console.log('\n❌ Errors:');
      testResult.errors.forEach((e: any) => {
        console.log(`   • ${e.url}: ${e.error}`);
      });
    }

    return testResult;

  } catch (error) {
    console.error('❌ Crawler test failed:', error);
    process.exit(1);
  }
}

async function testKnowledgeBase(knowledgeBaseId: string, queries: string[]) {
  console.log(`🧪 Testing Knowledge Base: ${knowledgeBaseId}...\n`);

  try {
    const result = await invokeLambda(config.kbManagerFunction, {
      action: 'test-retrieval',
      knowledgeBaseId,
      testQueries: queries
    });

    console.log('📊 KNOWLEDGE BASE TEST RESULTS');
    console.log('===============================');
    console.log(`Success Rate: ${result.qualityMetrics.successRate.toFixed(1)}%`);
    console.log(`Total Queries: ${result.totalQueries}`);
    console.log(`Successful: ${result.successful}`);
    console.log(`Failed: ${result.failed}`);

    if (result.results && result.results.length > 0) {
      console.log('\n📝 Sample Results:');
      result.results.slice(0, 2).forEach((r: any, i: number) => {
        console.log(`\n${i + 1}. Query: "${r.query}"`);
        console.log(`   Results: ${r.retrieval.resultsCount}`);
        console.log(`   Answer: ${r.generation.answer.substring(0, 200)}...`);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Knowledge Base test failed:', error);
    process.exit(1);
  }
}

async function invokeLambda(functionName: string, payload: any) {
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: JSON.stringify(payload),
  });
  
  const response = await lambda.send(command);
  
  if (response.Payload) {
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    if (result.statusCode === 200) {
      return JSON.parse(result.body);
    } else {
      throw new Error(`Lambda function failed: ${result.body}`);
    }
  } else {
    throw new Error('No response payload from Lambda function');
  }
}

// Command line interface
const command = process.argv[2];
const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;

switch (command) {
  case 'full':
    testS3VectorsCrawler().catch(console.error);
    break;
  
  case 'crawler':
    testCrawlerOnly().catch(console.error);
    break;
  
  case 'kb':
    if (!knowledgeBaseId) {
      console.error('❌ KNOWLEDGE_BASE_ID environment variable required');
      process.exit(1);
    }
    const queries = process.argv.slice(3);
    const testQueries = queries.length > 0 ? queries : [
      'What is type 1 diabetes?',
      'How do I manage blood sugar?',
      'What foods should diabetics eat?'
    ];
    testKnowledgeBase(knowledgeBaseId, testQueries).catch(console.error);
    break;
  
  default:
    console.log('Usage:');
    console.log('  npm run test-s3-vectors-full     # Run complete test');
    console.log('  npm run test-s3-vectors-crawler  # Test crawler only');
    console.log('  npm run test-s3-vectors-kb       # Test Knowledge Base');
    break;
}

export { testS3VectorsCrawler, testCrawlerOnly, testKnowledgeBase };