import { Handler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium, Browser, Page } from 'playwright-core';

interface CustomCrawlResult {
  url: string;
  title: string;
  content: string;
  extractedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  wordCount: number;
  links: string[];
  images: string[];
  metadata: {
    loadTime: number;
    hasJavaScript: boolean;
    dynamicContent: boolean;
    accessibility: {
      hasAltText: boolean;
      hasHeadings: boolean;
      hasAriaLabels: boolean;
    };
  };
  success: boolean;
  error?: string;
}

interface CustomCrawlRequest {
  urls?: string[];
  maxPages?: number;
  testMode?: boolean;
  includeImages?: boolean;
  waitForJs?: boolean;
}

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';

// Same test URLs as Bedrock crawler for comparison
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

export const handler: Handler = async (event: CustomCrawlRequest) => {
  console.log('Starting custom Playwright crawler test', { event });
  
  const urlsToTest = event.urls || TEST_URLS;
  const maxPages = event.maxPages || urlsToTest.length;
  const testMode = event.testMode !== false;
  const includeImages = event.includeImages || false;
  const waitForJs = event.waitForJs !== false; // Default to true
  
  const results: CustomCrawlResult[] = [];
  let browser: Browser | null = null;
  
  try {
    // Launch Playwright browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'ADA-Clara-Bot/1.0 (Educational/Medical Content Crawler)',
      viewport: { width: 1280, height: 720 }
    });
    
    // Test each URL
    for (let i = 0; i < Math.min(maxPages, urlsToTest.length); i++) {
      const url = urlsToTest[i];
      console.log(`Testing URL ${i + 1}/${maxPages}: ${url}`);
      
      try {
        const result = await scrapeWithPlaywright(context, url, { includeImages, waitForJs });
        results.push(result);
        
        // Store result in S3 for analysis
        if (!testMode) {
          await storeContentInS3(result);
        }
        
        // Add delay to be respectful
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
          images: [],
          metadata: {
            loadTime: 0,
            hasJavaScript: false,
            dynamicContent: false,
            accessibility: {
              hasAltText: false,
              hasHeadings: false,
              hasAriaLabels: false
            }
          },
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await browser.close();
    
    // Generate comparison report
    const report = generateCustomCrawlReport(results);
    console.log('Custom Crawler Report:', JSON.stringify(report, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Custom crawler test completed',
        results,
        report,
        testMode,
        crawlerType: 'playwright'
      })
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Custom crawler test failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Custom crawler test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function scrapeWithPlaywright(
  context: any, 
  url: string, 
  options: { includeImages: boolean; waitForJs: boolean }
): Promise<CustomCrawlResult> {
  const startTime = Date.now();
  const page = await context.newPage();
  
  try {
    // Navigate to page
    await page.goto(url, { 
      waitUntil: options.waitForJs ? 'networkidle' : 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for any dynamic content to load
    if (options.waitForJs) {
      await page.waitForTimeout(2000);
    }
    
    const loadTime = Date.now() - startTime;
    
    // Extract title
    const title = await page.title() || 
                  await page.textContent('h1') || 
                  'No title found';
    
    // Remove unwanted elements
    await page.evaluate(() => {
      const unwantedSelectors = [
        'script', 'style', 'nav', 'footer', 
        '.advertisement', '.ads', '.cookie-banner',
        '.social-share', '.related-articles'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
    });
    
    // Extract main content
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
      try {
        const element = await page.$(selector);
        if (element) {
          content = await element.textContent() || '';
          if (content.trim()) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Fallback to body content
    if (!content.trim()) {
      content = await page.textContent('body') || '';
    }
    
    // Clean content
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    // Extract links
    const links = await page.evaluate((domain) => {
      const linkElements = document.querySelectorAll('a[href]');
      const urls: string[] = [];
      linkElements.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.includes(domain) || href.startsWith('/'))) {
          const fullUrl = href.startsWith('/') ? `https://${domain}${href}` : href;
          urls.push(fullUrl);
        }
      });
      return [...new Set(urls)];
    }, TARGET_DOMAIN);
    
    // Extract images if requested
    let images: string[] = [];
    if (options.includeImages) {
      images = await page.evaluate(() => {
        const imgElements = document.querySelectorAll('img[src]');
        const imgUrls: string[] = [];
        imgElements.forEach(img => {
          const src = img.getAttribute('src');
          if (src) {
            imgUrls.push(src);
          }
        });
        return imgUrls;
      });
    }
    
    // Check for JavaScript and dynamic content
    const hasJavaScript = await page.evaluate(() => {
      return document.querySelectorAll('script[src]').length > 0;
    });
    
    const dynamicContent = await page.evaluate(() => {
      // Check for common dynamic content indicators
      const indicators = [
        '[data-react-root]',
        '[ng-app]',
        '.vue-app',
        '[data-vue]'
      ];
      return indicators.some(selector => document.querySelector(selector) !== null);
    });
    
    // Accessibility checks
    const accessibility = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const hasAltText = Array.from(images).some(img => img.getAttribute('alt'));
      
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const hasHeadings = headings.length > 0;
      
      const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [role]');
      const hasAriaLabels = ariaElements.length > 0;
      
      return {
        hasAltText,
        hasHeadings,
        hasAriaLabels
      };
    });
    
    await page.close();
    
    return {
      url,
      title: title.trim(),
      content,
      extractedAt: new Date().toISOString(),
      contentType: determineContentType(url, title, content),
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      links,
      images,
      metadata: {
        loadTime,
        hasJavaScript,
        dynamicContent,
        accessibility
      },
      success: true
    };
    
  } catch (error) {
    await page.close();
    throw error;
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

async function storeContentInS3(result: CustomCrawlResult): Promise<void> {
  const key = `custom-scraped-content/${new Date().toISOString().split('T')[0]}/${encodeURIComponent(result.url)}.json`;
  
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
      crawlerType: 'playwright'
    }
  });
  
  await s3.send(command);
  console.log(`Stored custom crawler content in S3: ${key}`);
}

function generateCustomCrawlReport(results: CustomCrawlResult[]) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const contentTypes = successful.reduce((acc, r) => {
    acc[r.contentType] = (acc[r.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgWordCount = successful.length > 0 
    ? successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length 
    : 0;
  
  const avgLoadTime = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.metadata.loadTime, 0) / successful.length
    : 0;
  
  const totalLinks = successful.reduce((sum, r) => sum + r.links.length, 0);
  const totalImages = successful.reduce((sum, r) => sum + r.images.length, 0);
  
  const jsPages = successful.filter(r => r.metadata.hasJavaScript).length;
  const dynamicPages = successful.filter(r => r.metadata.dynamicContent).length;
  
  const accessibilityStats = {
    withAltText: successful.filter(r => r.metadata.accessibility.hasAltText).length,
    withHeadings: successful.filter(r => r.metadata.accessibility.hasHeadings).length,
    withAriaLabels: successful.filter(r => r.metadata.accessibility.hasAriaLabels).length
  };
  
  return {
    totalUrls: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    contentTypes,
    averageWordCount: Math.round(avgWordCount),
    averageLoadTime: Math.round(avgLoadTime),
    totalLinksFound: totalLinks,
    totalImagesFound: totalImages,
    pagesWithJavaScript: jsPages,
    pagesWithDynamicContent: dynamicPages,
    accessibilityStats,
    errors: failed.map(r => ({ url: r.url, error: r.error }))
  };
}