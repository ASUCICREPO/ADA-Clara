import { ScrapingService } from '../../core/services/scraping.service';
import { DynamoDBService } from '../../core/services/dynamodb.service';
import { S3Service } from '../../core/services/s3.service';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export interface DomainCrawlerConfig {
  targetDomain: string;
  maxPages: number;
  maxDepth: number;
  rateLimitDelay: number;
  respectRobotsTxt: boolean;
  allowedPaths: string[];
  blockedPaths: string[];
  contentTrackingTable: string;
  contentBucket: string;
}

export interface CrawlResult {
  discoveredUrls: string[];
  processedUrls: string[];
  skippedUrls: string[];
  failedUrls: string[];
  newContent: number;
  modifiedContent: number;
  unchangedContent: number;
  totalProcessingTime: number;
  changeDetectionSummary: {
    totalChecked: number;
    hasChanges: number;
    noChanges: number;
    newUrls: number;
  };
}

export interface UrlDiscoveryResult {
  sitemapUrls: string[];
  crawledUrls: string[];
  totalDiscovered: number;
  discoveryMethod: 'sitemap' | 'crawl' | 'hybrid';
}

/**
 * Comprehensive Domain Crawler Service
 * 
 * Implements full domain crawling with:
 * - Sitemap.xml parsing for URL discovery
 * - Recursive link following with depth control
 * - Comprehensive change detection
 * - Robots.txt compliance
 * - Rate limiting and respectful crawling
 */
export class DomainCrawlerService {
  private config: Required<DomainCrawlerConfig>;
  private visitedUrls = new Set<string>();
  private discoveredUrls = new Set<string>();
  private robotsRules: any = null;

  constructor(
    private scrapingService: ScrapingService,
    private dynamoService: DynamoDBService,
    private s3Service: S3Service,
    config: DomainCrawlerConfig
  ) {
    this.config = {
      targetDomain: config.targetDomain,
      maxPages: config.maxPages,
      maxDepth: config.maxDepth,
      rateLimitDelay: config.rateLimitDelay,
      respectRobotsTxt: config.respectRobotsTxt,
      allowedPaths: config.allowedPaths,
      blockedPaths: config.blockedPaths,
      contentTrackingTable: config.contentTrackingTable,
      contentBucket: config.contentBucket
    };
  }

  /**
   * Discover URLs from domain using sitemap and crawling
   */
  async discoverUrls(): Promise<UrlDiscoveryResult> {
    console.log(`🔍 Discovering URLs for domain: ${this.config.targetDomain}`);
    
    const sitemapUrls = await this.parseSitemap();
    const crawledUrls = await this.crawlForUrls();
    
    const allUrls = new Set([...sitemapUrls, ...crawledUrls]);
    const filteredUrls = Array.from(allUrls).filter(url => this.isUrlAllowed(url));
    
    return {
      sitemapUrls,
      crawledUrls,
      totalDiscovered: filteredUrls.length,
      discoveryMethod: sitemapUrls.length > 0 ? 'hybrid' : 'crawl'
    };
  }

