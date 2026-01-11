/**
 * Content Processor Lambda
 * Processes URL batches from SQS with enhanced content processing
 * 
 * Handles:
 * - SQS message processing (URL batches)
 * - HTML-to-Markdown conversion using Cheerio
 * - Change detection via content hashing
 * - Content quality assessment
 * - S3 storage as .md files
 * - DynamoDB tracking updates
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { BedrockAgentClient, StartIngestionJobCommand } = require('@aws-sdk/client-bedrock-agent');
const cheerio = require('cheerio');
const axios = require('axios');
const crypto = require('crypto');

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-west-2' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });
const bedrockAgentClient = new BedrockAgentClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables - No fallbacks for resource names (must be set by CDK)
const CONTENT_BUCKET = process.env.CONTENT_BUCKET;
const CONTENT_TRACKING_TABLE = process.env.CONTENT_TRACKING_TABLE;
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';
const RATE_LIMIT_DELAY = parseInt(process.env.RATE_LIMIT_DELAY || '1000');
const MIN_QUALITY_THRESHOLD = parseInt(process.env.MIN_QUALITY_THRESHOLD || '50');

/**
 * Main Lambda handler - processes SQS messages containing URL batches
 */
exports.handler = async (event, context) => {
  console.log('Content Processor Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Handle SQS events (primary use case)
    if (event.Records && event.Records.length > 0) {
      return await handleSqsMessages(event);
    }

    // Handle direct invocation for testing
    if (!event.httpMethod) {
      console.log('Direct Lambda invocation detected');
      
      if (event.action === 'health' || event.health) {
        return await handleHealthCheck();
      }
      
      // Handle direct batch processing for testing
      if (event.urls && Array.isArray(event.urls)) {
        const batch = {
          batchId: `direct-${Date.now()}`,
          urls: event.urls,
          timestamp: new Date().toISOString()
        };
        const result = await processBatch(batch);
        return {
          success: true,
          message: 'Batch processed successfully',
          result
        };
      }
    }

    // Handle HTTP API Gateway requests (for health checks)
    const method = event.httpMethod;
    const path = event.path;

    if (method === 'OPTIONS') {
      return createResponse(200, '');
    }

    if (method === 'GET' && (path === '/health' || path === '/' || path.endsWith('/health'))) {
      return await handleHealthCheck();
    }

    return createResponse(404, {
      error: 'Endpoint not found',
      message: 'Content Processor handles SQS messages and health checks only'
    });

  } catch (error) {
    console.error('Content Processor handler error:', error);
    
    // For SQS events, throw error to trigger retry
    if (event.Records && event.Records.length > 0) {
      throw error;
    }

    return createResponse(500, {
      error: 'Content processor processing failed',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId
    });
  }
};

/**
 * Handle SQS messages containing URL batches or sentinel messages
 */
async function handleSqsMessages(event) {
  console.log(`Processing ${event.Records.length} SQS messages`);

  const results = [];

  // Process each SQS message (each message contains a batch of URLs or a sentinel)
  for (const record of event.Records) {
    try {
      // Parse the message body
      const message = JSON.parse(record.body);

      // Check if this is a sentinel message
      if (message.type === 'PREPARE_INGESTION') {
        console.log('='.repeat(80));
        console.log('PREPARE_INGESTION sentinel received');
        console.log('All content batches have been queued');
        console.log(`Discovery ID: ${message.discoveryId}`);
        console.log(`Metadata:`, message.metadata);
        console.log('Waiting for TRIGGER_INGESTION message to initiate KB ingestion...');
        console.log('='.repeat(80));
        continue; // Skip further processing, just log and continue
      }

      if (message.type === 'TRIGGER_INGESTION') {
        console.log('='.repeat(80));
        console.log('TRIGGER_INGESTION sentinel received');
        console.log('Initiating Knowledge Base ingestion...');
        console.log(`Discovery ID: ${message.discoveryId}`);
        console.log(`Metadata:`, message.metadata);
        console.log('='.repeat(80));

        // Trigger KB ingestion
        const ingestionResult = await triggerKnowledgeBaseIngestion(message);
        results.push(ingestionResult);
        continue; // Skip batch processing
      }

      // Normal batch processing
      const batch = message;
      console.log(`Processing batch ${batch.batchId} with ${batch.urls.length} URLs`);

      // Process the batch of URLs
      const batchResult = await processBatch(batch);
      results.push(batchResult);

      console.log(`Batch ${batch.batchId} completed: ${batchResult.successCount}/${batchResult.totalCount} successful`);

    } catch (error) {
      console.error('Failed to process SQS message:', error);
      throw error; // Let SQS handle retries
    }
  }

  return {
    statusCode: 200,
    processedBatches: results.length,
    totalUrls: results.reduce((sum, r) => sum + (r.totalCount || 0), 0),
    successfulUrls: results.reduce((sum, r) => sum + (r.successCount || 0), 0),
    failedUrls: results.reduce((sum, r) => sum + (r.failureCount || 0), 0)
  };
}

