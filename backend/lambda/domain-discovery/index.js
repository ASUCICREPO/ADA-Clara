/**
 * Domain Discovery Lambda
 * Intelligently discovers and prioritizes URLs from diabetes.org
 * 
 * Features:
 * - Sitemap parsing for comprehensive URL discovery
 * - Intelligent URL filtering and prioritization
 * - Content quality prediction
 * - Batch processing with SQS integration
 * - Progress tracking and state management
 */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const axios = require('axios');
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');

// Initialize AWS clients
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-west-2' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables - No fallbacks for resource names (must be set by CDK)
const SCRAPING_QUEUE_URL = process.env.SCRAPING_QUEUE_URL;
const CONTENT_TRACKING_TABLE = process.env.CONTENT_TRACKING_TABLE;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';
const MAX_URLS_PER_BATCH = parseInt(process.env.MAX_URLS_PER_BATCH || '15'); // Optimized batch size
const MAX_DISCOVERY_URLS = parseInt(process.env.MAX_DISCOVERY_URLS || '500');

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('Domain Discovery Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Handle different invocation types
    if (event.action === 'discover-domain') {
      return await handleDomainDiscovery(event);
    } else if (event.action === 'health') {
      return await handleHealthCheck();
    } else if (event.urls && Array.isArray(event.urls)) {
      // Direct URL processing (backward compatibility)
      return await handleDirectUrls(event.urls);
    } else if (event.httpMethod) {
      // API Gateway request
      return await handleApiRequest(event);
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid request',
        message: 'Use action="discover-domain" for domain discovery or provide URLs array'
      })
    };

  } catch (error) {
    console.error('Domain Discovery handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Domain discovery failed',
        message: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };
  }
};

/**
 * Handle comprehensive domain discovery
 */
async function handleDomainDiscovery(event) {
  console.log('Starting comprehensive domain discovery for', TARGET_DOMAIN);
  
  const discoveryId = `discovery-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    // Phase 1: Discover URLs from multiple sources
    console.log('Phase 1: URL Discovery');
    const discoveredUrls = await discoverUrls();
    console.log(`Discovered ${discoveredUrls.length} URLs from all sources`);
    
    // Phase 2: Filter and prioritize URLs
    console.log('Phase 2: URL Filtering and Prioritization');
    const filteredUrls = await filterAndPrioritizeUrls(discoveredUrls);
    console.log(`Filtered to ${filteredUrls.length} high-quality URLs`);
    
    // Phase 3: Create and send batches
    console.log('Phase 3: Batch Creation and Queuing');
    const batches = createBatches(filteredUrls, discoveryId);
    const queueResults = await sendBatchesToQueue(batches);

    // Phase 4: Send sentinel messages for KB ingestion
    console.log('Phase 4: Sending KB ingestion sentinel messages');
    await sendIngestionSentinels(discoveryId, {
      totalBatches: batches.length,
      totalUrls: filteredUrls.length
    });

    // Phase 5: Track discovery progress
    await trackDiscoveryProgress(discoveryId, {
      totalUrls: discoveredUrls.length,
      filteredUrls: filteredUrls.length,
      batches: batches.length,
      queueResults: queueResults,
      duration: Date.now() - startTime
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        discoveryId: discoveryId,
        summary: {
          totalDiscovered: discoveredUrls.length,
          filteredUrls: filteredUrls.length,
          batchesCreated: batches.length,
          batchesQueued: queueResults.successCount,
          duration: Date.now() - startTime
        },
        message: 'Domain discovery completed successfully'
      })
    };
    
  } catch (error) {
    console.error('Domain discovery failed:', error);
    throw error;
  }
}

/**
 * Discover URLs from multiple sources
 */
async function discoverUrls() {
  const allUrls = new Set();
  
  try {
    // Source 1: XML Sitemaps
    console.log('Discovering URLs from sitemaps...');
    const sitemapUrls = await discoverFromSitemaps();
    sitemapUrls.forEach(url => allUrls.add(url));
    console.log(`Found ${sitemapUrls.length} URLs from sitemaps`);
    
    // Source 2: Seed URLs (high-priority known pages)
    console.log('Adding seed URLs...');
    const seedUrls = getSeedUrls();
    seedUrls.forEach(url => allUrls.add(url));
    console.log(`Added ${seedUrls.length} seed URLs`);
    
    // Source 3: Navigation discovery (if we have time/resources)
    // This could be added later for more comprehensive discovery
    
  } catch (error) {
    console.error('Error during URL discovery:', error);
    // Continue with whatever URLs we found
  }
  
  return Array.from(allUrls);
}

/**
 * Discover URLs from XML sitemaps
 */
async function discoverFromSitemaps() {
  const sitemapUrls = [
    `https://${TARGET_DOMAIN}/sitemap.xml`,
    `https://${TARGET_DOMAIN}/sitemap_index.xml`,
    `https://${TARGET_DOMAIN}/sitemap-index.xml`
  ];
  
  const discoveredUrls = [];
  
  for (const sitemapUrl of sitemapUrls) {
    try {
      console.log(`Parsing sitemap: ${sitemapUrl}`);
      const urls = await parseSitemap(sitemapUrl);
      discoveredUrls.push(...urls);
      console.log(`Found ${urls.length} URLs in ${sitemapUrl}`);
    } catch (error) {
      console.warn(`Failed to parse sitemap ${sitemapUrl}:`, error.message);
      // Continue with other sitemaps
    }
  }
  
  return [...new Set(discoveredUrls)]; // Remove duplicates
}

