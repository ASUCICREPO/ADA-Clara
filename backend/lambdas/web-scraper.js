/**
 * Web Scraper Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /scrape - Scrape URLs and store content
 * - GET /health - Health check
 * - EventBridge scheduled events
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const http = require('http');

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || '';
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';
const RATE_LIMIT_DELAY = parseInt(process.env.RATE_LIMIT_DELAY || '2000');

// Default URLs for comprehensive diabetes information
const DEFAULT_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources',
  'https://diabetes.org/food-nutrition',
  'https://diabetes.org/community',
  'https://diabetes.org/professionals',
  'https://diabetes.org/about-diabetes/complications',
  'https://diabetes.org/about-diabetes/hypoglycemia',
  'https://diabetes.org/about-diabetes/prevention',
  'https://diabetes.org/tools-and-resources/a1c',
  'https://diabetes.org/food-nutrition/weight-management',
  'https://diabetes.org/tools-and-resources/affordable-insulin',
  'https://diabetes.org/tools-and-resources/health-insurance',
  'https://diabetes.org/living-with-diabetes/vaccinations'
];

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('Web Scraper Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Handle EventBridge scheduled events
    if (event.source === 'aws.events') {
      console.log('Processing scheduled EventBridge event');
      
      const detail = event.detail || {};
      const action = detail.action || 'scheduled-scrape';
      
      if (action === 'scheduled-discover-scrape' || action === 'scheduled-scrape') {
        const urls = detail.urls || DEFAULT_URLS;
        const result = await scrapeUrls(urls);
        
        return {
          statusCode: result.summary.successful > 0 ? 200 : 500,
          success: result.summary.successful > 0,
          timestamp: new Date().toISOString(),
          source: 'scheduled-execution',
          executionId: detail.executionId || 'unknown',
          action: action,
          result: result
        };
      }
      
      return {
        statusCode: 400,
        success: false,
        error: 'Unknown scheduled action',
        action: action
      };
    }

    // Handle direct Lambda invocation (no httpMethod property)
    if (!event.httpMethod) {
      console.log('Direct Lambda invocation detected');
      
      // Check if this is a health check
      if (event.action === 'health' || event.health) {
        return await handleHealthCheck();
      }
      
      // Default: treat as scrape request for direct invocation
      return await handleScrapeRequest(event);
    }

    // Handle HTTP API Gateway requests
    const method = event.httpMethod;
    const path = event.path;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return createResponse(200, '');
    }

    // Handle health check
    if (method === 'GET' && (path === '/health' || path === '/' || path.endsWith('/health'))) {
      return await handleHealthCheck();
    }

    // Handle scraping requests
    if (method === 'POST' && (path === '/scrape' || path.endsWith('/scrape'))) {
      return await handleScrapeRequest(event);
    }

    // Default: treat as scrape request for backward compatibility
    if (method === 'POST') {
      return await handleScrapeRequest(event);
    }

    return createResponse(404, {
      error: 'Endpoint not found',
      availableEndpoints: [
        'POST /scrape',
        'GET /health'
      ]
    });

  } catch (error) {
    console.error('Web Scraper handler error:', error);
    
    // For EventBridge events, return error in EventBridge format
    if (event.source === 'aws.events') {
      return {
        statusCode: 500,
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        source: 'scheduled-execution',
        executionId: event.detail?.executionId || 'unknown'
      };
    }

    return createResponse(500, {
      error: 'Web scraper processing failed',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId
    });
  }
};

/**
 * Handle scraping request
 */
