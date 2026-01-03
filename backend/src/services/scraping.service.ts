import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export interface ScrapingConfig {
  timeout?: number;
  userAgent?: string;
  maxRetries?: number;
  retryDelay?: number;
  maxContentLength?: number;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  contentHash: string;
  scrapedAt: string;
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedDate?: string;
    language?: string;
  };
}

export interface ScrapingResult {
  success: boolean;
  data?: ScrapedContent;
  error?: string;
  statusCode?: number;
  retryCount?: number;
}

export class ScrapingService {
  private config: Required<ScrapingConfig>;

  constructor(config: ScrapingConfig = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'ADA Clara Scraper/2.0',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      maxContentLength: config.maxContentLength || 1000000 // 1MB
    };
  }

  /**
   * Scrape content from a URL
   */
  async scrapeUrl(url: string): Promise<ScrapingResult> {
    let retryCount = 0;
    
    while (retryCount <= this.config.maxRetries) {
      try {
        console.log(`Scraping: ${url} (attempt ${retryCount + 1}/${this.config.maxRetries + 1})`);
        
        const response = await this.fetchUrl(url);
        const scrapedContent = this.parseHtml(response.data, url);
        
        return {
          success: true,
          data: scrapedContent,
          statusCode: response.status,
          retryCount
        };
      } catch (error: any) {
        retryCount++;
        
        if (retryCount > this.config.maxRetries) {
          console.error(`Failed to scrape ${url} after ${this.config.maxRetries + 1} attempts:`, error.message);
          return {
            success: false,
            error: error.message,
            statusCode: error.response?.status,
            retryCount: retryCount - 1
          };
        }
        
        console.warn(`Scraping attempt ${retryCount} failed for ${url}, retrying in ${this.config.retryDelay}ms...`);
        await this.delay(this.config.retryDelay * retryCount); // Exponential backoff
      }
    }
    
    return {
      success: false,
      error: 'Max retries exceeded',
      retryCount: this.config.maxRetries
    };
  }

  /**
   * Scrape multiple URLs with concurrency control
   */
  async scrapeUrls(urls: string[], concurrency: number = 3): Promise<ScrapingResult[]> {
    console.log(`Starting batch scraping for ${urls.length} URLs with concurrency ${concurrency}`);
    
    const results: ScrapingResult[] = [];
    
    // Process URLs in batches to control concurrency
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map(url => this.scrapeUrl(url));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      console.log(`Batch ${Math.floor(i/concurrency) + 1}/${Math.ceil(urls.length/concurrency)} completed`);
      
      // Rate limiting between batches
      if (i + concurrency < urls.length) {
        await this.delay(2000);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`Batch scraping completed: ${successCount}/${urls.length} successful`);
    
    return results;
  }

  /**
   * Fetch URL with proper error handling
   */
  private async fetchUrl(url: string): Promise<any> {
    const config: AxiosRequestConfig = {
      timeout: this.config.timeout,
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      maxContentLength: this.config.maxContentLength,
      validateStatus: (status) => status >= 200 && status < 400
    };

    return await axios.get(url, config);
  }

  /**
   * Parse HTML content and extract structured data
   */
  private parseHtml(html: string, url: string): ScrapedContent {
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, .navigation, .menu, .sidebar, .ads, .advertisement').remove();
    
    // Extract title
    const title = this.extractTitle($);
    
    // Extract main content
    const content = this.extractContent($);
    
    // Extract metadata
    const metadata = this.extractMetadata($);
    
    // Generate content hash
    const contentHash = createHash('sha256').update(content).digest('hex');
    
    return {
      url,
      title,
      content,
      contentLength: content.length,
      contentHash,
      scrapedAt: new Date().toISOString(),
      metadata
    };
  }

  /**
   * Extract page title
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors for title
    const titleSelectors = [
      'title',
      'h1',
      '.title',
      '.page-title',
      '[property="og:title"]',
      '[name="twitter:title"]'
    ];
    
    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const title = selector.includes('[') 
          ? element.attr('content') || element.text()
          : element.text();
        
        if (title && title.trim().length > 0) {
          return title.trim();
        }
      }
    }
    
    return 'Untitled';
  }

  /**
   * Extract main content from page
   */
  private extractContent($: cheerio.CheerioAPI): string {
    // Try multiple selectors for main content
    const contentSelectors = [
      'main',
      '.content',
      '.main-content',
      'article',
      '.article-content',
      '.post-content',
      '#content',
      '.entry-content',
      '[role="main"]'
    ];
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const content = element.text().replace(/\s+/g, ' ').trim();
        if (content.length > 100) { // Minimum content threshold
          return content;
        }
      }
    }
    
    // Fallback to body content
    const bodyContent = $('body').text().replace(/\s+/g, ' ').trim();
    return bodyContent;
  }

  /**
   * Extract metadata from page
   */
  private extractMetadata($: cheerio.CheerioAPI): ScrapedContent['metadata'] {
    const metadata: ScrapedContent['metadata'] = {};
    
    // Description
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
    if (description) {
      metadata.description = description.trim();
    }
    
    // Keywords
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      metadata.keywords = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
    
    // Author
    const author = $('meta[name="author"]').attr('content') || 
                   $('meta[property="article:author"]').attr('content');
    if (author) {
      metadata.author = author.trim();
    }
    
    // Published date
    const publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                         $('meta[name="date"]').attr('content') ||
                         $('time[datetime]').attr('datetime');
    if (publishedDate) {
      metadata.publishedDate = publishedDate.trim();
    }
    
    // Language
    const language = $('html').attr('lang') || 
                    $('meta[http-equiv="content-language"]').attr('content');
    if (language) {
      metadata.language = language.trim();
    }
    
    return metadata;
  }

  /**
   * Validate URL before scraping
   */
  static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is allowed for scraping
   */
  static isAllowedDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const urlObj = new URL(url);
      return allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate safe filename from URL
   */
  static urlToFilename(url: string): string {
    return url
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for scraping service
   */
  async healthCheck(testUrl: string = 'https://httpbin.org/get'): Promise<boolean> {
    try {
      const result = await this.scrapeUrl(testUrl);
      return result.success;
    } catch (error) {
      console.error('Scraping service health check failed:', error);
      return false;
    }
  }
}