/**
 * Process a batch of URLs
 */
async function processBatch(batch) {
  const results = [];
  const { urls, batchId } = batch;
  
  console.log(`Starting batch processing for ${urls.length} URLs`);
  
  // Process URLs with limited concurrency
  const concurrency = 3;
  for (let i = 0; i < urls.length; i += concurrency) {
    const urlSlice = urls.slice(i, i + concurrency);
    const promises = urlSlice.map(url => processUrl(url));
    const sliceResults = await Promise.allSettled(promises);
    results.push(...sliceResults);
    
    // Rate limiting between concurrent batches
    if (i + concurrency < urls.length) {
      console.log(`Rate limiting: ${RATE_LIMIT_DELAY}ms delay`);
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failureCount = results.length - successCount;

  return {
    batchId,
    totalCount: urls.length,
    successCount,
    failureCount,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason.message })
  };
}

/**
 * Process a single URL with enhanced content processing
 */
async function processUrl(url) {
  console.log(`Processing: ${url}`);
  
  try {
    // Validate URL domain
    if (!url.includes(TARGET_DOMAIN)) {
      throw new Error(`URL must be from ${TARGET_DOMAIN} domain`);
    }

    // Fetch content
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'ADA Clara Content Processor/2.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 5
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Process HTML to Markdown using Cheerio
    const { title, markdown } = processHtmlToMarkdown(response.data, url);
    
    // Assess content quality
    const qualityScore = assessContentQuality(markdown);
    
    // Enforce minimum quality threshold
    if (qualityScore < MIN_QUALITY_THRESHOLD) {
      console.warn(`Content quality too low for ${url}: score ${qualityScore}/${MIN_QUALITY_THRESHOLD}. Skipping storage.`);
      
      // Generate content hash even for rejected content to enable change detection
      const contentHash = generateContentHash(markdown);
      
      // Update tracking table to record the rejection
      await updateContentTracking(url, contentHash, {
        s3Key: null,
        title: title,
        contentLength: markdown.length,
        qualityScore: qualityScore,
        rejectionReason: `Quality score ${qualityScore} below threshold ${MIN_QUALITY_THRESHOLD}`
      });
      
      return {
        url,
        success: false,
        skipped: true,
        reason: 'quality_too_low',
        qualityScore: qualityScore,
        threshold: MIN_QUALITY_THRESHOLD,
        title: title,
        contentLength: markdown.length,
        contentHash: contentHash.substring(0, 16)
      };
    }

    // Generate content hash for change detection
    const contentHash = generateContentHash(markdown);
    console.log(`Generated content hash for ${url}: ${contentHash.substring(0, 16)}...`);
    
    // Check if content has changed
    const hasChanged = await checkContentChanged(url, contentHash);
    
    if (!hasChanged) {
      console.log(`No changes detected for ${url}, skipping storage`);
      return {
        url,
        success: true,
        skipped: true,
        reason: 'no_changes_detected',
        contentHash: contentHash.substring(0, 16)
      };
    }

    console.log(`Content changed for ${url}, proceeding with storage`);

    // Store as Markdown file in S3
    const s3Key = `web_content/${urlToKey(url)}.md`;
    await s3Client.send(new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: s3Key,
      Body: markdown,
      ContentType: 'text/markdown',
      Metadata: {
        url: url.substring(0, 100),
        title: title.substring(0, 50),
        scraped: new Date().toISOString().substring(0, 10),
        domain: TARGET_DOMAIN,
        contentHash: contentHash.substring(0, 32),
        qualityScore: qualityScore.toString()
      }
    }));
    
    // Update content tracking table
    await updateContentTracking(url, contentHash, {
      s3Key,
      title: title,
      contentLength: markdown.length,
      qualityScore: qualityScore
    });
    
    console.log(`Stored: ${s3Key} (${markdown.length} chars, quality: ${qualityScore})`);
    
    return {
      url,
      success: true,
      title: title,
      contentKey: s3Key,
      textLength: markdown.length,
      contentHash,
      qualityScore: qualityScore,
      skipped: false
    };
    
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
    return {
      url,
      success: false,
      error: error.message || 'Unknown error',
      skipped: false
    };
  }
}

/**
 * Process HTML to Markdown using Cheerio
 */
