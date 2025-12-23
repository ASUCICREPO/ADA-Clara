import { Handler } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';

interface CrawlerEvent {
  action: 'test-crawl' | 'full-crawl' | 'process-content' | 'create-embeddings';
  urls?: string[];
  maxPages?: number;
  forceRefresh?: boolean;
}

interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  extractedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  wordCount: number;
  contentHash: string;
  metadata: {
    section: string;
    language: 'en' | 'es';
    lastModified?: string;
  };
}

interface CrawlError {
  url: string;
  error: string;
  success: boolean;
}

type CrawlResult = ScrapedContent | CrawlError;

interface ContentChunk {
  id: string;
  content: string;
  metadata: {
    url: string;
    title: string;
    chunkIndex: number;
    totalChunks: number;
    contentType: string;
    section: string;
    sourceUrl: string; // Explicit source URL for citations
    sourcePage: string; // Human-readable page name
  };
}

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const VECTORS_BUCKET = process.env.VECTORS_BUCKET!;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v1';

// Comprehensive list of diabetes.org URLs to crawl
const DIABETES_ORG_URLS = [
  // About Diabetes (15 pages)
  'https://diabetes.org/about-diabetes',
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/about-diabetes/warning-signs-symptoms',
  'https://diabetes.org/about-diabetes/complications',
  'https://diabetes.org/about-diabetes/a1c',
  'https://diabetes.org/about-diabetes/diabetes-prevention',
  'https://diabetes.org/about-diabetes/diabetes-prevention/dpp',
  'https://diabetes.org/about-diabetes/statistics',
  'https://diabetes.org/about-diabetes/diabetes-myths',
  'https://diabetes.org/about-diabetes/common-terms',
  'https://diabetes.org/about-diabetes/devices-technology',
  'https://diabetes.org/about-diabetes/vaccinations',
  'https://diabetes.org/about-diabetes/more-about-diabetes',
  
  // Living with Diabetes (8 pages)
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/living-with-diabetes/newly-diagnosed',
  'https://diabetes.org/living-with-diabetes/type-1',
  'https://diabetes.org/living-with-diabetes/type-2',
  'https://diabetes.org/living-with-diabetes/treatment-care',
  'https://diabetes.org/living-with-diabetes/treatment-care/checking-your-blood-sugar',
  'https://diabetes.org/living-with-diabetes/treatment-care/hyperglycemia',
  'https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose',
  'https://diabetes.org/living-with-diabetes/pregnancy/gestational-diabetes',
  
  // Food & Nutrition (10 pages)
  'https://diabetes.org/food-nutrition',
  'https://diabetes.org/food-nutrition/meal-planning',
  'https://diabetes.org/food-nutrition/understanding-carbs',
  'https://diabetes.org/food-nutrition/eating-healthy',
  'https://diabetes.org/food-nutrition/reading-food-labels',
  'https://diabetes.org/food-nutrition/food-and-diabetes',
  'https://diabetes.org/food-nutrition/food-blood-sugar',
  'https://diabetes.org/food-nutrition/eating-for-diabetes-management',
  'https://diabetes.org/food-nutrition/food-insecurity-diabetes',
  'https://diabetes.org/food-nutrition/cooking-classes',
  
  // Health & Wellness (13 pages)
  'https://diabetes.org/health-wellness',
  'https://diabetes.org/health-wellness/fitness',
  'https://diabetes.org/health-wellness/mental-health',
  'https://diabetes.org/health-wellness/medication-treatments',
  'https://diabetes.org/health-wellness/eye-health',
  'https://diabetes.org/health-wellness/keeping-your-mouth-healthy',
  'https://diabetes.org/health-wellness/sexual-health',
  'https://diabetes.org/health-wellness/weight-management',
  'https://diabetes.org/health-wellness/substance-use',
  'https://diabetes.org/health-wellness/diabetes-and-your-health',
  'https://diabetes.org/health-wellness/diabetes-and-your-health/your-healthcare-team',
  'https://diabetes.org/health-wellness/diabetes-and-your-heart/diabetes-affect-your-heart',
  'https://diabetes.org/health-wellness/better-choices-for-life',
  'https://diabetes.org/health-wellness/insulin-resistance',
  'https://diabetes.org/health-wellness/newsletter-signup',
  
  // Tools & Resources (13 pages)
  'https://diabetes.org/tools-resources',
  'https://diabetes.org/diabetes-risk-test',
  'https://diabetes.org/tools-resources/diabetes-education/lifestyle-change-programs',
  'https://diabetes.org/bmi-calculator',
  'https://diabetes.org/tools-support',
  'https://diabetes.org/project-power',
  'https://diabetes.org/diabetes-day-by-day',
  'https://diabetes.org/getting-sick-with-diabetes',
  'https://diabetes.org/diabetes-and-your-feet',
  'https://diabetes.org/kidney-care',
  'https://diabetes.org/camp',
  'https://diabetes.org/local',
  'https://diabetes.org/suppliers',
  
  // Advocacy (17 pages)
  'https://diabetes.org/advocacy',
  'https://diabetes.org/advocacy/advocacy-story-blog',
  'https://diabetes.org/advocacy/become-an-advocate',
  'https://diabetes.org/advocacy/grassroots-advocacy',
  'https://diabetes.org/advocacy/federal-connected-congress',
  'https://diabetes.org/advocacy/regional-advocacy-councils',
  'https://diabetes.org/advocacy/initiatives',
  'https://diabetes.org/advocacy/safe-at-school-state-laws',
  'https://diabetes.org/advocacy/safe-at-school-state-laws/help-for-schools',
  'https://diabetes.org/advocacy/know-your-rights',
  'https://diabetes.org/advocacy/know-your-rights/air-travel-and-diabetes',
  'https://diabetes.org/advocacy/know-your-rights/employment-discrimination',
  'https://diabetes.org/advocacy/amputation-prevention-alliance',
  'https://diabetes.org/advocacy/attorney-resources',
  'https://diabetes.org/advocacy/cgm-continuous-glucose-monitors',
  'https://diabetes.org/advocacy/obesity',
  'https://diabetes.org/advocacy/raise-your-voice/platform',
  
  // About Us (15 pages)
  'https://diabetes.org/about-us',
  'https://diabetes.org/about-us/newsroom',
  'https://diabetes.org/about-us/research',
  'https://diabetes.org/about-us/annual-reports',
  'https://diabetes.org/about-us/board-of-directors',
  'https://diabetes.org/about-us/executive-team',
  'https://diabetes.org/about-us/center-information',
  'https://diabetes.org/about-us/health-access-commitment',
  'https://diabetes.org/about-us/supporting-partners',
  'https://diabetes.org/about-us/policies',
  'https://diabetes.org/about-us/policies/privacy-policy',
  'https://diabetes.org/about-us/policies/terms-of-use',
  'https://diabetes.org/about-us/policies/how-to-reference-our-site',
  'https://diabetes.org/about-us/policies/removal-mailing-or-calling-lists-request-form',
  'https://diabetes.org/about-us/scam-alert-protect-yourself-diabetes-supply-fraud',
  
  // Ways to Give (10 pages)
  'https://diabetes.org/ways-to-give',
  'https://diabetes.org/ways-to-give/donate',
  'https://diabetes.org/ways-to-give/monthly-giving',
  'https://diabetes.org/ways-to-give/planned-giving',
  'https://diabetes.org/ways-to-give/corporate-partnerships',
  'https://diabetes.org/ways-to-give/fundraise',
  'https://diabetes.org/ways-to-give/workplace-giving',
  'https://diabetes.org/ways-to-give/memorial-tribute-gifts',
  'https://diabetes.org/ways-to-give/donor-advised-funds',
  'https://diabetes.org/ways-to-give/stock-gifts',
  
  // Community & Programs
  'https://diabetes.org/community',
  'https://diabetes.org/programs-and-initiatives',
  'https://diabetes.org/careers',
  'https://diabetes.org/events',
];

