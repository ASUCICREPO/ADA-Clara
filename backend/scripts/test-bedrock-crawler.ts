#!/usr/bin/env node

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';

interface BedrockCrawlerTestConfig {
  region: string;
  crawlerTestFunction: string;
  outputDir: string;
}

const config: BedrockCrawlerTestConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  crawlerTestFunction: process.env.CRAWLER_TEST_FUNCTION || 'BedrockWebCrawlerStack-CrawlerTestLambda',
  outputDir: './bedrock-crawler-results'
};

const lambda = new LambdaClient({ region: config.region });

async function testBedrockWebCrawler() {
  console.log('🚀 Starting Amazon Bedrock Web Crawler test...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  try {
    console.log('📋 Step 1: Running full Bedrock Web Crawler test...');
    const fullTestResult = await invokeLambda(config.crawlerTestFunction, {
      action: 'full-test'
    });

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    fs.writeFileSync(
      path.join(config.outputDir, `bedrock-crawler-test-${timestamp}.json`),
      JSON.stringify(fullTestResult, null, 2)
    );

    console.log('\n📊 BEDROCK WEB CRAWLER TEST RESULTS');
    console.log('===================================');
    
    if (fullTestResult.steps?.setup) {
      console.log(`✅ Knowledge Base ID: ${fullTestResult.steps.setup.knowledgeBaseId}`);
      console.log(`✅ Data Source ID: ${fullTestResult.steps.setup.dataSourceId}`);
    }

    if (fullTestResult.steps?.status) {
      const status = fullTestResult.steps.status.summary;
      console.log(`📈 Ingestion Jobs - Completed: ${status.completed}, In Progress: ${status.inProgress}, Failed: ${status.failed}`);
    }

    if (fullTestResult.steps?.queries) {
      const queries = fullTestResult.steps.queries;
      console.log(`🎯 Query Success Rate: ${queries.qualityMetrics.successRate.toFixed(1)}%`);
      console.log(`📝 Average Results per Query: ${queries.qualityMetrics.averageResultsPerQuery.toFixed(1)}`);
      console.log(`🔗 Queries with Citations: ${queries.qualityMetrics.queriesWithCitations}`);
    }

    console.log(`\n🏆 Recommendation: ${fullTestResult.recommendation}`);
    console.log(`💾 Detailed results saved to: ${config.outputDir}`);

    // If setup was successful, offer additional testing options
    if (fullTestResult.steps?.setup?.knowledgeBaseId) {
      console.log('\n🔧 ADDITIONAL TESTING OPTIONS');
      console.log('=============================');
      console.log('Run these commands for more detailed testing:');
      console.log(`export KNOWLEDGE_BASE_ID=${fullTestResult.steps.setup.knowledgeBaseId}`);
      console.log('npm run test-bedrock-queries  # Test custom queries');
      console.log('npm run test-bedrock-compare  # Compare with custom crawler');
    }

    return fullTestResult;

  } catch (error) {
    console.error('❌ Bedrock Web Crawler test failed:', error);
    process.exit(1);
  }
}

async function testCustomQueries(knowledgeBaseId: string, queries: string[]) {
  console.log('🧪 Testing custom queries against Bedrock Knowledge Base...\n');

  const result = await invokeLambda(config.crawlerTestFunction, {
    action: 'query',
    knowledgeBaseId,
    testQueries: queries
  });

  console.log('📊 CUSTOM QUERY RESULTS');
  console.log('=======================');
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
}

async function compareWithCustomCrawler(knowledgeBaseId: string) {
  console.log('⚖️  Comparing Bedrock Web Crawler with Custom Crawler...\n');

  const result = await invokeLambda(config.crawlerTestFunction, {
    action: 'compare',
    knowledgeBaseId
  });

  console.log('📊 CRAWLER COMPARISON');
  console.log('====================');
  console.log('Bedrock Web Crawler:');
  console.log(`  ✅ Managed infrastructure`);
  console.log(`  ✅ Automatic scheduling`);
  console.log(`  ✅ Built-in vector processing`);
  
  console.log('\nCustom Crawler:');
  console.log(`  ✅ Full control over extraction`);
  console.log(`  ✅ JavaScript rendering`);
  console.log(`  ✅ Medical content optimization`);

  return result;
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
    testBedrockWebCrawler().catch(console.error);
    break;
  
  case 'queries':
    if (!knowledgeBaseId) {
      console.error('❌ KNOWLEDGE_BASE_ID environment variable required');
      process.exit(1);
    }
    const customQueries = process.argv.slice(3);
    const queries = customQueries.length > 0 ? customQueries : [
      'What is type 1 diabetes?',
      'How do I manage blood sugar?',
      'What foods should diabetics eat?'
    ];
    testCustomQueries(knowledgeBaseId, queries).catch(console.error);
    break;
  
  case 'compare':
    if (!knowledgeBaseId) {
      console.error('❌ KNOWLEDGE_BASE_ID environment variable required');
      process.exit(1);
    }
    compareWithCustomCrawler(knowledgeBaseId).catch(console.error);
    break;
  
  default:
    console.log('Usage:');
    console.log('  npm run test-bedrock-full      # Run complete test');
    console.log('  npm run test-bedrock-queries   # Test custom queries');
    console.log('  npm run test-bedrock-compare   # Compare approaches');
    break;
}

export { testBedrockWebCrawler, testCustomQueries, compareWithCustomCrawler };