function processHtmlToMarkdown(html, url) {
  const $ = cheerio.load(html);
  
  // Extract title
  let title = $('title').text().trim() || $('h1').first().text().trim() || 'Diabetes Information';
  title = title.replace(/\s+/g, ' ');
  
  // Remove unwanted elements
  $('script, style, nav, header, footer, .navigation, .menu, .sidebar, .advertisement, .ad').remove();
  
  // Find main content area
  let contentElement = $('main').first();
  if (contentElement.length === 0) contentElement = $('article').first();
  if (contentElement.length === 0) contentElement = $('.content, .main-content, .article-content, #content').first();
  if (contentElement.length === 0) contentElement = $('body');
  
  // Start building markdown
  let markdown = `# ${title}\n\n**Source**: ${url}\n**Last Updated**: ${new Date().toISOString().split('T')[0]}\n\n`;
  
  // Process content elements
  contentElement.find('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote').each((i, element) => {
    const $el = $(element);
    const tagName = element.name || element.tagName?.toLowerCase();
    
    switch (tagName) {
      case 'h1':
        markdown += `\n## ${$el.text().trim()}\n\n`;
        break;
      case 'h2':
        markdown += `\n### ${$el.text().trim()}\n\n`;
        break;
      case 'h3':
        markdown += `\n#### ${$el.text().trim()}\n\n`;
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        markdown += `\n##### ${$el.text().trim()}\n\n`;
        break;
      case 'p':
        const pText = $el.text().trim();
        if (pText && pText.length > 10) {
          markdown += `${pText}\n\n`;
        }
        break;
      case 'ul':
        $el.find('li').each((j, li) => {
          const liText = $(li).text().trim();
          if (liText) {
            markdown += `- ${liText}\n`;
          }
        });
        markdown += '\n';
        break;
      case 'ol':
        $el.find('li').each((j, li) => {
          const liText = $(li).text().trim();
          if (liText) {
            markdown += `${j + 1}. ${liText}\n`;
          }
        });
        markdown += '\n';
        break;
      case 'blockquote':
        const quoteText = $el.text().trim();
        if (quoteText) {
          markdown += `> ${quoteText}\n\n`;
        }
        break;
    }
  });
  
  // Clean up markdown
  markdown = markdown
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single
    .trim();
  
  return { title, markdown };
}

/**
 * Assess content quality with simplified scoring
 */
