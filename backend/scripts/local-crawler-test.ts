#!/usr/bin/env node

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface LocalTestResult {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  links: string[];
  contentType: string;
  extractedAt: string;
  success: boolean;
  error?: string;
  extractionMethod: 'cheerio' | 'basic';
}

const TEST_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes'
];

async function runLocalCrawlerTest() {
  console.log('🧪 Running local crawler test (no AWS required)...\n');
  
  const results: LocalTestResult[] = [];
  const outputDir = './local-crawler-results';
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    console.log(`Testing ${i + 1}/${TEST_URLS.length}: ${url}`);
    
    try {
      const result = await scrapeUrl(url);
      results.push(result);
      console.log(`✅ Success: ${result.title} (${result.wordCount} words)`);
    } catch (error) {
      const errorResult: LocalTestResult = {
        url,
        title: '',
        content: '',
        wordCount: 0,
        links: [],
        contentType: 'article',
        extractedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        extractionMethod: 'basic'
      };
      results.push(errorResult);
      console.log(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Be respectful to the target site
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Generate report
  const report = generateLocalReport(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Save results
  fs.writeFileSync(
    path.join(outputDir, `local-test-results-${timestamp}.json`),
    JSON.stringify({ results, report }, null, 2)
  );
  
  console.log('\n📊 LOCAL CRAWLER TEST RESULTS');
  console.log('==============================');
  console.log(`Success Rate: ${report.successRate.toFixed(1)}%`);
  console.log(`Average Word Count: ${report.averageWordCount}`);
  console.log(`Total Links Found: ${report.totalLinks}`);
  console.log(`Content Types: ${JSON.stringify(report.contentTypes)}`);
  
  if (report.errors.length > 0) {
    console.log('\n❌ Errors:');
    report.errors.forEach(error => {
      console.log(`   • ${error.url}: ${error.error}`);
    });
  }
  
  console.log('\n🔍 CONTENT QUALITY ANALYSIS');
  console.log('============================');
  
  const successful = results.filter(r => r.success);
  successful.forEach(result => {
    console.log(`\n📄 ${result.title}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Word Count: ${result.wordCount}`);
    console.log(`   Links Found: ${result.links.length}`);
    console.log(`   Content Type: ${result.contentType}`);
    console.log(`   Content Preview: ${result.content.substring(0, 200)}...`);
  });
  
  console.log(`\n💾 Detailed results saved to: ${outputDir}`);
  
  // Provide recommendations for AWS implementation
  console.log('\n🎯 RECOMMENDATIONS FOR AWS IMPLEMENTATION');
  console.log('=========================================');
  
  if (report.successRate > 80) {
    console.log('✅ Basic HTTP scraping works well for diabetes.org');
    console.log('✅ Bedrock enhancement should focus on content cleaning and structuring');
    console.log('✅ Consider using simple HTTP requests + Bedrock for cost efficiency');
  } else {
    console.log('⚠️  Basic HTTP scraping has issues - JavaScript rendering may be needed');
    console.log('⚠️  Consider Playwright for better content extraction');
    console.log('⚠️  Test both approaches in AWS Lambda environment');
  }
  
  if (report.averageWordCount < 500) {
    console.log('⚠️  Low word count suggests content extraction issues');
    console.log('💡 Try different CSS selectors or wait for JavaScript rendering');
  }
  
  if (report.totalLinks < 10) {
    console.log('⚠️  Few links found - may indicate extraction problems');
    console.log('💡 Verify link extraction logic and URL resolution');
  }
  
  return { results, report };
}

async function scrapeUrl(url: string): Promise<LocalTestResult> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'ADA-Clara-Bot/1.0 (Educational/Medical Content Crawler)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
  });
  
  const $ = cheerio.load(response.data);
  
  // Remove unwanted elements
  $('script, style, nav, footer, .advertisement, .ads, .cookie-banner').remove();
  
  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
  
  // Extract main content using multiple strategies
  const contentSelectors = [
    'main',
    '.main-content',
    '.content',
    '.article-content',
    '.post-content',
    'article',
    '.entry-content',
    '.page-content'
  ];
  
  let content = '';
  let extractionMethod: 'cheerio' | 'basic' = 'basic';
  
  // Try each selector
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      const text = element.text().trim();
      if (text.length > content.length) {
        content = text;
        extractionMethod = 'cheerio';
      }
    }
  }
  
  // Fallback to body if no main content found
  if (!content || content.length < 100) {
    content = $('body').text().trim();
    extractionMethod = 'basic';
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  // Extract links
  const links: string[] = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      if (href.includes('diabetes.org')) {
        links.push(href);
      } else if (href.startsWith('/')) {
        links.push(`https://diabetes.org${href}`);
      }
    }
  });
  
  // Determine content type
  const contentType = determineContentType(url, title, content);
  
  return {
    url,
    title,
    content,
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
    links: [...new Set(links)], // Remove duplicates
    contentType,
    extractedAt: new Date().toISOString(),
    success: true,
    extractionMethod
  };
}

function determineContentType(url: string, title: string, content: string): string {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  if (urlLower.includes('faq') || titleLower.includes('faq') || 
      contentLower.includes('frequently asked')) {
    return 'faq';
  }
  
  if (urlLower.includes('event') || titleLower.includes('event') || 
      contentLower.includes('register')) {
    return 'event';
  }
  
  if (urlLower.includes('resource') || urlLower.includes('tool') || 
      titleLower.includes('resource')) {
    return 'resource';
  }
  
  return 'article';
}

function generateLocalReport(results: LocalTestResult[]) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const contentTypes = successful.reduce((acc, r) => {
    acc[r.contentType] = (acc[r.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgWordCount = successful.length > 0 
    ? Math.round(successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length)
    : 0;
  
  const totalLinks = successful.reduce((sum, r) => sum + r.links.length, 0);
  
  return {
    totalUrls: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    contentTypes,
    averageWordCount: avgWordCount,
    totalLinks,
    errors: failed.map(r => ({ url: r.url, error: r.error })),
    extractionMethods: {
      cheerio: successful.filter(r => r.extractionMethod === 'cheerio').length,
      basic: successful.filter(r => r.extractionMethod === 'basic').length
    }
  };
}

// Run the test if this script is executed directly
if (require.main === module) {
  runLocalCrawlerTest().catch(console.error);
}

export { runLocalCrawlerTest };