export const handler: Handler = async (event: CrawlerEvent) => {
  console.log('S3 Vectors Crawler Event:', JSON.stringify(event, null, 2));
  
  try {
    switch (event.action) {
      case 'test-crawl':
        return await testCrawl(event.urls || DIABETES_ORG_URLS.slice(0, 3));
      
      case 'full-crawl':
        return await fullCrawl(event.urls || DIABETES_ORG_URLS, event.forceRefresh);
      
      case 'process-content':
        return await processStoredContent();
      
      case 'create-embeddings':
        return await createEmbeddings();
      
      default:
        throw new Error(`Unknown action: ${event.action}`);
    }
  } catch (error) {
    console.error('S3 Vectors Crawler Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Crawler failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function testCrawl(urls: string[]) {
  console.log(`Testing crawl with ${urls.length} URLs...`);
  
  const results: CrawlResult[] = [];
  
  for (const url of urls) {
    try {
      console.log(`Testing: ${url}`);
      const content = await scrapeUrl(url);
      results.push(content);
      
      // Add delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error);
      results.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  }
  
  const successful = results.filter((r): r is ScrapedContent => !('error' in r));
  const failed = results.filter((r): r is CrawlError => 'error' in r);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Test crawl completed',
      totalUrls: urls.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / urls.length) * 100,
      results: successful,
      errors: failed,
      averageWordCount: successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length
    })
  };
}

