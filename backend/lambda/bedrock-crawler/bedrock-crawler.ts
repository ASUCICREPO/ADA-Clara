import { Handler } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  extractedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  wordCount: number;
  links: string[];
  success: boolean;
  error?: string;
  metadata?: {
    keyTopics?: string[];
    medicalFacts?: string[];
    bedrockConfidence?: number;
    enhancedWithBedrock?: boolean;
    bedrockError?: string;
  };
}

interface BedrockCrawlRequest {
  urls?: string[];
  maxPages?: number;
  testMode?: boolean;
}

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';

// Test URLs from diabetes.org to evaluate crawler performance
const TEST_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources',
  'https://diabetes.org/community',
  'https://diabetes.org/professionals'
];

export const handler: Handler = async (event: BedrockCrawlRequest) => {
  console.log('Starting Bedrock web crawler test', { event });
  
  const urlsToTest = event.urls || TEST_URLS;
  const maxPages = event.maxPages || urlsToTest.length;
  const testMode = event.testMode !== false; // Default to test mode
  
  const results: CrawlResult[] = [];
  
  try {
    // Test each URL with different approaches
    for (let i = 0; i < Math.min(maxPages, urlsToTest.length); i++) {
      const url = urlsToTest[i];
      console.log(`Testing URL ${i + 1}/${maxPages}: ${url}`);
      
      try {
        // Method 1: Direct HTTP scraping with Cheerio
        const directResult = await scrapeWithCheerio(url);
        
        // Method 2: Enhanced content extraction with Bedrock
        const bedrockResult = await enhanceContentWithBedrock(directResult);
        
        results.push(bedrockResult);
        
        // Store result in S3 for analysis
        if (!testMode) {
          await storeContentInS3(bedrockResult);
        }
        
        // Add delay to be respectful to the target site
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        results.push({
          url,
          title: '',
          content: '',
          extractedAt: new Date().toISOString(),
          contentType: 'article',
          wordCount: 0,
          links: [],
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Generate summary report
    const report = generateCrawlReport(results);
    console.log('Crawl Report:', JSON.stringify(report, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Bedrock crawler test completed',
        results,
        report,
        testMode
      })
    };
    
  } catch (error) {
    console.error('Crawler test failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Crawler test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function scrapeWithCheerio(url: string): Promise<CrawlResult> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'ADA-Clara-Bot/1.0 (Educational/Medical Content Crawler)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
  });
  
  const $ = cheerio.load(response.data);
  
  // Remove script and style elements
  $('script, style, nav, footer, .advertisement, .ads').remove();
  
  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
  
  // Extract main content - try multiple selectors
  const contentSelectors = [
    'main',
    '.main-content',
    '.content',
    '.article-content',
    '.post-content',
    'article',
    '.entry-content'
  ];
  
  let content = '';
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text().trim();
      break;
    }
  }
  
  // Fallback to body if no main content found
  if (!content) {
    content = $('body').text().trim();
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
    if (href && href.includes(TARGET_DOMAIN)) {
      links.push(href);
    }
  });
  
  // Determine content type based on URL and content
  const contentType = determineContentType(url, title, content);
  
  return {
    url,
    title,
    content,
    extractedAt: new Date().toISOString(),
    contentType,
    wordCount: content.split(/\s+/).length,
    links: [...new Set(links)], // Remove duplicates
    success: true
  };
}

async function enhanceContentWithBedrock(crawlResult: CrawlResult): Promise<CrawlResult> {
  if (!crawlResult.success || !crawlResult.content) {
    return crawlResult;
  }
  
  try {
    // Use Bedrock to clean and structure the content
    const prompt = `
You are a content processor for a medical information system. Please analyze and clean the following web content from diabetes.org:

Title: ${crawlResult.title}
URL: ${crawlResult.url}
Raw Content: ${crawlResult.content.substring(0, 4000)}...

Please:
1. Extract the main medical/educational content, removing navigation, ads, and boilerplate text
2. Identify the content type (article, FAQ, resource, event)
3. Provide a clean, structured version of the content
4. Maintain all important medical information and facts

Respond in JSON format:
{
  "cleanedContent": "cleaned content here",
  "contentType": "article|faq|resource|event",
  "keyTopics": ["topic1", "topic2"],
  "medicalFacts": ["fact1", "fact2"],
  "confidence": 0.95
}
`;

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    
    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Parse Bedrock response
    let bedrockAnalysis;
    try {
      bedrockAnalysis = JSON.parse(responseBody.content[0].text);
    } catch {
      // If JSON parsing fails, use the raw response
      bedrockAnalysis = {
        cleanedContent: responseBody.content[0].text,
        contentType: crawlResult.contentType,
        keyTopics: [],
        medicalFacts: [],
        confidence: 0.5
      };
    }
    
    // Update the crawl result with Bedrock enhancements
    return {
      ...crawlResult,
      content: bedrockAnalysis.cleanedContent || crawlResult.content,
      contentType: bedrockAnalysis.contentType || crawlResult.contentType,
      wordCount: (bedrockAnalysis.cleanedContent || crawlResult.content).split(/\s+/).length,
      // Add metadata from Bedrock analysis
      metadata: {
        keyTopics: bedrockAnalysis.keyTopics || [],
        medicalFacts: bedrockAnalysis.medicalFacts || [],
        bedrockConfidence: bedrockAnalysis.confidence || 0,
        enhancedWithBedrock: true
      }
    };
    
  } catch (error) {
    console.error('Bedrock enhancement failed:', error);
    // Return original result if Bedrock fails
    return {
      ...crawlResult,
      metadata: {
        enhancedWithBedrock: false,
        bedrockError: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

function determineContentType(url: string, title: string, content: string): 'article' | 'faq' | 'resource' | 'event' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  if (urlLower.includes('faq') || titleLower.includes('faq') || 
      contentLower.includes('frequently asked') || contentLower.includes('common questions')) {
    return 'faq';
  }
  
  if (urlLower.includes('event') || urlLower.includes('calendar') || 
      titleLower.includes('event') || contentLower.includes('register')) {
    return 'event';
  }
  
  if (urlLower.includes('resource') || urlLower.includes('tool') || 
      titleLower.includes('resource') || titleLower.includes('tool')) {
    return 'resource';
  }
  
  return 'article';
}

async function storeContentInS3(result: CrawlResult): Promise<void> {
  const key = `scraped-content/${new Date().toISOString().split('T')[0]}/${encodeURIComponent(result.url)}.json`;
  
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: key,
    Body: JSON.stringify(result, null, 2),
    ContentType: 'application/json',
    Metadata: {
      url: result.url,
      contentType: result.contentType,
      extractedAt: result.extractedAt,
      wordCount: result.wordCount.toString(),
    }
  });
  
  await s3.send(command);
  console.log(`Stored content in S3: ${key}`);
}

function generateCrawlReport(results: CrawlResult[]) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const contentTypes = successful.reduce((acc, r) => {
    acc[r.contentType] = (acc[r.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgWordCount = successful.length > 0 
    ? successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length 
    : 0;
  
  const totalLinks = successful.reduce((sum, r) => sum + r.links.length, 0);
  
  return {
    totalUrls: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    contentTypes,
    averageWordCount: Math.round(avgWordCount),
    totalLinksFound: totalLinks,
    errors: failed.map(r => ({ url: r.url, error: r.error })),
    bedrockEnhanced: successful.filter(r => r.metadata?.enhancedWithBedrock).length,
    bedrockErrors: successful.filter(r => r.metadata?.bedrockError).length
  };
}