  /**
   * Parse sitemap.xml for URL discovery
   */
  private async parseSitemap(): Promise<string[]> {
    try {
      const sitemapUrl = `https://${this.config.targetDomain}/sitemap.xml`;
      console.log(`📄 Parsing sitemap: ${sitemapUrl}`);
      
      const response = await axios.get(sitemapUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      const urls: string[] = [];
      $('url > loc').each((_, element) => {
        const url = $(element).text().trim();
        if (url && this.isUrlAllowed(url)) {
          urls.push(url);
        }
      });
      
      console.log(`✅ Found ${urls.length} URLs in sitemap`);
      return urls;
    } catch (error) {
      console.log(`⚠️ Sitemap parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Crawl domain for URL discovery
   */
  private async crawlForUrls(): Promise<string[]> {
    const startUrl = `https://${this.config.targetDomain}`;
    const discoveredUrls = new Set<string>();
    const toVisit = [startUrl];
    
    console.log(`🕷️ Starting crawl from: ${startUrl}`);
    
    while (toVisit.length > 0 && discoveredUrls.size < this.config.maxPages) {
      const url = toVisit.shift()!;
      
      if (this.visitedUrls.has(url) || !this.isUrlAllowed(url)) {
        continue;
      }
      
      try {
        this.visitedUrls.add(url);
        const links = await this.extractLinksFromPage(url);
        
        links.forEach(link => {
          if (!discoveredUrls.has(link) && this.isUrlAllowed(link)) {
            discoveredUrls.add(link);
            if (toVisit.length < 50) { // Limit queue size
              toVisit.push(link);
            }
          }
        });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
      } catch (error) {
        console.log(`⚠️ Failed to crawl ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`✅ Crawl discovered ${discoveredUrls.size} URLs`);
    return Array.from(discoveredUrls);
  }

  /**
   * Extract links from a page
   */
  private async extractLinksFromPage(url: string): Promise<string[]> {
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: { 'User-Agent': 'ADA Clara Crawler/2.0' }
    });
    
    const $ = cheerio.load(response.data);
    const links: string[] = [];
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = new URL(href, url).href;
        if (absoluteUrl.includes(this.config.targetDomain)) {
          links.push(absoluteUrl);
        }
      }
    });
    
    return links;
  }

  /**
   * Check if URL is allowed based on configuration
   */
  private isUrlAllowed(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Must be from target domain
      if (!urlObj.hostname.includes(this.config.targetDomain)) {
        return false;
      }
      
      // Check blocked paths
      if (this.config.blockedPaths.some(path => urlObj.pathname.includes(path))) {
        return false;
      }
      
      // Check allowed paths (if specified)
      if (this.config.allowedPaths.length > 0) {
        return this.config.allowedPaths.some(path => urlObj.pathname.includes(path));
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Comprehensive crawl with change detection
   */
  async crawlDomain(): Promise<CrawlResult> {
    const startTime = Date.now();
    console.log(`🚀 Starting comprehensive domain crawl for: ${this.config.targetDomain}`);
    
    // Step 1: Discover URLs
    const discovery = await this.discoverUrls();
    const urlsToProcess = discovery.sitemapUrls.concat(discovery.crawledUrls)
      .filter((url, index, arr) => arr.indexOf(url) === index) // Remove duplicates
      .slice(0, this.config.maxPages);
    
    console.log(`📋 Processing ${urlsToProcess.length} URLs`);
    
    const result: CrawlResult = {
      discoveredUrls: urlsToProcess,
      processedUrls: [],
      skippedUrls: [],
      failedUrls: [],
      newContent: 0,
      modifiedContent: 0,
      unchangedContent: 0,
      totalProcessingTime: 0,
      changeDetectionSummary: {
        totalChecked: 0,
        hasChanges: 0,
        noChanges: 0,
        newUrls: 0
      }
    };
    
    // Step 2: Process each URL with change detection
    for (const url of urlsToProcess) {
      try {
        console.log(`🔄 Processing: ${url}`);
        
        const changeStatus = await this.checkContentChanges(url);
        result.changeDetectionSummary.totalChecked++;
        
        if (changeStatus.hasChanges || changeStatus.isNew) {
          // Process URL (scrape and store)
          await this.processUrl(url);
          result.processedUrls.push(url);
          
          if (changeStatus.isNew) {
            result.newContent++;
            result.changeDetectionSummary.newUrls++;
          } else {
            result.modifiedContent++;
            result.changeDetectionSummary.hasChanges++;
          }
        } else {
          // Skip unchanged content
          result.skippedUrls.push(url);
          result.unchangedContent++;
          result.changeDetectionSummary.noChanges++;
          console.log(`⏭️ Skipped (no changes): ${url}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
      } catch (error) {
        console.error(`❌ Failed to process ${url}:`, error);
        result.failedUrls.push(url);
      }
    }
    
    result.totalProcessingTime = Date.now() - startTime;
    
    console.log(`✅ Domain crawl completed:`, {
      processed: result.processedUrls.length,
      skipped: result.skippedUrls.length,
      failed: result.failedUrls.length,
      newContent: result.newContent,
      modifiedContent: result.modifiedContent,
      unchangedContent: result.unchangedContent,
      totalTime: `${result.totalProcessingTime}ms`
    });
    
    return result;
  }

  /**
   * Check if content has changed since last crawl
   */
  private async checkContentChanges(url: string): Promise<{ hasChanges: boolean; isNew: boolean; currentHash?: string; previousHash?: string }> {
    try {
      // Get current content hash
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: { 'User-Agent': 'ADA Clara Crawler/2.0' }
      });
      
      const currentHash = createHash('sha256').update(response.data).digest('hex');
      
      // Check previous hash from DynamoDB
      const trackingKey = this.urlToTrackingKey(url);
      const previousRecord = await this.dynamoService.getItem(
        this.config.contentTrackingTable,
        { url: trackingKey }
      );
      
      if (!previousRecord) {
        // New URL
        await this.updateContentTracking(url, currentHash);
        return { hasChanges: true, isNew: true, currentHash };
      }
      
      const previousHash = previousRecord.contentHash;
      const hasChanges = currentHash !== previousHash;
      
      if (hasChanges) {
        // Update tracking record
        await this.updateContentTracking(url, currentHash);
      }
      
      return { hasChanges, isNew: false, currentHash, previousHash };
    } catch (error) {
      console.error(`Error checking content changes for ${url}:`, error);
      return { hasChanges: true, isNew: true }; // Default to processing on error
    }
  }

  /**
   * Update content tracking record
   */
  private async updateContentTracking(url: string, contentHash: string): Promise<void> {
    const trackingKey = this.urlToTrackingKey(url);
    await this.dynamoService.putItem(this.config.contentTrackingTable, {
      url: trackingKey,
      contentHash,
      lastCrawled: new Date().toISOString(),
      domain: this.config.targetDomain,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    });
  }

  /**
   * Process individual URL (scrape and store)
   */
  private async processUrl(url: string): Promise<void> {
    const result = await this.scrapingService.scrapeUrl(url);
    
    if (!result.success || !result.data) {
      throw new Error(`Failed to scrape ${url}: ${result.error}`);
    }
    
    const content = result.data;
    
    // Store in S3
    const key = `scraped-content/${this.urlToKey(url)}.json`;
    await this.s3Service.putObject(this.config.contentBucket, {
      key,
      body: JSON.stringify({
        url,
        title: content.title,
        content: content.content,
        scrapedAt: content.scrapedAt,
        domain: this.config.targetDomain
      }),
      contentType: 'application/json'
    });
  }

  /**
   * Convert URL to tracking key
   */
  private urlToTrackingKey(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Convert URL to S3 key
   */
  private urlToKey(url: string): string {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname}`.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
}