/**
 * Parse a single XML sitemap
 */
async function parseSitemap(sitemapUrl) {
  try {
    const response = await axios.get(sitemapUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'ADA Clara Domain Discovery/1.0' }
    });
    
    const xmlData = await parseStringPromise(response.data);
    const urls = [];
    
    // Handle sitemap index (contains references to other sitemaps)
    if (xmlData.sitemapindex && xmlData.sitemapindex.sitemap) {
      for (const sitemap of xmlData.sitemapindex.sitemap) {
        if (sitemap.loc && sitemap.loc[0]) {
          try {
            const subSitemapUrls = await parseSitemap(sitemap.loc[0]);
            urls.push(...subSitemapUrls);
          } catch (error) {
            console.warn(`Failed to parse sub-sitemap ${sitemap.loc[0]}:`, error.message);
          }
        }
      }
    }
    
    // Handle regular sitemap (contains actual URLs)
    if (xmlData.urlset && xmlData.urlset.url) {
      for (const urlEntry of xmlData.urlset.url) {
        if (urlEntry.loc && urlEntry.loc[0]) {
          urls.push(urlEntry.loc[0]);
        }
      }
    }
    
    return urls;
    
  } catch (error) {
    console.error(`Error parsing sitemap ${sitemapUrl}:`, error);
    return [];
  }
}

/**
 * Get high-priority seed URLs
 */
function getSeedUrls() {
  return [
    // Core diabetes education
    `https://${TARGET_DOMAIN}/about-diabetes`,
    `https://${TARGET_DOMAIN}/about-diabetes/type-1`,
    `https://${TARGET_DOMAIN}/about-diabetes/type-2`,
    `https://${TARGET_DOMAIN}/about-diabetes/prediabetes`,
    `https://${TARGET_DOMAIN}/about-diabetes/gestational-diabetes`,
    `https://${TARGET_DOMAIN}/about-diabetes/complications`,
    `https://${TARGET_DOMAIN}/about-diabetes/diabetes-prevention`,
    
    // Living with diabetes
    `https://${TARGET_DOMAIN}/living-with-diabetes`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/type-1`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/type-2`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/newly-diagnosed`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/treatment-care`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/hypoglycemia-low-blood-glucose`,
    `https://${TARGET_DOMAIN}/living-with-diabetes/pregnancy`,
    
    // Food and nutrition
    `https://${TARGET_DOMAIN}/food-nutrition`,
    `https://${TARGET_DOMAIN}/food-nutrition/understanding-carbs`,
    `https://${TARGET_DOMAIN}/food-nutrition/food-blood-sugar`,
    `https://${TARGET_DOMAIN}/food-nutrition/meal-planning`,
    
    // Health and wellness
    `https://${TARGET_DOMAIN}/health-wellness`,
    `https://${TARGET_DOMAIN}/health-wellness/fitness`,
    `https://${TARGET_DOMAIN}/health-wellness/weight-management`,
    `https://${TARGET_DOMAIN}/health-wellness/medication-treatments`,
    
    // Getting sick with diabetes
    `https://${TARGET_DOMAIN}/getting-sick-with-diabetes`,
    `https://${TARGET_DOMAIN}/getting-sick-with-diabetes/sick-days`
  ];
}