async function fullCrawl(urls: string[], forceRefresh = false) {
  console.log(`Starting full crawl of ${urls.length} URLs...`);
  
  const results: CrawlResult[] = [];
  let processed = 0;
  let skipped = 0;
  
  for (const url of urls) {
    try {
      console.log(`Processing ${processed + 1}/${urls.length}: ${url}`);
      
      // Check if content already exists and is recent (unless force refresh)
      if (!forceRefresh && await isContentFresh(url)) {
        console.log(`Skipping ${url} - content is fresh`);
        skipped++;
        continue;
      }
      
      const content = await scrapeUrl(url);
      await storeContent(content);
      results.push(content);
      processed++;
      
      // Add delay to be respectful to diabetes.org
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`Failed to process ${url}:`, error);
      results.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  }
  
  console.log(`Full crawl completed. Processed: ${processed}, Skipped: ${skipped}`);
  
  // After crawling, process content into chunks and create embeddings
  if (processed > 0) {
    console.log('Processing content into chunks...');
    await processStoredContent();
    
    console.log('Creating embeddings...');
    await createEmbeddings();
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Full crawl completed',
      totalUrls: urls.length,
      processed,
      skipped,
      results: results.filter((r): r is ScrapedContent => !('error' in r)),
      errors: results.filter((r): r is CrawlError => 'error' in r)
    })
  };
}

async function scrapeUrl(url: string): Promise<ScrapedContent> {
  console.log(`Scraping: ${url}`);
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'ADA-Clara-Bot/1.0 (Educational/Medical Content Crawler)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
  });
  
  const $ = cheerio.load(response.data);
  
  // Remove unwanted elements
  $('script, style, nav, footer, .advertisement, .ads, .cookie-banner, .social-share').remove();
  
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
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      const text = element.text().trim();
      if (text.length > content.length) {
        content = text;
      }
    }
  }
  
  // Fallback to body if no main content found
  if (!content || content.length < 100) {
    content = $('body').text().trim();
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  // Determine content type and section
  const contentType = determineContentType(url, title, content);
  const section = extractSection(url);
  const language = url.includes('/es/') ? 'es' : 'en';
  
  // Create content hash for change detection
  const contentHash = crypto.createHash('md5').update(content).digest('hex');
  
  return {
    url,
    title,
    content,
    extractedAt: new Date().toISOString(),
    contentType,
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
    contentHash,
    metadata: {
      section,
      language,
      lastModified: response.headers['last-modified']
    }
  };
}

async function storeContent(content: ScrapedContent) {
  const key = `scraped-content/${content.metadata.section}/${encodeURIComponent(content.url)}.json`;
  
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: key,
    Body: JSON.stringify(content, null, 2),
    ContentType: 'application/json',
    Metadata: {
      url: content.url,
      contentType: content.contentType,
      section: content.metadata.section,
      language: content.metadata.language,
      wordCount: content.wordCount.toString(),
      contentHash: content.contentHash,
    }
  });
  
  await s3.send(command);
  console.log(`Stored content: ${key}`);
}

async function isContentFresh(url: string): Promise<boolean> {
  try {
    const section = extractSection(url);
    const key = `scraped-content/${section}/${encodeURIComponent(url)}.json`;
    
    const command = new GetObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: key,
    });
    
    const response = await s3.send(command);
    
    if (response.LastModified) {
      const ageInHours = (Date.now() - response.LastModified.getTime()) / (1000 * 60 * 60);
      return ageInHours < 168; // Fresh if less than 1 week old
    }
    
    return false;
  } catch (error) {
    return false; // Content doesn't exist, so not fresh
  }
}

async function processStoredContent() {
  console.log('Processing stored content into chunks...');
  
  const listCommand = new ListObjectsV2Command({
    Bucket: CONTENT_BUCKET,
    Prefix: 'scraped-content/',
  });
  
  const response = await s3.send(listCommand);
  const objects = response.Contents || [];
  
  let processedCount = 0;
  
  for (const object of objects) {
    if (!object.Key?.endsWith('.json')) continue;
    
    try {
      // Get the content
      const getCommand = new GetObjectCommand({
        Bucket: CONTENT_BUCKET,
        Key: object.Key,
      });
      
      const contentResponse = await s3.send(getCommand);
      const contentStr = await contentResponse.Body?.transformToString();
      
      if (!contentStr) continue;
      
      const content: ScrapedContent = JSON.parse(contentStr);
      
      // Create chunks
      const chunks = createContentChunks(content);
      
      // Store chunks
      for (const chunk of chunks) {
        await storeChunk(chunk);
      }
      
      processedCount++;
      console.log(`Processed content: ${content.url} (${chunks.length} chunks)`);
      
    } catch (error) {
      console.error(`Failed to process ${object.Key}:`, error);
    }
  }
  
  console.log(`Content processing completed. Processed ${processedCount} items.`);
  return processedCount;
}

