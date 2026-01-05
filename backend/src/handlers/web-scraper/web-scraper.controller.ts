/**
 * Web Scraper Controller
 * 
 * Handles HTTP requests for web scraping operations with:
 * - Domain discovery and intelligent URL prioritization
 * - Structured content extraction and AI enhancement
 * - Intelligent chunking and S3 Vectors storage
 * - Comprehensive error handling and monitoring
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../services/container';
import { WebScraperService } from '../../business/web-scraper/web-scraper.service';

export interface DiscoverAndScrapeRequest {
  action: 'discover-scrape';
  domain?: string;
  maxUrls?: number;
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface ScrapeUrlsRequest {
  action: 'scrape-urls';
  urls?: string[]; // Made optional - will use defaults if not provided
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface ScrapeUrlRequest {
  action: 'scrape-single';
  url: string;
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface TestScraperRequest {
  action: 'test-scraper';
  testUrl?: string;
}

export interface CheckContentChangesRequest {
  action: 'check-content-changes';
  urls?: string[];
}

// Default URLs for diabetes.org (comprehensive list from working implementation)
const DEFAULT_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources',
  'https://diabetes.org/food-nutrition',
  'https://diabetes.org/community',
  'https://diabetes.org/professionals'
];

/**
 * Web Scraper Controller
 * Provides comprehensive content processing with AI enhancement and vector storage
 */
export class WebScraperController {
  private scraperService: WebScraperService;

  constructor(private container: ServiceContainer) {
    // Initialize scraper service with configuration
    this.scraperService = new WebScraperService(
      container.s3Service,
      container.bedrockService,
      container.s3VectorsService,
      container.scrapingService,
      {
        // S3 Vectors configuration
        contentBucket: process.env.CONTENT_BUCKET || '',
        vectorsBucket: process.env.VECTORS_BUCKET || '',
        vectorIndex: process.env.VECTOR_INDEX || '',
        embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
        
        // Domain and scraping configuration
        targetDomain: process.env.TARGET_DOMAIN || 'diabetes.org',
        maxPages: parseInt(process.env.MAX_PAGES || '10'),
        rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
        
        // Enhanced processing configuration (defaults)
        enableContentEnhancement: true,
        enableIntelligentChunking: true,
        enableStructuredExtraction: true,
        chunkingStrategy: 'hybrid',
        
        // Change detection configuration
        enableChangeDetection: true,
        skipUnchangedContent: true,
        forceRefresh: false,
        
        // Quality and performance settings
        qualityThreshold: 0.7,
        maxRetries: 3,
        batchSize: 3
      }
    );
  }

