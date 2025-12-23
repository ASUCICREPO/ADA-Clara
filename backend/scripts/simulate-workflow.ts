#!/usr/bin/env node

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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
  };
}

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

interface MockEmbedding {
  id: string;
  vector: number[];
  content: string;
  metadata: any;
  timestamp: string; // S3 Vectors format
}

const OUTPUT_DIR = './workflow-simulation';
const TEST_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/living-with-diabetes'
];

async function simulateWorkflow() {
  console.log('🧪 Simulating S3 Vectors Workflow Locally...\n');
  console.log('📋 This simulation shows the data flow without AWS:');
  console.log('   1. Scrape diabetes.org content');
  console.log('   2. Save raw content (simulates S3 storage)');
  console.log('   3. Process content into chunks');
  console.log('   4. Generate mock embeddings (simulates Bedrock)');
  console.log('   5. Save in S3 Vectors format');
  console.log('   6. Show final data structure\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Create subdirectories to simulate S3 Vectors structure
  const dirs = [
    'scraped-content/about-diabetes',
    'scraped-content/living-with-diabetes',
    'chunks/about-diabetes',
    'chunks/living-with-diabetes',
    'vectors/about-diabetes', // Changed from 'embeddings' to 'vectors'
    'vectors/living-with-diabetes'
  ];

  dirs.forEach(dir => {
    const fullPath = path.join(OUTPUT_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  const workflowResults: any = {
    timestamp: new Date().toISOString(),
    steps: {}
  };

  try {
    // Step 1: Scrape content
    console.log('📋 Step 1: Scraping diabetes.org content...');
    const scrapedContent: ScrapedContent[] = [];
    
    for (const url of TEST_URLS) {
      try {
        console.log(`   Scraping: ${url}`);
        const content = await scrapeUrl(url);
        scrapedContent.push(content);
        
        // Save raw content
        const section = extractSection(url);
        const filename = `${encodeURIComponent(url)}.json`;
        const filepath = path.join(OUTPUT_DIR, 'scraped-content', section, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Be respectful
      } catch (error) {
        console.log(`   ❌ Failed: ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    workflowResults.steps.scraping = {
      totalUrls: TEST_URLS.length,
      successful: scrapedContent.length,
      successRate: (scrapedContent.length / TEST_URLS.length) * 100,
      averageWordCount: scrapedContent.reduce((sum, c) => sum + c.wordCount, 0) / scrapedContent.length
    };

    console.log(`   ✅ Scraped ${scrapedContent.length}/${TEST_URLS.length} URLs successfully`);

    // Step 2: Process into chunks
    console.log('\n📋 Step 2: Processing content into chunks...');
    const allChunks: ContentChunk[] = [];
    
    for (const content of scrapedContent) {
      const chunks = createContentChunks(content);
      allChunks.push(...chunks);
      
      // Save chunks
      const section = content.metadata.section;
      for (const chunk of chunks) {
        const filepath = path.join(OUTPUT_DIR, 'chunks', section, `${chunk.id}.json`);
        fs.writeFileSync(filepath, JSON.stringify(chunk, null, 2));
      }
    }

    workflowResults.steps.chunking = {
      totalChunks: allChunks.length,
      averageChunkSize: allChunks.reduce((sum, c) => sum + c.content.split(' ').length, 0) / allChunks.length
    };

    console.log(`   ✅ Created ${allChunks.length} chunks`);

    // Step 3: Generate mock embeddings
    console.log('\n📋 Step 3: Generating mock embeddings...');
    const vectors: MockEmbedding[] = []; // Changed from 'embeddings' to 'vectors'
    
    for (const chunk of allChunks) {
      const vector = createMockEmbedding(chunk); // Changed from 'embedding' to 'vector'
      vectors.push(vector);
      
      // Save embedding in S3 Vectors format
      const section = chunk.metadata.section;
      const filename = `${chunk.id}.json`; // S3 Vectors uses .json not .embedding.json
      const filepath = path.join(OUTPUT_DIR, 'vectors', section, filename); // Changed from 'embeddings' to 'vectors'
      
      fs.writeFileSync(filepath, JSON.stringify(vector, null, 2));
    }

    workflowResults.steps.vectors = { // Changed from 'embeddings'
      totalVectors: vectors.length, // Changed from 'totalEmbeddings'
      vectorDimensions: vectors[0]?.vector.length || 0
    };

    console.log(`   ✅ Generated ${vectors.length} vectors (${vectors[0]?.vector.length || 0} dimensions)`);

    // Step 4: Generate summary
    console.log('\n📋 Step 4: Analyzing workflow results...');
    
    const fileStats = analyzeGeneratedFiles();
    workflowResults.steps.analysis = fileStats;

    // Step 5: Show sample data
    console.log('\n📋 Step 5: Sample data inspection...');
    const samples = inspectSampleData();
    workflowResults.steps.samples = samples;

    // Save workflow results
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'workflow-results.json'),
      JSON.stringify(workflowResults, null, 2)
    );

    // Display results
    console.log('\n📊 WORKFLOW SIMULATION RESULTS');
    console.log('==============================');
    console.log(`✅ Scraping: ${workflowResults.steps.scraping.successRate.toFixed(1)}% success rate`);
    console.log(`✅ Content: ${fileStats.rawContent} raw files, ${fileStats.chunks} chunks`);
    console.log(`✅ Vectors: ${fileStats.vectors} vectors`); // Changed from 'embeddings'
    console.log(`✅ Avg Word Count: ${workflowResults.steps.scraping.averageWordCount.toFixed(0)}`);
    console.log(`✅ Avg Chunk Size: ${workflowResults.steps.chunking.averageChunkSize.toFixed(0)} words`);

    console.log('\n📁 GENERATED FILE STRUCTURE');
    console.log('============================');
    displayFileStructure();

    console.log('\n📄 SAMPLE CONTENT');
    console.log('=================');
    console.log(`Raw Content: ${samples.rawContent?.title || 'N/A'}`);
    console.log(`Chunk: ${samples.chunk?.content?.substring(0, 100) || 'N/A'}...`);
    console.log(`Vector: [${samples.vector?.vector?.slice(0, 5).join(', ') || 'N/A'}...] (${samples.vector?.vector?.length || 0} dims)`);

    console.log('\n🚀 NEXT STEPS');
    console.log('=============');
    console.log('1. Review the generated files in ./workflow-simulation/');
    console.log('2. Deploy to AWS: npm run deploy-s3-vectors');
    console.log('3. Run real workflow: npm run test-workflow');
    console.log('4. Create Knowledge Base and test retrieval');

    console.log(`\n💾 All results saved to: ${OUTPUT_DIR}`);

    return workflowResults;

  } catch (error) {
    console.error('❌ Workflow simulation failed:', error);
    process.exit(1);
  }
}

async function scrapeUrl(url: string): Promise<ScrapedContent> {
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
  
  // Extract main content
  const contentSelectors = [
    'main', '.main-content', '.content', '.article-content', 
    '.post-content', 'article', '.entry-content'
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
  
  if (!content || content.length < 100) {
    content = $('body').text().trim();
  }
  
  // Clean content
  content = content.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  
  const contentHash = crypto.createHash('md5').update(content).digest('hex');
  
  return {
    url,
    title,
    content,
    extractedAt: new Date().toISOString(),
    contentType: determineContentType(url, title, content),
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
    contentHash,
    metadata: {
      section: extractSection(url),
      language: url.includes('/es/') ? 'es' : 'en'
    }
  };
}

function createContentChunks(content: ScrapedContent): ContentChunk[] {
  const maxChunkSize = 1000; // words per chunk
  const overlapSize = 100; // words overlap
  
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

function createMockEmbedding(chunk: ContentChunk): MockEmbedding {
  // Generate mock 1536-dimensional vector (Titan embedding size)
  const vector = Array.from({ length: 1536 }, () => (Math.random() - 0.5) * 2);
  
  return {
    id: chunk.id,
    vector,
    content: chunk.content, // S3 Vectors requires content field
    metadata: chunk.metadata,
    timestamp: new Date().toISOString() // Changed from createdAt to timestamp
  };
}

function extractSection(url: string): string {
  const sections = [
    'about-diabetes', 'living-with-diabetes', 'food-nutrition',
    'health-wellness', 'tools-resources', 'advocacy', 'about-us'
  ];
  
  for (const section of sections) {
    if (url.includes(section)) {
      return section;
    }
  }
  
  return 'general';
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

function analyzeGeneratedFiles() {
  const stats = {
    rawContent: 0,
    chunks: 0,
    vectors: 0, // Changed from 'embeddings' to 'vectors'
    totalSize: 0
  };

  try {
    // Count files in each directory
    const scrapedDir = path.join(OUTPUT_DIR, 'scraped-content');
    const chunksDir = path.join(OUTPUT_DIR, 'chunks');
    const vectorsDir = path.join(OUTPUT_DIR, 'vectors'); // Changed from 'embeddings'

    if (fs.existsSync(scrapedDir)) {
      stats.rawContent = countFilesRecursively(scrapedDir);
    }
    
    if (fs.existsSync(chunksDir)) {
      stats.chunks = countFilesRecursively(chunksDir);
    }
    
    if (fs.existsSync(vectorsDir)) {
      stats.vectors = countFilesRecursively(vectorsDir);
    }

  } catch (error) {
    console.log('Error analyzing files:', error);
  }

  return stats;
}

function countFilesRecursively(dir: string): number {
  let count = 0;
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        count += countFilesRecursively(fullPath);
      } else if (stat.isFile() && item.endsWith('.json')) {
        count++;
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return count;
}

function inspectSampleData() {
  const samples: any = {};

  try {
    // Get sample raw content
    const scrapedFiles = fs.readdirSync(path.join(OUTPUT_DIR, 'scraped-content'), { recursive: true });
    const rawFile = scrapedFiles.find(f => typeof f === 'string' && f.endsWith('.json'));
    
    if (rawFile) {
      const rawPath = path.join(OUTPUT_DIR, 'scraped-content', rawFile as string);
      samples.rawContent = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    }

    // Get sample chunk
    const chunkFiles = fs.readdirSync(path.join(OUTPUT_DIR, 'chunks'), { recursive: true });
    const chunkFile = chunkFiles.find(f => typeof f === 'string' && f.endsWith('.json'));
    
    if (chunkFile) {
      const chunkPath = path.join(OUTPUT_DIR, 'chunks', chunkFile as string);
      samples.chunk = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    }

    // Get sample vector (changed from embedding)
    const vectorFiles = fs.readdirSync(path.join(OUTPUT_DIR, 'vectors'), { recursive: true });
    const vectorFile = vectorFiles.find(f => typeof f === 'string' && f.endsWith('.json'));
    
    if (vectorFile) {
      const vectorPath = path.join(OUTPUT_DIR, 'vectors', vectorFile as string);
      samples.vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8')); // Changed from 'embedding' to 'vector'
    }

  } catch (error) {
    samples.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return samples;
}

function displayFileStructure() {
  try {
    console.log(`📦 ${OUTPUT_DIR}/`);
    console.log('├── scraped-content/');
    
    const sections = fs.readdirSync(path.join(OUTPUT_DIR, 'scraped-content'));
    sections.forEach((section, i) => {
      const isLast = i === sections.length - 1;
      const files = fs.readdirSync(path.join(OUTPUT_DIR, 'scraped-content', section));
      console.log(`${isLast ? '│' : '│'}   ├── ${section}/ (${files.length} files)`);
    });
    
    console.log('├── chunks/');
    const chunkSections = fs.readdirSync(path.join(OUTPUT_DIR, 'chunks'));
    chunkSections.forEach((section, i) => {
      const isLast = i === chunkSections.length - 1;
      const files = fs.readdirSync(path.join(OUTPUT_DIR, 'chunks', section));
      console.log(`${isLast ? '│' : '│'}   ├── ${section}/ (${files.length} files)`);
    });
    
    console.log('└── vectors/'); // Changed from 'embeddings'
    const vectorSections = fs.readdirSync(path.join(OUTPUT_DIR, 'vectors'));
    vectorSections.forEach((section, i) => {
      const isLast = i === vectorSections.length - 1;
      const files = fs.readdirSync(path.join(OUTPUT_DIR, 'vectors', section));
      console.log(`    ${isLast ? '└' : '├'}── ${section}/ (${files.length} files)`);
    });
    
  } catch (error) {
    console.log('Could not display file structure');
  }
}

// Run simulation
if (require.main === module) {
  simulateWorkflow().catch(console.error);
}

export { simulateWorkflow };