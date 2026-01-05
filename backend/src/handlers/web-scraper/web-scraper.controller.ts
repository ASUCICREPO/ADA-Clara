/**
 * Web Scraper Controller
 * 
 * Handles HTTP requests for web scraping operations with:
 * - Basic web scraping and content extraction
 * - Simple chunking and S3 Vectors storage
 * - Essential error handling and rate limiting
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../services/container';
import { SimplifiedWebScraperService } from '../../business/web-scraper/simplified-web-scraper.service';

export interface ScrapeUrlsRequest {
  action: 'scrape-urls';
  urls?: string[]; // Made optional - will use defaults if not provided
}

export interface ScrapeUrlRequest {
  action: 'scrape-single';
  url: string;
}

export interface TestScraperRequest {
  action: 'test-scraper';
  testUrl?: string;
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
 * Provides simplified content processing with basic chunking and vector storage
 */
export class WebScraperController {
  private scraperService: SimplifiedWebScraperService;

  constructor(private container: ServiceContainer) {
    // Initialize simplified scraper service with configuration
    this.scraperService = new SimplifiedWebScraperService(
      container.s3Service,
      container.bedrockService,
      container.s3VectorsService,
      container.scrapingService,
      {
        // S3 configuration
        contentBucket: process.env.CONTENT_BUCKET || '',
        vectorsBucket: process.env.VECTORS_BUCKET || '',
        vectorIndex: process.env.VECTOR_INDEX || '',
        embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
        
        // Basic processing settings
        maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE || '1000'),
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
        rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '1000'),
        batchSize: parseInt(process.env.BATCH_SIZE || '3'),
        maxRetries: parseInt(process.env.MAX_RETRIES || '3')
      }
    );
  }

  /**
   * Scraping of specific URLs with simplified processing
   */
  async handleScrapeUrls(request: ScrapeUrlsRequest): Promise<APIGatewayProxyResult> {
    try {
      // Use provided URLs or fall back to defaults
      const urls = request.urls && request.urls.length > 0 ? request.urls : DEFAULT_URLS;
      
      if (urls.length === 0) {
        return this.createResponse(400, { error: 'URLs array is required and cannot be empty' });
      }
      
      console.log(`Starting simplified scraping for ${urls.length} URLs`);
      
      const result = await this.scraperService.scrapeUrls(urls);
      
      return this.createResponse(200, {
        message: `Simplified scraping completed for ${urls.length} URLs`,
        summary: result.summary,
        results: result.results,
        configuration: {
          processedUrls: urls.length,
          usedDefaults: !request.urls || request.urls.length === 0,
          simplifiedProcessing: true
        }
      });
    } catch (error) {
      console.error('Simplified URL scraping failed:', error);
      return this.createResponse(500, {
        error: 'Simplified URL scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Scraping of a single URL with simplified processing
   */
  async handleScrapeUrl(request: ScrapeUrlRequest): Promise<APIGatewayProxyResult> {
    try {
      if (!request.url) {
        return this.createResponse(400, { error: 'URL parameter is required' });
      }
      
      console.log(`Starting simplified scraping for single URL: ${request.url}`);
      
      const result = await this.scraperService.scrapeUrls([request.url]);
      const singleResult = result.results[0];
      
      return this.createResponse(singleResult.success ? 200 : 500, {
        message: singleResult.success ? 'Simplified URL scraping completed successfully' : 'Simplified URL scraping failed',
        result: singleResult,
        configuration: {
          simplifiedProcessing: true
        }
      });
    } catch (error) {
      console.error('Simplified single URL scraping failed:', error);
      return this.createResponse(500, {
        error: 'Simplified single URL scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Test scraper functionality with simplified processing
   */
  async handleTestScraper(request: TestScraperRequest): Promise<APIGatewayProxyResult> {
    try {
      const testUrl = request.testUrl || 'https://diabetes.org/about-diabetes/type-1';
      
      console.log(`Testing simplified scraper with: ${testUrl}`);
      
      const result = await this.scraperService.scrapeUrls([testUrl]);
      const testResult = result.results[0];
      
      return this.createResponse(testResult.success ? 200 : 500, {
        message: 'Simplified scraper test completed',
        testUrl,
        result: testResult,
        scraperStatus: testResult.success ? 'operational' : 'degraded',
        features: {
          basicScraping: 'Simple web content extraction',
          basicChunking: 'Fixed-size chunking with overlap',
          vectorStorage: 'S3 Vectors with Titan embeddings',
          basicErrorHandling: 'Simple retry logic',
          rateLimiting: 'Basic delay between batches'
        },
        configuration: this.scraperService.getConfig()
      });
    } catch (error) {
      console.error('Simplified scraper test failed:', error);
      return this.createResponse(500, {
        error: 'Simplified scraper test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        scraperStatus: 'failed'
      });
    }
  }

  /**
   * Health check for simplified scraper
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
        version: '1.0.0-simplified',
        features: {
          basicWebScraping: 'Simple web content extraction',
          basicChunking: 'Fixed-size chunking with overlap',
          vectorStorage: 'S3 Vectors with automatic embedding generation',
          basicErrorHandling: 'Simple retry logic with exponential backoff',
          rateLimiting: 'Basic delay between batches'
        },
        configuration: this.scraperService.getConfig()
      });
    } catch (error) {
      console.error('Simplified scraper health check failed:', error);
      
      return this.createResponse(503, {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
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