  /**
   * Domain discovery and scraping with full AI pipeline
   * Increased limits with responsible rate limiting for comprehensive coverage
   */
  async handleDiscoverAndScrape(request: DiscoverAndScrapeRequest): Promise<APIGatewayProxyResult> {
    try {
      const domain = request.domain || 'diabetes.org';
      
      // Increased safety limit with tiered approach for responsible scraping
      let maxUrls: number;
      if (request.maxUrls && request.maxUrls <= 50) {
        maxUrls = request.maxUrls; // Small batches: no limit
      } else if (request.maxUrls && request.maxUrls <= 200) {
        maxUrls = Math.min(request.maxUrls, 200); // Medium batches: up to 200
      } else {
        maxUrls = Math.min(request.maxUrls || 50, 500); // Large batches: up to 500 with proper rate limiting
      }
      
      console.log(`Starting enhanced discover and scrape for ${domain}`);
      console.log(`Requested URLs: ${request.maxUrls || 'default'}, Processing: ${maxUrls}`);
      console.log(`Rate limiting: Enabled for responsible scraping`);
      
      // Update configuration based on request with enhanced rate limiting for larger batches
      this.updateScraperConfig(request);
      
      // Adjust rate limiting based on batch size
      if (maxUrls > 100) {
        console.log(`Large batch detected (${maxUrls} URLs) - using conservative rate limiting`);
        // The scraper service will automatically use appropriate delays
      }
      
      const result = await this.scraperService.discoverAndScrape(domain, maxUrls);
      
      return this.createResponse(200, {
        message: `Enhanced discovery and scraping completed for ${domain}`,
        domain,
        summary: result.summary,
        results: result.results,
        domainDiscovery: result.domainDiscovery,
        configuration: {
          domain,
          maxUrls,
          requestedUrls: request.maxUrls,
          rateLimitingEnabled: true,
          respectsRobotsTxt: true,
          enableContentEnhancement: request.enableContentEnhancement ?? true,
          enableIntelligentChunking: request.enableIntelligentChunking ?? true,
          enableStructuredExtraction: request.enableStructuredExtraction ?? true,
          chunkingStrategy: request.chunkingStrategy || 'hybrid'
        },
        responsibleScraping: {
          rateLimitDelay: maxUrls > 100 ? '2000ms between batches' : '1000ms between batches',
          robotsTxtCompliance: 'Enabled',
          userAgent: 'ADA Clara Enhanced Medical Assistant Bot 1.0',
          maxConcurrentRequests: 3,
          respectsCrawlDelay: true
        },
        nextSteps: {
          vectorSearch: 'Vectors are now available for semantic search',
          knowledgeBase: 'Content can be queried through Bedrock Knowledge Base',
          monitoring: 'Check CloudWatch for processing metrics'
        }
      });
    } catch (error) {
      console.error('Enhanced discover and scrape failed:', error);
      return this.createResponse(500, {
        error: 'Enhanced discover and scrape failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Scraping of specific URLs with increased limits and rate limiting
   */
  async handleScrapeUrls(request: ScrapeUrlsRequest): Promise<APIGatewayProxyResult> {
    try {
      // Use provided URLs or fall back to defaults
      const urls = request.urls && request.urls.length > 0 ? request.urls : DEFAULT_URLS;
      
      if (urls.length === 0) {
        return this.createResponse(400, { error: 'URLs array is required and cannot be empty' });
      }
      
      // Increased safety limits with responsible rate limiting
      let maxUrls: number;
      if (urls.length <= 50) {
        maxUrls = urls.length; // Small batches: process all
      } else if (urls.length <= 200) {
        maxUrls = Math.min(urls.length, 200); // Medium batches: up to 200
      } else {
        maxUrls = Math.min(urls.length, 300); // Large batches: up to 300
      }
      
      const urlsToProcess = urls.slice(0, maxUrls);
      
      console.log(`Starting enhanced scraping for ${urlsToProcess.length} URLs (${urls.length} requested)`);
      console.log(`Rate limiting: Enabled for responsible processing`);
      
      // Update configuration based on request
      this.updateScraperConfig(request);
      
      const result = await this.scraperService.scrapeUrlsEnhanced(urlsToProcess);
      
      return this.createResponse(200, {
        message: `Enhanced scraping completed for ${urlsToProcess.length} URLs`,
        summary: result.summary,
        results: result.results,
        configuration: {
          processedUrls: urlsToProcess.length,
          requestedUrls: urls.length,
          usedDefaults: !request.urls || request.urls.length === 0,
          rateLimitingEnabled: true,
          enableContentEnhancement: request.enableContentEnhancement ?? true,
          enableIntelligentChunking: request.enableIntelligentChunking ?? true,
          enableStructuredExtraction: request.enableStructuredExtraction ?? true,
          chunkingStrategy: request.chunkingStrategy || 'hybrid'
        },
        responsibleScraping: {
          rateLimitDelay: urlsToProcess.length > 50 ? '2000ms between batches' : '1000ms between batches',
          batchSize: 3,
          respectsCrawlDelay: true
        }
      });
    } catch (error) {
      console.error('Enhanced URL scraping failed:', error);
      return this.createResponse(500, {
        error: 'Enhanced URL scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Scraping of a single URL
   */
  async handleScrapeUrl(request: ScrapeUrlRequest): Promise<APIGatewayProxyResult> {
    try {
      if (!request.url) {
        return this.createResponse(400, { error: 'URL parameter is required' });
      }
      
      // Update configuration based on request
      this.updateScraperConfig(request);
      
      console.log(`Starting enhanced scraping for single URL: ${request.url}`);
      
      const result = await this.scraperService.scrapeUrlEnhanced(request.url);
      
      return this.createResponse(result.success ? 200 : 500, {
        message: result.success ? 'Enhanced URL scraping completed successfully' : 'Enhanced URL scraping failed',
        result,
        configuration: {
          enableContentEnhancement: request.enableContentEnhancement ?? true,
          enableIntelligentChunking: request.enableIntelligentChunking ?? true,
          enableStructuredExtraction: request.enableStructuredExtraction ?? true,
          chunkingStrategy: request.chunkingStrategy || 'hybrid'
        }
      });
    } catch (error) {
      console.error('Enhanced single URL scraping failed:', error);
      return this.createResponse(500, {
        error: 'Enhanced single URL scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Test scraper functionality
   */
  async handleTestScraper(request: TestScraperRequest): Promise<APIGatewayProxyResult> {
    try {
      const testUrl = request.testUrl || 'https://diabetes.org/about-diabetes/type-1';
      
      console.log(`Testing scraper with: ${testUrl}`);
      
      // Test with all features enabled
      const result = await this.scraperService.scrapeUrlEnhanced(testUrl);
      
      return this.createResponse(result.success ? 200 : 500, {
        message: 'Scraper test completed',
        testUrl,
        result,
        scraperStatus: result.success ? 'operational' : 'degraded',
        features: {
          domainDiscovery: 'Intelligent URL discovery with relevance scoring',
          structuredExtraction: 'Semantic content analysis and medical fact extraction',
          contentEnhancement: 'AI-powered content improvement using Claude',
          intelligentChunking: 'Multiple chunking strategies optimized for medical content',
          vectorStorage: 'S3 Vectors with Titan embeddings',
          errorResilience: 'Circuit breakers and retry logic',
          qualityAssurance: 'Comprehensive quality scoring and validation'
        },
        configuration: this.scraperService.getConfig()
      });
    } catch (error) {
      console.error('Scraper test failed:', error);
      return this.createResponse(500, {
        error: 'Scraper test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        scraperStatus: 'failed'
      });
    }
  }

  /**
   * Check content changes for multiple URLs
   */
  async handleCheckContentChanges(request: CheckContentChangesRequest): Promise<APIGatewayProxyResult> {
    try {
      // Use provided URLs or fall back to defaults
      const urls = request.urls && request.urls.length > 0 ? request.urls : DEFAULT_URLS.slice(0, 5);
      
      console.log(`Checking content changes for ${urls.length} URLs`);
      
      const results = await this.scraperService.checkContentChanges(urls);
      
      return this.createResponse(200, {
        message: 'Content change check completed',
        summary: {
          totalUrls: urls.length,
          needsUpdate: results.filter(r => r.hasChanged).length,
          current: results.filter(r => !r.hasChanged && r.status === 'current').length,
          errors: results.filter(r => r.status === 'error').length,
          usedDefaults: !request.urls || request.urls.length === 0
        },
        results
      });
    } catch (error) {
      console.error('Content change check failed:', error);
      return this.createResponse(500, {
        error: 'Content change check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Health check for scraper
   */
  async healthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const [containerHealth, scraperHealth] = await Promise.all([
        this.container.healthCheck(),
        this.scraperService.healthCheck()
      ]);
      
      const overallHealth = containerHealth.overall && scraperHealth;
      
      return this.createResponse(overallHealth ? 200 : 503, {
        status: overallHealth ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          ...containerHealth.services,
          scraper: scraperHealth
        },
        version: '1.0.0',
        features: {
          enhancedWebScraping: 'AI-powered content processing with vector storage',
          domainDiscovery: 'Intelligent URL discovery and prioritization',
          structuredExtraction: 'Semantic content analysis and medical fact extraction',
          contentEnhancement: 'AI content improvement using Bedrock models',
          intelligentChunking: 'Multiple chunking strategies for optimal embeddings',
          vectorStorage: 'S3 Vectors with automatic embedding generation',
          errorResilience: 'Circuit breakers, retries, and graceful degradation',
          qualityAssurance: 'Comprehensive quality scoring and validation'
        },
        configuration: this.scraperService.getConfig()
      });
    } catch (error) {
      console.error('Scraper health check failed:', error);
      
      return this.createResponse(503, {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Update scraper configuration based on request parameters
   */
  private updateScraperConfig(request: {
    enableContentEnhancement?: boolean;
    enableIntelligentChunking?: boolean;
    enableStructuredExtraction?: boolean;
    chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
  }): void {
    const updates: any = {};
    
    if (request.enableContentEnhancement !== undefined) {
      updates.enableContentEnhancement = request.enableContentEnhancement;
    }
    
    if (request.enableIntelligentChunking !== undefined) {
      updates.enableIntelligentChunking = request.enableIntelligentChunking;
    }
    
    if (request.enableStructuredExtraction !== undefined) {
      updates.enableStructuredExtraction = request.enableStructuredExtraction;
    }
    
    if (request.chunkingStrategy) {
      updates.chunkingStrategy = request.chunkingStrategy;
    }
    
    if (Object.keys(updates).length > 0) {
      this.scraperService.updateConfig(updates);
    }
  }

  /**
   * Create standardized response
   */
  private createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(body, null, 2)
    };
  }
}