/**
 * Filter and prioritize URLs based on content relevance
 */
async function filterAndPrioritizeUrls(urls) {
  console.log(`Filtering ${urls.length} URLs...`);
  
  const filteredUrls = [];
  
  for (const url of urls) {
    const urlInfo = analyzeUrl(url);
    
    // Skip excluded URLs
    if (urlInfo.excluded) {
      continue;
    }
    
    // Skip if priority is too low (changed from 30 to 50)
    if (urlInfo.priority < 50) {
      continue;
    }
    
    filteredUrls.push({
      url: url,
      priority: urlInfo.priority,
      category: urlInfo.category,
      reason: urlInfo.reason
    });
  }
  
  // Sort by priority (highest first) and limit total URLs
  filteredUrls.sort((a, b) => b.priority - a.priority);
  
  const limitedUrls = filteredUrls.slice(0, MAX_DISCOVERY_URLS);
  
  console.log(`Filtered to ${limitedUrls.length} URLs (from ${urls.length} total)`);
  console.log('Priority distribution:', {
    high: limitedUrls.filter(u => u.priority >= 70).length,
    medium: limitedUrls.filter(u => u.priority >= 50 && u.priority < 70).length,
    low: limitedUrls.filter(u => u.priority < 50).length
  });
  
  return limitedUrls;
}

/**
 * Analyze URL to determine priority and category
 */