function assessContentQuality(markdown) {
  const length = markdown.length;
  const headerCount = (markdown.match(/^#{1,6}\s/gm) || []).length;
  const diabetesKeywords = countDiabetesKeywords(markdown);
  
  let score = 0;
  
  // Length scoring
  if (length > 2000) score += 30;
  else if (length > 1000) score += 25;
  else if (length > 500) score += 20;
  else if (length > 200) score += 10;
  
  // Structure scoring
  if (headerCount > 0) score += 20;
  if (headerCount > 2) score += 10;
  
  // Diabetes relevance (most important)
  if (diabetesKeywords > 10) score += 30;
  else if (diabetesKeywords > 5) score += 25;
  else if (diabetesKeywords > 2) score += 15;
  else if (diabetesKeywords > 0) score += 10;
  else score -= 20; // Penalty for no diabetes keywords
  
  // Quality penalties
  if (length < 200) score -= 15;
  if (diabetesKeywords === 0) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Count diabetes-related keywords
 */
function countDiabetesKeywords(text) {
  const keywords = [
    'diabetes', 'diabetic', 'insulin', 'glucose', 'blood sugar',
    'type 1', 'type 2', 'gestational', 'prediabetes', 'a1c',
    'hypoglycemia', 'hyperglycemia', 'carbohydrate', 'treatment'
  ];
  
  const lowerText = text.toLowerCase();
  return keywords.reduce((count, keyword) => {
    const matches = lowerText.match(new RegExp(keyword, 'g'));
    return count + (matches ? matches.length : 0);
  }, 0);
}

/**
 * Generate content hash for change detection
 * Normalizes content while preserving meaningful changes
 */
function generateContentHash(content) {
  const normalized = content
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize "Last Updated" dates but preserve content dates
    .replace(/\*\*Last Updated\*\*:\s*\d{4}-\d{2}-\d{2}/g, '**Last Updated**: DATE')
    // Normalize scraping timestamps in metadata
    .replace(/Last Updated.*\d{4}-\d{2}-\d{2}/g, 'Last Updated: DATE')
    // Convert to lowercase for case-insensitive comparison
    .toLowerCase()
    // Trim whitespace
    .trim();
  
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Check if content has changed by comparing hashes
 */
async function checkContentChanged(url, newContentHash) {
  try {
    const params = {
      TableName: CONTENT_TRACKING_TABLE,
      KeyConditionExpression: '#url = :url',
      ExpressionAttributeNames: {
        '#url': 'url'
      },
      ExpressionAttributeValues: marshall({
        ':url': url
      }),
      ScanIndexForward: false, // Get most recent first
      Limit: 1
    };
    
    const result = await dynamoClient.send(new QueryCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
      console.log(`First time processing ${url} - no previous record found`);
      return true; // First time crawling this URL
    }
    
    const lastRecord = unmarshall(result.Items[0]);
    const hasChanged = lastRecord.contentHash !== newContentHash;
    
    if (hasChanged) {
      console.log(`Content changed for ${url}: ${lastRecord.contentHash?.substring(0, 16)}... → ${newContentHash.substring(0, 16)}...`);
    } else {
      console.log(`Content unchanged for ${url}: ${newContentHash.substring(0, 16)}...`);
    }
    
    return hasChanged;
    
  } catch (error) {
    console.error(`Error checking content changes for ${url}:`, error);
    return true; // Default to processing on error to avoid missing updates
  }
}

/**
 * Update content tracking table with processing results
 */
async function updateContentTracking(url, contentHash, metadata) {
  try {
    const record = {
      url: url,
      crawlTimestamp: new Date().toISOString(),
      contentHash: contentHash,
      contentLength: metadata.contentLength,
      title: metadata.title,
      status: metadata.s3Key ? 'success' : 'quality_rejected',
      s3Key: metadata.s3Key || null,
      qualityScore: metadata.qualityScore,
      rejectionReason: metadata.rejectionReason || null,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    };
    
    await dynamoClient.send(new PutItemCommand({
      TableName: CONTENT_TRACKING_TABLE,
      Item: marshall(record, { removeUndefinedValues: true })
    }));
    
    console.log(`Updated content tracking for ${url}: ${record.status} (quality: ${record.qualityScore})`);
    
  } catch (error) {
    console.error(`Error updating content tracking for ${url}:`, error);
    // Don't throw - this shouldn't fail the entire processing
    // But log the error for monitoring
  }
}

/**
 * Handle health check
 */
async function handleHealthCheck() {
  try {
    // Test S3 access
    let s3Healthy = false;
    try {
      await s3Client.send(new ListObjectsV2Command({
        Bucket: CONTENT_BUCKET,
        MaxKeys: 1
      }));
      s3Healthy = true;
    } catch (error) {
      console.error('S3 health check failed:', error);
    }

    // Test DynamoDB access
    let dynamoHealthy = false;
    try {
      await dynamoClient.send(new QueryCommand({
        TableName: CONTENT_TRACKING_TABLE,
        KeyConditionExpression: '#url = :url',
        ExpressionAttributeNames: {
          '#url': 'url'
        },
        ExpressionAttributeValues: marshall({
          ':url': 'health-check-test'
        }),
        Limit: 1
      }));
      dynamoHealthy = true;
    } catch (error) {
      console.error('DynamoDB health check failed:', error);
    }

    const overall = s3Healthy && dynamoHealthy;

    return createResponse(overall ? 200 : 503, {
      status: overall ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'content-processor',
      version: '2.0.0-simplified',
      services: {
        s3: s3Healthy,
        dynamodb: dynamoHealthy
      },
      configuration: {
        contentBucket: CONTENT_BUCKET,
        targetDomain: TARGET_DOMAIN,
        minQualityThreshold: MIN_QUALITY_THRESHOLD
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return createResponse(503, {
      status: 'unhealthy',
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Trigger Knowledge Base ingestion after content processing completes
 */
async function triggerKnowledgeBaseIngestion(sentinelMessage) {
  console.log('Starting Knowledge Base ingestion trigger...');

  try {
    // Verify required environment variables
    if (!KNOWLEDGE_BASE_ID || !DATA_SOURCE_ID) {
      throw new Error('KNOWLEDGE_BASE_ID and DATA_SOURCE_ID must be set as environment variables');
    }

    console.log(`Knowledge Base ID: ${KNOWLEDGE_BASE_ID}`);
    console.log(`Data Source ID: ${DATA_SOURCE_ID}`);

    // Step 1: Verify S3 content exists
    console.log('Step 1: Verifying S3 content...');
    const s3FileCount = await verifyS3Content();
    console.log(`Verified ${s3FileCount} files in S3 content bucket`);

    if (s3FileCount === 0) {
      console.warn('No files found in S3 content bucket - skipping ingestion');
      return {
        success: false,
        reason: 'no_content',
        message: 'No content files found in S3'
      };
    }

    // Step 2: Get processing statistics from DynamoDB
    console.log('Step 2: Getting content processing statistics...');
    const contentStats = await getContentProcessingStats();
    console.log('Content processing stats:', contentStats);

    // Step 3: Start Bedrock ingestion job
    console.log('Step 3: Starting Bedrock Knowledge Base ingestion job...');
    const ingestionCommand = new StartIngestionJobCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      dataSourceId: DATA_SOURCE_ID,
      description: `Automatic ingestion triggered after content processing completion at ${new Date().toISOString()}. Discovery ID: ${sentinelMessage.discoveryId}`
    });

    const response = await bedrockAgentClient.send(ingestionCommand);

    const ingestionJobId = response.ingestionJob.ingestionJobId;
    const ingestionStatus = response.ingestionJob.status;

    console.log('='.repeat(80));
    console.log('✓ Knowledge Base ingestion job started successfully!');
    console.log(`Ingestion Job ID: ${ingestionJobId}`);
    console.log(`Status: ${ingestionStatus}`);
    console.log(`S3 Files: ${s3FileCount}`);
    console.log(`Content Stats:`, contentStats);
    console.log('='.repeat(80));

    // Step 4: Record ingestion job metadata in DynamoDB
    await recordIngestionJobMetadata({
      ingestionJobId,
      ingestionStatus,
      discoveryId: sentinelMessage.discoveryId,
      s3FileCount,
      contentStats,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      ingestionJobId,
      ingestionStatus,
      s3FileCount,
      contentStats,
      message: 'Knowledge Base ingestion started successfully'
    };

  } catch (error) {
    console.error('Error triggering Knowledge Base ingestion:', error);
    console.error('Error details:', error.message);

    return {
      success: false,
      error: error.message,
      message: 'Failed to trigger Knowledge Base ingestion'
    };
  }
}

/**
 * Verify S3 content bucket has files
 */
async function verifyS3Content() {
  try {
    let fileCount = 0;
    let continuationToken = null;

    do {
      const listParams = {
        Bucket: CONTENT_BUCKET,
        MaxKeys: 1000
      };

      if (continuationToken) {
        listParams.ContinuationToken = continuationToken;
      }

      const result = await s3Client.send(new ListObjectsV2Command(listParams));
      fileCount += result.KeyCount || 0;
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return fileCount;
  } catch (error) {
    console.error('Error listing S3 content:', error);
    return 0;
  }
}

/**
 * Get content processing statistics from DynamoDB
 */
async function getContentProcessingStats() {
  const stats = {
    totalProcessed: 0,
    successful: 0,
    qualityRejected: 0,
    failed: 0
  };

  try {
    let lastEvaluatedKey = null;

    do {
      const params = {
        TableName: CONTENT_TRACKING_TABLE,
        ProjectionExpression: '#status',
        ExpressionAttributeNames: {
          '#status': 'status'
        }
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoClient.send(new ScanCommand(params));

      // Count status types
      for (const item of result.Items || []) {
        const record = unmarshall(item);
        stats.totalProcessed++;

        const status = record.status?.toLowerCase() || '';
        if (status === 'success') {
          stats.successful++;
        } else if (status === 'quality_rejected') {
          stats.qualityRejected++;
        } else if (status === 'failed' || status === 'error') {
          stats.failed++;
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return stats;
  } catch (error) {
    console.error('Error getting content processing stats:', error);
    return stats;
  }
}

/**
 * Record ingestion job metadata in DynamoDB
 */
async function recordIngestionJobMetadata(metadata) {
  try {
    await dynamoClient.send(new UpdateItemCommand({
      TableName: CONTENT_TRACKING_TABLE,
      Key: marshall({ url: 'INGESTION_JOB_METADATA' }),
      UpdateExpression: 'SET lastIngestionJobId = :jobId, lastIngestionTime = :time, lastIngestionStatus = :status, discoveryId = :discoveryId, s3FileCount = :fileCount, contentStats = :stats',
      ExpressionAttributeValues: marshall({
        ':jobId': metadata.ingestionJobId,
        ':time': metadata.timestamp,
        ':status': metadata.ingestionStatus,
        ':discoveryId': metadata.discoveryId,
        ':fileCount': metadata.s3FileCount,
        ':stats': metadata.contentStats
      })
    }));

    console.log('Recorded ingestion job metadata in DynamoDB');
  } catch (error) {
    console.error('Error recording ingestion job metadata:', error);
    // Don't throw - this shouldn't fail the whole operation
  }
}

/**
 * Utility functions
 */
function urlToKey(url) {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  };
}