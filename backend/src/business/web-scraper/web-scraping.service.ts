import { S3Service } from '../../core/services/s3.service';
import { DynamoDBService } from '../../core/services/dynamodb.service';
import { ScrapingService, ScrapedContent } from '../../core/services/scraping.service';

export interface WebScrapingConfig {
  contentBucket: string;
  contentTrackingTable: string;
  targetDomain: string;
  maxPages: number;
  rateLimitDelay: number;
  allowedPaths: string[];
  blockedPaths: string[];
}

export interface ScrapingResult {
  url: string;
  success: boolean;
  title?: string;
  contentLength?: number;
  contentKey?: string;
  scrapedAt?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface BatchScrapingResult {
  message: string;
  summary: {
    totalUrls: number;
    successful: number;
    skipped: number;
    errors: number;
    successRate: string;
  };
  results: ScrapingResult[];
  nextSteps: {
    embeddingProcessing: string;
    vectorStorage: string;
  };
}

/**
 * Web Scraping Service
 * Handles content acquisition and storage with change detection
 */
export class WebScrapingService {
  private config: Required<WebScrapingConfig>;

  constructor(
    private s3Service: S3Service,
    private dynamoService: DynamoDBService,
    private scrapingService: ScrapingService,
    config: WebScrapingConfig
  ) {
    this.config = {
      contentBucket: config.contentBucket,
      contentTrackingTable: config.contentTrackingTable,
      targetDomain: config.targetDomain,
      maxPages: config.maxPages,
      rateLimitDelay: config.rateLimitDelay,
      allowedPaths: config.allowedPaths,
      blockedPaths: config.blockedPaths
    };
  }

