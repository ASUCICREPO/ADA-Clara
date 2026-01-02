/**
 * Enhanced Web Scraper Controller
 * 
 * Handles HTTP requests for enhanced web scraping operations with:
 * - Domain discovery and intelligent URL prioritization
 * - Structured content extraction and AI enhancement
 * - Intelligent chunking and S3 Vectors storage
 * - Comprehensive error handling and monitoring
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';
import { EnhancedWebScraperService } from '../../business/enhanced-web-scraper/enhanced-web-scraper.service';

export interface EnhancedDiscoverAndScrapeRequest {
  action: 'enhanced-discover-scrape';
  domain?: string;
  maxUrls?: number;
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface EnhancedScrapeUrlsRequest {
  action: 'enhanced-scrape-urls';
  urls: string[];
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface EnhancedScrapeUrlRequest {
  action: 'enhanced-scrape-url';
  url: string;
  enableContentEnhancement?: boolean;
  enableIntelligentChunking?: boolean;
  enableStructuredExtraction?: boolean;
  chunkingStrategy?: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
}

export interface TestEnhancedScraperRequest {
  action: 'test-enhanced-scraper';
  testUrl?: string;
}

/**
 * Enhanced Web Scraper Controller
 * Provides comprehensive content processing with AI enhancement and vector storage
 */
export class EnhancedWebScraperController {
  private enhancedScraperService: EnhancedWebScraperService;

  constructor(private container: ServiceContainer) {
    // Initialize enhanced scraper service with configuration
    this.enhancedScraperService = new EnhancedWebScraperService(
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
        maxContentAgeHours: 24,
        forceRefresh: false,
        
        // Quality and performance settings
        qualityThreshold: 0.7,
        maxRetries: 3,
        batchSize: 3
      }
    );
  }

  /**
   * Enhanced domain discovery and scraping with full AI pipeline
   */
  async handleEnhancedDiscoverAndScrape(request: EnhancedDiscoverAndScrapeRequest): Promise<APIGatewayProxyResult> {
    try {
      const domain = request.domain || 'diabetes.org';
      const maxUrls = Math.min(request.maxUrls || 10, 20); // Limit for safety
      
      // Update configuration based on request
      this.updateScraperConfig(request);
      
      console.log(`Starting enhanced discover and scrape for ${domain}, maxUrls: ${maxUrls}`);
      
      const result = await this.enhancedScraperService.discoverAndScrape(domain, maxUrls);
      
      return this.createResponse(200, {
        message: `Enhanced discovery and scraping completed for ${domain}`,
        domain,
        summary: result.summary,
        results: result.results,
        domainDiscovery: result.domainDiscovery,
        configuration: {
          domain,
          maxUrls,
          enableContentEnhancement: request.enableContentEnhancement ?? true,
          enableIntelligentChunking: request.enableIntelligentChunking ?? true,
          enableStructuredExtraction: request.enableStructuredExtraction ?? true,
          chunkingStrategy: request.chunkingStrategy || 'hybrid'
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
   * Enhanced scraping of specific URLs
   */
  async handleEnhancedScrapeUrls(request: EnhancedScrapeUrlsRequest): Promise<APIGatewayProxyResult> {
    try {
      if (!request.urls || request.urls.length === 0) {
        return this.createResponse(400, { error: 'URLs array is required and cannot be empty' });
      }
      
      const maxUrls = Math.min(request.urls.length, 15); // Safety limit
      const urlsToProcess = request.urls.slice(0, maxUrls);
      
      // Update configuration based on request
      this.updateScraperConfig(request);
      
      console.log(`Starting enhanced scraping for ${urlsToProcess.length} URLs`);
      
      const result = await this.enhancedScraperService.scrapeUrlsEnhanced(urlsToProcess);
      
      return this.createResponse(200, {
        message: `Enhanced scraping completed for ${urlsToProcess.length} URLs`,
        summary: result.summary,
        results: result.results,
        configuration: {
          enableContentEnhancement: request.enableContentEnhancement ?? true,
          enableIntelligentChunking: request.enableIntelligentChunking ?? true,
          enableStructuredExtraction: request.enableStructuredExtraction ?? true,
          chunkingStrategy: request.chunkingStrategy || 'hybrid'
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
   * Enhanced scraping of a single URL
   */
  async handleEnhancedScrapeUrl(request: EnhancedScrapeUrlRequest): Promise<APIGatewayProxyResult> {
    try {
      if (!request.url) {
        return this.createResponse(400, { error: 'URL parameter is required' });
      }
      
      // Update configuration based on request
      this.updateScraperConfig(request);
      
      console.log(`Starting enhanced scraping for single URL: ${request.url}`);
      
      const result = await this.enhancedScraperService.scrapeUrlEnhanced(request.url);
      
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
   * Test enhanced scraper functionality
   */
  async handleTestEnhancedScraper(request: TestEnhancedScraperRequest): Promise<APIGatewayProxyResult> {
    try {
      const testUrl = request.testUrl || 'https://diabetes.org/about-diabetes/type-1';
      
      console.log(`Testing enhanced scraper with: ${testUrl}`);
      
      // Test with all features enabled
      const result = await this.enhancedScraperService.scrapeUrlEnhanced(testUrl);
      
      return this.createResponse(result.success ? 200 : 500, {
        message: 'Enhanced scraper test completed',
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
        configuration: this.enhancedScraperService.getConfig()
      });
    } catch (error) {
      console.error('Enhanced scraper test failed:', error);
      return this.createResponse(500, {
        error: 'Enhanced scraper test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        scraperStatus: 'failed'
      });
    }
  }

  /**
   * Health check for enhanced scraper
   */
  async healthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const [containerHealth, enhancedScraperHealth] = await Promise.all([
        this.container.healthCheck(),
        this.enhancedScraperService.healthCheck()
      ]);
      
      const overallHealth = containerHealth.overall && enhancedScraperHealth;
      
      return this.createResponse(overallHealth ? 200 : 503, {
        status: overallHealth ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          ...containerHealth.services,
          enhancedScraper: enhancedScraperHealth
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
        configuration: this.enhancedScraperService.getConfig()
      });
    } catch (error) {
      console.error('Enhanced scraper health check failed:', error);
      
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
      this.enhancedScraperService.updateConfig(updates);
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