function createContentChunks(content: ScrapedContent): ContentChunk[] {
  const maxChunkSize = 1000; // words per chunk
  const overlapSize = 100; // words overlap between chunks
  
  const words = content.content.split(/\s+/);
  const chunks: ContentChunk[] = [];
  
  // Create human-readable page name from URL
  const sourcePage = content.url
    .replace('https://diabetes.org/', '')
    .split('/')
    .map(part => part.replace(/-/g, ' '))
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' > ');
  
  for (let i = 0; i < words.length; i += maxChunkSize - overlapSize) {
    const chunkWords = words.slice(i, i + maxChunkSize);
    const chunkContent = chunkWords.join(' ');
    
    const chunkId = crypto.createHash('md5')
      .update(`${content.url}-${i}`)
      .digest('hex');
    
    chunks.push({
      id: chunkId,
      content: chunkContent,
      metadata: {
        url: content.url,
        title: content.title,
        chunkIndex: Math.floor(i / (maxChunkSize - overlapSize)),
        totalChunks: Math.ceil(words.length / (maxChunkSize - overlapSize)),
        contentType: content.contentType,
        section: content.metadata.section,
        sourceUrl: content.url, // Explicit source URL for citations
        sourcePage: sourcePage, // Human-readable page name
      }
    });
  }
  
  return chunks;
}

async function storeChunk(chunk: ContentChunk) {
  const key = `chunks/${chunk.metadata.section}/${chunk.id}.json`;
  
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: key,
    Body: JSON.stringify(chunk, null, 2),
    ContentType: 'application/json',
    Metadata: {
      chunkId: chunk.id,
      url: chunk.metadata.url,
      section: chunk.metadata.section,
      chunkIndex: chunk.metadata.chunkIndex.toString(),
      sourceUrl: chunk.metadata.sourceUrl,
      sourcePage: chunk.metadata.sourcePage,
    }
  });
  
  await s3.send(command);
}

async function createEmbeddings() {
  console.log('Creating embeddings for chunks...');
  
  const listCommand = new ListObjectsV2Command({
    Bucket: CONTENT_BUCKET,
    Prefix: 'chunks/',
  });
  
  const response = await s3.send(listCommand);
  const objects = response.Contents || [];
  
  let embeddingCount = 0;
  
  for (const object of objects) {
    if (!object.Key?.endsWith('.json')) continue;
    
    try {
      // Get the chunk
      const getCommand = new GetObjectCommand({
        Bucket: CONTENT_BUCKET,
        Key: object.Key,
      });
      
      const chunkResponse = await s3.send(getCommand);
      const chunkStr = await chunkResponse.Body?.transformToString();
      
      if (!chunkStr) continue;
      
      const chunk: ContentChunk = JSON.parse(chunkStr);
      
      // Check if embedding already exists in S3 Vectors format
      const embeddingKey = `vectors/${chunk.metadata.section}/${chunk.id}.json`;
      
      if (await embeddingExists(embeddingKey)) {
        continue; // Skip if embedding already exists
      }
      
      // Create embedding
      const embedding = await createEmbedding(chunk.content);
      
      // Store embedding in S3 Vectors format
      const embeddingData = {
        id: chunk.id,
        vector: embedding,
        content: chunk.content, // S3 Vectors requires content field
        metadata: chunk.metadata,
        timestamp: new Date().toISOString(),
      };
      
      const putCommand = new PutObjectCommand({
        Bucket: VECTORS_BUCKET,
        Key: `vectors/${chunk.metadata.section}/${chunk.id}.json`, // S3 Vectors path structure
        Body: JSON.stringify(embeddingData, null, 2),
        ContentType: 'application/json',
        Metadata: {
          chunkId: chunk.id,
          section: chunk.metadata.section,
          embeddingModel: EMBEDDING_MODEL,
          vectorDimensions: embedding.length.toString(),
        }
      });
      
      await s3.send(putCommand);
      embeddingCount++;
      
      console.log(`Created embedding: ${chunk.id}`);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Failed to create embedding for ${object.Key}:`, error);
    }
  }
  
  console.log(`Embedding creation completed. Created ${embeddingCount} embeddings.`);
  return embeddingCount;
}

async function createEmbedding(text: string): Promise<number[]> {
  const command = new InvokeModelCommand({
    modelId: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/${EMBEDDING_MODEL}`,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text.substring(0, 8000), // Titan embedding limit
    })
  });
  
  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  return responseBody.embedding;
}

async function embeddingExists(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: key,
    });
    
    await s3.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

function determineContentType(url: string, title: string, content: string): 'article' | 'faq' | 'resource' | 'event' {
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

function extractSection(url: string): string {
  const sections = [
    'about-diabetes',
    'living-with-diabetes',
    'food-nutrition',
    'health-wellness',
    'tools-resources',
    'advocacy',
    'about-us'
  ];
  
  for (const section of sections) {
    if (url.includes(section)) {
      return section;
    }
  }
  
  return 'general';
}