#!/usr/bin/env node

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';

interface CrawlerTestConfig {
  region: string;
  bedrockCrawlerFunction: string;
  customCrawlerFunction: string;
  testUrls?: string[];
  maxPages?: number;
  outputDir: string;
}

const config: CrawlerTestConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  bedrockCrawlerFunction: process.env.BEDROCK_CRAWLER_FUNCTION || 'BedrockCrawlerTest',
  customCrawlerFunction: process.env.CUSTOM_CRAWLER_FUNCTION || 'CustomCrawlerTest',
  maxPages: 5, // Start with a small test
  outputDir: './crawler-test-results'
};

const lambda = new LambdaClient({ region: config.region });

async function testBothCrawlers() {
  console.log('🚀 Starting crawler comparison test...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  
  const testPayload = {
    testMode: true,
    maxPages: config.maxPages,
    urls: config.testUrls
  };
  
  try {
    // Test Bedrock crawler
    console.log('🤖 Testing Bedrock-enhanced crawler...');
    const bedrockResult = await invokeLambda(config.bedrockCrawlerFunction, testPayload);
    
    // Test custom Playwright crawler
    console.log('🎭 Testing custom Playwright crawler...');
    const customResult = await invokeLambda(config.customCrawlerFunction, testPayload);
    
    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    fs.writeFileSync(
      path.join(config.outputDir, `bedrock-results-${timestamp}.json`),
      JSON.stringify(bedrockResult, null, 2)
    );
    
    fs.writeFileSync(
      path.join(config.outputDir, `custom-results-${timestamp}.json`),
      JSON.stringify(customResult, null, 2)
    );
    
    // Generate comparison report
    const comparison = generateComparisonReport(bedrockResult, customResult);
    
    fs.writeFileSync(
      path.join(config.outputDir, `comparison-report-${timestamp}.json`),
      JSON.stringify(comparison, null, 2)
    );
    
    console.log('\n📊 CRAWLER COMPARISON RESULTS');
    console.log('================================');
    console.log(`Bedrock Crawler Success Rate: ${bedrockResult.report?.successRate?.toFixed(1)}%`);
    console.log(`Custom Crawler Success Rate: ${customResult.report?.successRate?.toFixed(1)}%`);
    console.log(`\nBedrock Avg Word Count: ${bedrockResult.report?.averageWordCount || 0}`);
    console.log(`Custom Avg Word Count: ${customResult.report?.averageWordCount || 0}`);
    console.log(`\nBedrock Enhanced Pages: ${bedrockResult.report?.bedrockEnhanced || 0}`);
    console.log(`Custom Avg Load Time: ${customResult.report?.averageLoadTime || 0}ms`);
    
    console.log('\n📈 DETAILED COMPARISON');
    console.log('======================');
    console.log(JSON.stringify(comparison, null, 2));
    
    console.log(`\n💾 Results saved to: ${config.outputDir}`);
    
    // Recommendations
    console.log('\n🎯 RECOMMENDATIONS');
    console.log('==================');
    
    if (comparison.bedrockAdvantages.length > 0) {
      console.log('✅ Bedrock Crawler Advantages:');
      comparison.bedrockAdvantages.forEach(adv => console.log(`   • ${adv}`));
    }
    
    if (comparison.customAdvantages.length > 0) {
      console.log('✅ Custom Crawler Advantages:');
      comparison.customAdvantages.forEach(adv => console.log(`   • ${adv}`));
    }
    
    console.log(`\n🏆 Recommended Approach: ${comparison.recommendation}`);
    console.log(`📝 Reasoning: ${comparison.reasoning}`);
    
  } catch (error) {
    console.error('❌ Crawler test failed:', error);
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

function generateComparisonReport(bedrockResult: any, customResult: any) {
  const bedrockReport = bedrockResult.report || {};
  const customReport = customResult.report || {};
  
  const comparison = {
    timestamp: new Date().toISOString(),
    bedrockCrawler: {
      successRate: bedrockReport.successRate || 0,
      averageWordCount: bedrockReport.averageWordCount || 0,
      bedrockEnhanced: bedrockReport.bedrockEnhanced || 0,
      totalLinks: bedrockReport.totalLinksFound || 0,
      errors: bedrockReport.errors?.length || 0
    },
    customCrawler: {
      successRate: customReport.successRate || 0,
      averageWordCount: customReport.averageWordCount || 0,
      averageLoadTime: customReport.averageLoadTime || 0,
      totalLinks: customReport.totalLinksFound || 0,
      totalImages: customReport.totalImagesFound || 0,
      jsPages: customReport.pagesWithJavaScript || 0,
      dynamicPages: customReport.pagesWithDynamicContent || 0,
      errors: customReport.errors?.length || 0
    },
    bedrockAdvantages: [] as string[],
    customAdvantages: [] as string[],
    recommendation: '',
    reasoning: ''
  };
  
  // Analyze advantages
  if (comparison.bedrockCrawler.successRate > comparison.customCrawler.successRate) {
    comparison.bedrockAdvantages.push('Higher success rate');
  }
  
  if (comparison.bedrockCrawler.bedrockEnhanced > 0) {
    comparison.bedrockAdvantages.push('AI-enhanced content cleaning and structuring');
  }
  
  if (comparison.bedrockCrawler.averageWordCount > comparison.customCrawler.averageWordCount * 1.1) {
    comparison.bedrockAdvantages.push('Extracts more comprehensive content');
  }
  
  if (comparison.customCrawler.successRate > comparison.bedrockCrawler.successRate) {
    comparison.customAdvantages.push('Higher success rate');
  }
  
  if (comparison.customCrawler.jsPages > 0) {
    comparison.customAdvantages.push('Handles JavaScript-rendered content');
  }
  
  if (comparison.customCrawler.totalImages > 0) {
    comparison.customAdvantages.push('Extracts images and media content');
  }
  
  if (comparison.customCrawler.averageLoadTime < 5000) {
    comparison.customAdvantages.push('Reasonable load times');
  }
  
  // Generate recommendation
  const bedrockScore = comparison.bedrockAdvantages.length + 
    (comparison.bedrockCrawler.bedrockEnhanced > 0 ? 2 : 0);
  const customScore = comparison.customAdvantages.length + 
    (comparison.customCrawler.jsPages > 0 ? 1 : 0);
  
  if (bedrockScore > customScore) {
    comparison.recommendation = 'Use Bedrock-enhanced crawler';
    comparison.reasoning = 'Bedrock provides superior content processing and AI enhancement capabilities';
  } else if (customScore > bedrockScore) {
    comparison.recommendation = 'Use custom Playwright crawler';
    comparison.reasoning = 'Custom crawler provides better JavaScript handling and more detailed extraction';
  } else {
    comparison.recommendation = 'Hybrid approach';
    comparison.reasoning = 'Consider using custom crawler for extraction and Bedrock for content enhancement';
  }
  
  return comparison;
}

// Run the test if this script is executed directly
if (require.main === module) {
  testBothCrawlers().catch(console.error);
}

export { testBothCrawlers, generateComparisonReport };