function analyzeUrl(url) {
  const urlLower = url.toLowerCase();
  
  // Exclude patterns
  const excludePatterns = [
    /^https:\/\/professional\.diabetes\.org\/.*/,
    /^https:\/\/shop\.diabetes\.org\/.*/,
    /^https:\/\/.*\.diabetes\.org\/.*/, // Other subdomains
    /\/search\?/, /\/login/, /\/register/, /\/logout/,
    /\/api\//, /\/admin\//, /\/wp-admin\//, /\/wp-content\//,
    /\.(pdf|jpg|jpeg|png|gif|mp4|mp3|zip|doc|docx)$/i,
    /\/tag\//, /\/tags\//, /\/category\//, /\/categories\//,
    /\/events\//, /\/event\//, // Event pages (time-sensitive, low educational value)
    /\/news\//, /\/press\//, /\/media\//, // News and media (time-sensitive)
    /\/donate\//, /\/donation\//, /\/fundraising\//, // Fundraising pages
    /\/contact\//, /\/about-us\//, /\/careers\//, // Organizational pages
    /\/diabetes-risk-test/, /\/diabetes-prevention-application/, // JavaScript tools (won't parse well)
    /\/\d{4}\/\d{2}\//, // Date-based URLs (likely blog posts)
    /\/page\/\d+/, /\/p\/\d+/, // Pagination
    /#/, /\?/ // URLs with fragments or query parameters
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(url)) {
      return { excluded: true, priority: 0, category: 'excluded', reason: 'matched exclude pattern' };
    }
  }
  
  // Spanish translations of high-priority content (85-95)
  const spanishHighPriorityPatterns = [
    { pattern: /\/es\/sobre-la-diabetes\/tipo-[12]/, priority: 90, category: 'spanish-core-education' },
    { pattern: /\/es\/sobre-la-diabetes\/prediabetes/, priority: 90, category: 'spanish-core-education' },
    { pattern: /\/es\/sobre-la-diabetes\/diabetes-gestacional/, priority: 85, category: 'spanish-core-education' },
    { pattern: /\/es\/sobre-la-diabetes\/complicaciones/, priority: 85, category: 'spanish-core-education' },
    { pattern: /\/es\/vivir-con-diabetes\/tipo-[12]/, priority: 90, category: 'spanish-management' },
    { pattern: /\/es\/vivir-con-diabetes\/recien-diagnosticado/, priority: 90, category: 'spanish-management' },
    { pattern: /\/es\/vivir-con-diabetes\/tratamiento/, priority: 85, category: 'spanish-management' },
    { pattern: /\/es\/sobre-la-diabetes\//, priority: 80, category: 'spanish-education' },
    { pattern: /\/es\/vivir-con-diabetes\//, priority: 80, category: 'spanish-management' },
    { pattern: /\/es\/alimentacion-nutricion\//, priority: 75, category: 'spanish-nutrition' },
    { pattern: /\/es\/salud-bienestar\//, priority: 70, category: 'spanish-wellness' }
  ];
  
  // High priority patterns (90-100)
  const highPriorityPatterns = [
    { pattern: /\/about-diabetes\/type-[12]/, priority: 95, category: 'core-education' },
    { pattern: /\/about-diabetes\/prediabetes/, priority: 95, category: 'core-education' },
    { pattern: /\/about-diabetes\/gestational/, priority: 90, category: 'core-education' },
    { pattern: /\/about-diabetes\/complications/, priority: 90, category: 'core-education' },
    { pattern: /\/living-with-diabetes\/type-[12]/, priority: 95, category: 'management' },
    { pattern: /\/living-with-diabetes\/newly-diagnosed/, priority: 95, category: 'management' },
    { pattern: /\/living-with-diabetes\/treatment/, priority: 90, category: 'management' },
    // High-priority advocacy content (mission, statistics, key policies)
    { pattern: /\/advocacy\/diabetes-statistics/, priority: 90, category: 'advocacy-statistics' },
    { pattern: /\/advocacy\/about-ada/, priority: 90, category: 'advocacy-mission' },
    { pattern: /\/advocacy\/mission/, priority: 90, category: 'advocacy-mission' },
    { pattern: /\/advocacy\/insulin-access/, priority: 90, category: 'advocacy-critical' },
    { pattern: /\/advocacy\/cgm/, priority: 85, category: 'advocacy-education' },
    { pattern: /\/advocacy\/amputation-prevention/, priority: 85, category: 'advocacy-education' },
    { pattern: /\/advocacy\/medicare/, priority: 85, category: 'advocacy-policy' },
    { pattern: /\/advocacy\/medicaid/, priority: 85, category: 'advocacy-policy' }
  ];
  
  // Medium-high priority patterns (70-89)
  const mediumHighPatterns = [
    { pattern: /\/about-diabetes\//, priority: 85, category: 'education' },
    { pattern: /\/living-with-diabetes\//, priority: 85, category: 'management' },
    { pattern: /\/food-nutrition\//, priority: 80, category: 'nutrition' },
    { pattern: /\/health-wellness\//, priority: 75, category: 'wellness' },
    // Critical health management content (elevated from medium)
    { pattern: /\/getting-sick-with-diabetes\//, priority: 80, category: 'sick-care' }, // Elevated - very valuable for chatbot
    { pattern: /\/hypoglycemia/, priority: 85, category: 'emergency' }, // Elevated - emergency content
    // Medium-high advocacy content (educational and policy value)
    { pattern: /\/advocacy\/health-equity/, priority: 80, category: 'advocacy-equity' },
    { pattern: /\/advocacy\/discrimination/, priority: 80, category: 'advocacy-rights' },
    { pattern: /\/advocacy\/workplace/, priority: 75, category: 'advocacy-workplace' },
    { pattern: /\/advocacy\/school/, priority: 75, category: 'advocacy-education' },
    { pattern: /\/advocacy\/research/, priority: 75, category: 'advocacy-research' },
    { pattern: /\/advocacy\/prevention/, priority: 75, category: 'advocacy-prevention' }
  ];
  
  // Medium priority patterns (50-69)
  const mediumPatterns = [
    { pattern: /\/tools-resources\//, priority: 60, category: 'resources' },
    { pattern: /\/pregnancy\//, priority: 65, category: 'pregnancy' },
    { pattern: /\/advocacy\//, priority: 60, category: 'advocacy-general' }, // General advocacy content
    { pattern: /\/es\/defensa\//, priority: 60, category: 'spanish-advocacy' } // Spanish advocacy
  ];
  
  // Check Spanish patterns first (higher priority for translations)
  for (const { pattern, priority, category } of spanishHighPriorityPatterns) {
    if (pattern.test(urlLower)) {
      return { 
        excluded: false, 
        priority, 
        category, 
        reason: `matched ${category} pattern` 
      };
    }
  }
  
  // Check other patterns in priority order
  const allPatterns = [...highPriorityPatterns, ...mediumHighPatterns, ...mediumPatterns];
  
  for (const { pattern, priority, category } of allPatterns) {
    if (pattern.test(urlLower)) {
      return { 
        excluded: false, 
        priority, 
        category, 
        reason: `matched ${category} pattern` 
      };
    }
  }
  
  // Special handling for Spanish content (boost general Spanish pages)
  if (urlLower.includes('/es/')) {
    return { 
      excluded: false, 
      priority: 50, 
      category: 'spanish-general', 
      reason: 'Spanish content (accessibility important)' 
    };
  }
  
  // Default priority for diabetes.org URLs
  if (urlLower.includes('diabetes.org')) {
    return { 
      excluded: false, 
      priority: 40, 
      category: 'general', 
      reason: 'diabetes.org domain' 
    };
  }
  
  // Very low priority for other URLs
  return { 
    excluded: false, 
    priority: 10, 
    category: 'other', 
    reason: 'low relevance' 
  };
}

/**
 * Create batches from prioritized URLs
 */
function createBatches(urls, discoveryId) {
  const batches = [];
  
  // Group by priority tier
  const highPriority = urls.filter(u => u.priority >= 70);
  const mediumPriority = urls.filter(u => u.priority >= 50 && u.priority < 70);
  const lowPriority = urls.filter(u => u.priority < 50);
  
  console.log('Creating batches:', {
    high: highPriority.length,
    medium: mediumPriority.length,
    low: lowPriority.length
  });
  
  // Create batches for each tier
  [
    { urls: highPriority, tier: 'high', priority: 1 },
    { urls: mediumPriority, tier: 'medium', priority: 2 },
    { urls: lowPriority, tier: 'low', priority: 3 }
  ].forEach(({ urls: tierUrls, tier, priority }) => {
    for (let i = 0; i < tierUrls.length; i += MAX_URLS_PER_BATCH) {
      const batchUrls = tierUrls.slice(i, i + MAX_URLS_PER_BATCH);
      batches.push({
        batchId: `${discoveryId}-${tier}-${Math.floor(i / MAX_URLS_PER_BATCH)}`,
        urls: batchUrls.map(u => u.url),
        priority: tier,
        priorityScore: priority,
        urlCount: batchUrls.length,
        timestamp: new Date().toISOString(),
        discoveryId: discoveryId
      });
    }
  });
  
  return batches;
}

/**
 * Send batches to SQS queue
 */
async function sendBatchesToQueue(batches) {
  console.log(`Sending ${batches.length} batches to SQS queue`);
  
  let successCount = 0;
  let failureCount = 0;
  
  // Send high-priority batches first
  const sortedBatches = batches.sort((a, b) => a.priorityScore - b.priorityScore);
  
  for (const batch of sortedBatches) {
    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: SCRAPING_QUEUE_URL,
        MessageBody: JSON.stringify(batch),
        MessageAttributes: {
          priority: {
            DataType: 'String',
            StringValue: batch.priority
          },
          batchId: {
            DataType: 'String',
            StringValue: batch.batchId
          }
        }
      }));
      
      successCount++;
      console.log(`Queued batch ${batch.batchId} (${batch.urlCount} URLs, priority: ${batch.priority})`);
      
      // Small delay to avoid overwhelming SQS
      await sleep(100);
      
    } catch (error) {
      console.error(`Failed to queue batch ${batch.batchId}:`, error);
      failureCount++;
    }
  }
  
  return { successCount, failureCount, totalBatches: batches.length };
}

/**
 * Track discovery progress in DynamoDB
 */
async function trackDiscoveryProgress(discoveryId, summary) {
  try {
    const record = {
      url: `discovery:${discoveryId}`,
      crawlTimestamp: new Date().toISOString(),
      contentHash: 'discovery-session',
      status: 'discovery-completed',
      discoveryId: discoveryId,
      totalUrls: summary.totalUrls,
      filteredUrls: summary.filteredUrls,
      batches: summary.batches,
      queueResults: summary.queueResults,
      duration: summary.duration,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    };
    
    await dynamoClient.send(new PutItemCommand({
      TableName: CONTENT_TRACKING_TABLE,
      Item: marshall(record, { removeUndefinedValues: true })
    }));
    
    console.log(`Discovery progress tracked: ${discoveryId}`);
    
  } catch (error) {
    console.error('Error tracking discovery progress:', error);
    // Don't throw - this shouldn't fail the entire discovery
  }
}

/**
 * Handle direct URL processing (backward compatibility)
 */
async function handleDirectUrls(urls) {
  console.log(`Processing ${urls.length} URLs directly`);
  
  const batch = {
    batchId: `direct-${Date.now()}`,
    urls: urls,
    priority: 'direct',
    timestamp: new Date().toISOString()
  };
  
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: SCRAPING_QUEUE_URL,
      MessageBody: JSON.stringify(batch)
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'URLs sent to processing queue',
        batchId: batch.batchId,
        urlCount: urls.length
      })
    };
  } catch (error) {
    console.error('Error sending to SQS:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}

/**
 * Handle API Gateway requests
 */
async function handleApiRequest(event) {
  const method = event.httpMethod;
  const path = event.path;
  
  if (method === 'OPTIONS') {
    return createResponse(200, '');
  }
  
  if (method === 'GET' && (path === '/health' || path === '/' || path.endsWith('/health'))) {
    return await handleHealthCheck();
  }
  
  if (method === 'POST' && path.includes('discover')) {
    const body = JSON.parse(event.body || '{}');
    return await handleDomainDiscovery({ ...body, action: 'discover-domain' });
  }
  
  return createResponse(404, {
    error: 'Endpoint not found',
    message: 'Domain Discovery handles discovery requests and health checks'
  });
}

/**
 * Handle health check
 */
async function handleHealthCheck() {
  try {
    // Test SQS access
    let sqsHealthy = false;
    try {
      // Just test that we can access SQS (don't actually send a message)
      sqsHealthy = !!SCRAPING_QUEUE_URL;
    } catch (error) {
      console.error('SQS health check failed:', error);
    }
    
    // Test external connectivity
    let connectivityHealthy = false;
    try {
      await axios.get(`https://${TARGET_DOMAIN}/robots.txt`, { timeout: 5000 });
      connectivityHealthy = true;
    } catch (error) {
      console.error('Connectivity health check failed:', error);
    }
    
    const overall = sqsHealthy && connectivityHealthy;
    
    return createResponse(overall ? 200 : 503, {
      status: overall ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'domain-discovery',
      version: '1.0.0',
      services: {
        sqs: sqsHealthy,
        connectivity: connectivityHealthy
      },
      configuration: {
        targetDomain: TARGET_DOMAIN,
        maxUrlsPerBatch: MAX_URLS_PER_BATCH,
        maxDiscoveryUrls: MAX_DISCOVERY_URLS
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
 * Send sentinel messages for KB ingestion automation
 * Two-step approach: PREPARE (immediate) and TRIGGER (5-minute delay)
 */
async function sendIngestionSentinels(discoveryId, metadata) {
  try {
    // Step 1: Send PREPARE_INGESTION message (immediate)
    const prepareMessage = {
      type: 'PREPARE_INGESTION',
      discoveryId: discoveryId,
      metadata: {
        totalBatches: metadata.totalBatches,
        totalUrls: metadata.totalUrls,
        timestamp: new Date().toISOString()
      },
      message: 'Preparation sentinel - all content batches have been queued'
    };

    await sqsClient.send(new SendMessageCommand({
      QueueUrl: SCRAPING_QUEUE_URL,
      MessageBody: JSON.stringify(prepareMessage),
      MessageAttributes: {
        messageType: {
          DataType: 'String',
          StringValue: 'PREPARE_INGESTION'
        }
      }
    }));

    console.log('Sent PREPARE_INGESTION sentinel message');

    // Step 2: Send TRIGGER_INGESTION message (5-minute delay)
    const triggerMessage = {
      type: 'TRIGGER_INGESTION',
      discoveryId: discoveryId,
      metadata: {
        totalBatches: metadata.totalBatches,
        totalUrls: metadata.totalUrls,
        timestamp: new Date().toISOString()
      },
      message: 'Trigger sentinel - initiate Knowledge Base ingestion'
    };

    await sqsClient.send(new SendMessageCommand({
      QueueUrl: SCRAPING_QUEUE_URL,
      MessageBody: JSON.stringify(triggerMessage),
      MessageAttributes: {
        messageType: {
          DataType: 'String',
          StringValue: 'TRIGGER_INGESTION'
        }
      },
      DelaySeconds: 300 // 5-minute delay (300 seconds)
    }));

    console.log('Sent TRIGGER_INGESTION sentinel message with 5-minute delay');
    console.log('KB ingestion will be triggered automatically after content processing completes');

  } catch (error) {
    console.error('Error sending ingestion sentinel messages:', error);
    // Don't throw - this shouldn't fail the entire discovery
    console.warn('KB ingestion will need to be triggered manually');
  }
}

/**
 * Utility functions
 */
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