async function handleScrapeRequest(event) {
  try {
    let urls = DEFAULT_URLS;
    
    // Handle direct Lambda invocation (URLs directly in event)
    if (event.urls && Array.isArray(event.urls) && event.urls.length > 0) {
      urls = event.urls;
      console.log(`Direct invocation: Using ${urls.length} URLs from event`);
    }
    // Handle API Gateway request (URLs in body)
    else if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.urls && Array.isArray(body.urls) && body.urls.length > 0) {
          urls = body.urls;
          console.log(`API Gateway: Using ${urls.length} URLs from body`);
        }
      } catch (parseError) {
        return createResponse(400, {
          error: 'Invalid JSON in request body',
          message: parseError.message
        });
      }
    }

    console.log(`Processing ${urls.length} URLs`);
    
    const result = await scrapeUrls(urls);
    
    // For direct invocation, return simple object
    if (!event.httpMethod) {
      return {
        success: true,
        message: 'Web scraping completed - Manual Knowledge Base sync required',
        summary: result.summary,
        results: result.results,
        note: 'Please manually sync the Knowledge Base from the AWS console to update the chatbot knowledge'
      };
    }
    
    // For API Gateway, return HTTP response
    return createResponse(200, {
      message: 'Web scraping completed - Manual Knowledge Base sync required',
      summary: result.summary,
      results: result.results,
      note: 'Please manually sync the Knowledge Base from the AWS console to update the chatbot knowledge'
    });

  } catch (error) {
    console.error('Scrape request error:', error);
    
    // For direct invocation, return simple error object
    if (!event.httpMethod) {
      return {
        success: false,
        error: 'Scraping failed',
        message: error.message || 'Unknown error'
      };
    }
    
    // For API Gateway, return HTTP error response
    return createResponse(500, {
      error: 'Scraping failed',
      message: error.message || 'Unknown error'
    });
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
      // Simple test - list objects with limit 1
      const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
      await s3Client.send(new ListObjectsV2Command({
        Bucket: CONTENT_BUCKET,
        MaxKeys: 1
      }));
      s3Healthy = true;
    } catch (error) {
      console.error('S3 health check failed:', error);
    }

    // Test HTTP connectivity
    let httpHealthy = false;
    try {
      await makeRequest('https://diabetes.org', { timeout: 5000 });
      httpHealthy = true;
    } catch (error) {
      console.error('HTTP health check failed:', error);
    }

    const overall = s3Healthy && httpHealthy;

    return createResponse(overall ? 200 : 503, {
      status: overall ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'web-scraper',
      version: '1.0.0-consolidated',
      services: {
        s3: s3Healthy,
        http: httpHealthy
      },
      configuration: {
        contentBucket: CONTENT_BUCKET,
        targetDomain: TARGET_DOMAIN,
        rateLimitDelay: RATE_LIMIT_DELAY,
        defaultUrls: DEFAULT_URLS.length
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
 * Scrape multiple URLs
 */
async function scrapeUrls(urls) {
  const results = [];
  let successful = 0;
  let failed = 0;
  let totalTextLength = 0;

  console.log(`Starting scraping for ${urls.length} URLs`);

  for (const url of urls) {
    try {
      const result = await scrapeUrl(url);
      results.push(result);
      
      if (result.success) {
        successful++;
        totalTextLength += result.textLength || 0;
      } else {
        failed++;
      }
      
      // Rate limiting between requests
      if (results.length < urls.length) {
        console.log(`Rate limiting: ${RATE_LIMIT_DELAY}ms delay`);
        await sleep(RATE_LIMIT_DELAY);
      }
      
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      results.push({
        url,
        success: false,
        error: error.message || 'Unknown error'
      });
      failed++;
    }
  }

  return {
    message: 'Scraping completed',
    summary: {
      totalUrls: urls.length,
      successful,
      failed,
      successRate: `${Math.round((successful / urls.length) * 100)}%`,
      totalDocuments: successful,
      totalTextLength,
      averageTextLength: successful > 0 ? Math.round(totalTextLength / successful) : 0
    },
    results
  };
}

/**
 * Scrape single URL
 */
async function scrapeUrl(url) {
  console.log(`Scraping: ${url}`);
  
  try {
    // Validate URL domain
    if (!url.includes(TARGET_DOMAIN)) {
      throw new Error(`URL must be from ${TARGET_DOMAIN} domain`);
    }

    // Fetch content
    const response = await makeRequest(url);
    
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    // Extract text and title
    const title = extractTitle(response.body);
    const text = extractTextFromHtml(response.body);
    
    if (text.length < 100) {
      throw new Error('Insufficient content extracted');
    }

    // Create single complete document (let Bedrock Knowledge Base handle chunking)
    const content = `# ${title}

Source: ${url}

${text}`;
    
    // Store as single document in S3 with metadata
    const key = `simple-content/${urlToKey(url)}.txt`;
    await s3Client.send(new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: key,
      Body: content,
      ContentType: 'text/plain',
      Metadata: {
        url: url.substring(0, 100), // Truncate for metadata limits
        title: title.substring(0, 50), // Truncate for metadata limits
        scraped: new Date().toISOString().substring(0, 10), // Just date
        domain: TARGET_DOMAIN
      }
    }));
    
    console.log(`Stored: ${key} (${text.length} chars)`);
    
    return {
      url,
      success: true,
      title,
      contentKey: key,
      textLength: text.length
    };
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return {
      url,
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Make HTTP request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const timeout = options.timeout || 10000;
    
    const request = client.get(url, {
      headers: {
        'User-Agent': 'ADA Clara Web Scraper/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        // Remove gzip encoding to avoid decompression issues
        'Connection': 'keep-alive'
      },
      timeout: timeout
    }, (response) => {
      let data = '';
      
      // Set encoding to handle text properly
      response.setEncoding('utf8');
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: data
        });
      });
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim().replace(/\s+/g, ' ');
  }
  
  // Fallback: look for h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].trim().replace(/\s+/g, ' ');
  }
  
  return 'Diabetes Information';
}

/**
 * Extract clean text from HTML
 */
function extractTextFromHtml(html) {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>.*?<\/script>/gis, '');
  text = text.replace(/<style[^>]*>.*?<\/style>/gis, '');
  text = text.replace(/<noscript[^>]*>.*?<\/noscript>/gis, '');
  
  // Remove HTML comments
  text = text.replace(/<!--.*?-->/gs, '');
  
  // Remove HTML tags but preserve some structure
  text = text.replace(/<\/?(h[1-6]|p|div|section|article)[^>]*>/gi, '\n');
  text = text.replace(/<br[^>]*>/gi, '\n');
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, '\n\n'); // Multiple newlines to double newline
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
  text = text.trim();
  
  // Remove common navigation and footer text patterns
  const unwantedPatterns = [
    /skip to main content/gi,
    /navigation/gi,
    /footer/gi,
    /cookie policy/gi,
    /privacy policy/gi,
    /terms of use/gi,
    /all rights reserved/gi,
    /copyright \d{4}/gi,
    /back to top/gi,
    /share this page/gi,
    /print this page/gi
  ];
  
  for (const pattern of unwantedPatterns) {
    text = text.replace(pattern, '');
  }
  
  // Final cleanup
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}

/**
 * Convert URL to safe key for storage
 */
function urlToKey(url) {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create standardized API response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  };
}