  /**
   * Scrape multiple URLs with change detection
   */
  async scrapeUrls(
    urls: string[], 
    forceRefresh: boolean = false
  ): Promise<BatchScrapingResult> {
    const maxUrls = Math.min(urls.length, this.config.maxPages);
    console.log(`Scraping ${maxUrls} URLs (forceRefresh: ${forceRefresh})`);
    
    const results: ScrapingResult[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < maxUrls; i++) {
      const url = urls[i];
      
      try {
        // Validate URL
        if (!this.isValidUrl(url)) {
          results.push({
            url,
            success: false,
            error: 'Invalid or blocked URL',
            skipped: true
          });
          skippedCount++;
          continue;
        }
        
        // Check if content has changed (unless forced)
        if (!forceRefresh) {
          const hasChanged = await this.checkContentChanged(url);
          if (!hasChanged) {
            results.push({
              url,
              success: true,
              skipped: true,
              reason: 'Content unchanged'
            });
            skippedCount++;
            continue;
          }
        }
        
        // Scrape the URL
        const result = await this.scrapeAndStoreUrl(url);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Rate limiting
        if (i < maxUrls - 1) {
          await this.sleep(this.config.rateLimitDelay);
        }
        
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }
    
    return {
      message: 'Scraping completed',
      summary: {
        totalUrls: maxUrls,
        successful: successCount,
        skipped: skippedCount,
        errors: errorCount,
        successRate: ((successCount / maxUrls) * 100).toFixed(1) + '%'
      },
      results,
      nextSteps: {
        embeddingProcessing: 'Trigger embedding-processor Lambda with scraped content',
        vectorStorage: 'Content will be converted to vectors automatically'
      }
    };
  }

  /**
   * Scrape a single URL
   */
  async scrapeSingleUrl(url: string): Promise<ScrapingResult> {
    if (!this.isValidUrl(url)) {
      return {
        url,
        success: false,
        error: 'Invalid or blocked URL'
      };
    }
    
    return await this.scrapeAndStoreUrl(url);
  }

  /**
   * Test scraper functionality
   */
  async testScraper(testUrl?: string): Promise<{
    message: string;
    test: {
      url: string;
      urlValidation: boolean;
      contentLength: number;
      title: string;
      hasContent: boolean;
    };
    scraperStatus: string;
    configuration: WebScrapingConfig;
  }> {
    const url = testUrl || `https://${this.config.targetDomain}/about-diabetes/type-1`;
    
    console.log(`Testing scraper with: ${url}`);
    
    // Test URL validation
    const isValid = this.isValidUrl(url);
    
    // Test content fetching (without storing)
    const scrapingResult = await this.scrapingService.scrapeUrl(url);
    
    if (!scrapingResult.success || !scrapingResult.data) {
      throw new Error(`Scraping test failed: ${scrapingResult.error}`);
    }
    
    const scrapedData = scrapingResult.data;
    
    return {
      message: 'Scraper test completed successfully',
      test: {
        url,
        urlValidation: isValid,
        contentLength: scrapedData.contentLength,
        title: scrapedData.title,
        hasContent: scrapedData.contentLength > 100
      },
      scraperStatus: 'operational',
      configuration: this.config
    };
  }

  /**
   * Check content changes for multiple URLs
   */
  async checkContentChanges(urls: string[]): Promise<Array<{
    url: string;
    hasChanged?: boolean;
    lastCrawled?: string;
    status: string;
    error?: string;
  }>> {
    const changeResults = [];
    
    for (const url of urls) {
      try {
        const hasChanged = await this.checkContentChanged(url);
        const lastCrawled = await this.getLastCrawlTimestamp(url);
        
        changeResults.push({
          url,
          hasChanged,
          lastCrawled: lastCrawled || 'Never',
          status: hasChanged ? 'needs-update' : 'current'
        });
      } catch (error) {
        changeResults.push({
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error'
        });
      }
    }
    
    return changeResults;
  }

  /**
   * Scrape and store a single URL
   */
  private async scrapeAndStoreUrl(url: string): Promise<ScrapingResult> {
    try {
      console.log(`Scraping: ${url}`);
      
      // Scrape content using ScrapingService
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      
      if (!scrapingResult.success || !scrapingResult.data) {
        throw new Error(`Scraping failed: ${scrapingResult.error}`);
      }
      
      const scrapedData = scrapingResult.data;
      
      // Validate content
      if (scrapedData.contentLength < 100) {
        throw new Error('Content too short or empty');
      }
      
      // Store content in S3
      const contentKey = await this.storeContent(scrapedData);
      
      // Update content tracking
      await this.updateContentTracking(url, scrapedData);
      
      return {
        url,
        success: true,
        title: scrapedData.title,
        contentLength: scrapedData.contentLength,
        contentKey,
        scrapedAt: scrapedData.scrapedAt
      };
      
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error);
      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Store content in S3
   */
  private async storeContent(scrapedData: ScrapedContent): Promise<string> {
    const key = `diabetes-content/${this.urlToKey(scrapedData.url)}.json`;
    
    const contentData = {
      url: scrapedData.url,
      title: scrapedData.title,
      content: scrapedData.content,
      contentLength: scrapedData.contentLength,
      contentHash: scrapedData.contentHash,
      scrapedAt: scrapedData.scrapedAt,
      source: 'web-scraper-lambda',
      version: '2.0',
      metadata: scrapedData.metadata
    };

    await this.s3Service.putJsonObject(this.config.contentBucket, key, contentData, {
      url: scrapedData.url,
      title: scrapedData.title.substring(0, 100), // Metadata limit
      scrapedAt: scrapedData.scrapedAt,
      contentHash: scrapedData.contentHash
    });

    console.log(`Content stored: ${key}`);
    return key;
  }

  /**
   * Update content tracking in DynamoDB
   */
  private async updateContentTracking(url: string, scrapedData: ScrapedContent): Promise<void> {
    try {
      const item = {
        PK: `CONTENT#${this.urlToKey(url)}`,
        SK: 'METADATA',
        url: scrapedData.url,
        title: scrapedData.title,
        contentHash: scrapedData.contentHash,
        contentLength: scrapedData.contentLength,
        lastCrawled: scrapedData.scrapedAt,
        updatedAt: new Date().toISOString(),
        source: 'web-scraper-lambda'
      };

      await this.dynamoService.putItem(this.config.contentTrackingTable, item);
      console.log(`Content tracking updated for ${url}`);
    } catch (error) {
      console.error(`Failed to update content tracking for ${url}:`, error);
      // Don't throw - this is not critical for scraping
    }
  }

  /**
   * Check if content has changed since last crawl
   */
  private async checkContentChanged(url: string): Promise<boolean> {
    try {
      // Get previous content hash
      const result = await this.dynamoService.getItem(
        this.config.contentTrackingTable,
        {
          PK: `CONTENT#${this.urlToKey(url)}`,
          SK: 'METADATA'
        }
      );

      if (!result) {
        return true; // New content
      }

      // Fetch current content to compare
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      if (!scrapingResult.success || !scrapingResult.data) {
        return true; // Default to processing if scraping fails
      }
      
      const hasChanged = result.contentHash !== scrapingResult.data.contentHash;
      
      console.log(`Content change check for ${url}: ${hasChanged ? 'CHANGED' : 'UNCHANGED'}`);
      return hasChanged;
      
    } catch (error) {
      console.error(`Content change check failed for ${url}:`, error);
      return true; // Default to processing if check fails
    }
  }

  /**
   * Get last crawl timestamp for a URL
   */
  private async getLastCrawlTimestamp(url: string): Promise<string | null> {
    try {
      const result = await this.dynamoService.getItem(
        this.config.contentTrackingTable,
        {
          PK: `CONTENT#${this.urlToKey(url)}`,
          SK: 'METADATA'
        }
      );

      return result ? result.lastCrawled : null;
    } catch (error) {
      console.error(`Failed to get last crawl timestamp for ${url}:`, error);
      return null;
    }
  }

  /**
   * Validate URL against allowed/blocked patterns
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check domain
      if (!urlObj.hostname.includes(this.config.targetDomain)) {
        return false;
      }
      
      // Check protocol
      if (urlObj.protocol !== 'https:') {
        return false;
      }
      
      // Check blocked paths
      for (const blockedPath of this.config.blockedPaths) {
        if (urlObj.pathname.startsWith(blockedPath)) {
          return false;
        }
      }
      
      // Check allowed paths (if configured)
      if (this.config.allowedPaths.length > 0) {
        const isAllowed = this.config.allowedPaths.some(allowedPath => 
          urlObj.pathname.startsWith(allowedPath)
        );
        if (!isAllowed) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert URL to safe key for storage
   */
  private urlToKey(url: string): string {
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
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get configuration
   */
  getConfig(): WebScrapingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<WebScrapingConfig>): void {
    Object.assign(this.config, updates);
  }
}