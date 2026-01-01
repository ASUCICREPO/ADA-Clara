import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';

export interface ScrapeUrlsRequest {
  action: 'scrape-urls';
  urls?: string[];
  targetUrls?: string[];
  forceRefresh?: boolean;
}

export interface ScrapeSingleRequest {
  action: 'scrape-single';
  url: string;
}

export interface TestScraperRequest {
  action: 'test-scraper';
  testUrl?: string;
}

export interface CheckContentChangesRequest {
  action: 'check-content-changes';
  urls?: string[];
}

// Default URLs for diabetes.org (from working implementation)
const DEFAULT_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources'
];

/**
 * Web Scraper Controller
 * Handles HTTP requests for web scraping operations
 */
export class WebScraperController {
  constructor(private container: ServiceContainer) {}

  /**
   * Handle scraping multiple URLs
   */
  async handleScrapeUrls(request: ScrapeUrlsRequest): Promise<APIGatewayProxyResult> {
    try {
      const urls = request.urls || request.targetUrls || DEFAULT_URLS;
      const forceRefresh = request.forceRefresh || false;
      
      const result = await this.container.webScrapingService.scrapeUrls(urls, forceRefresh);
      
      return this.createResponse(200, result);
    } catch (error) {
      return this.createResponse(500, {
        error: 'Scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle scraping a single URL
   */
  async handleScrapeSingle(request: ScrapeSingleRequest): Promise<APIGatewayProxyResult> {
    try {
      if (!request.url) {
        return this.createResponse(400, { error: 'URL parameter required' });
      }
      
      const result = await this.container.webScrapingService.scrapeSingleUrl(request.url);
      
      return this.createResponse(result.success ? 200 : 500, {
        message: result.success ? 'URL scraped successfully' : 'Scraping failed',
        result
      });
    } catch (error) {
      return this.createResponse(500, {
        error: 'Single URL scraping failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle test scraper functionality
   */
  async handleTestScraper(request: TestScraperRequest): Promise<APIGatewayProxyResult> {
    try {
      const result = await this.container.webScrapingService.testScraper(request.testUrl);
      
      return this.createResponse(200, result);
    } catch (error) {
      return this.createResponse(500, {
        error: 'Scraper test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle checking content changes for URLs
   */
  async handleCheckContentChanges(request: CheckContentChangesRequest): Promise<APIGatewayProxyResult> {
    try {
      const urls = request.urls || DEFAULT_URLS.slice(0, 3);
      
      const results = await this.container.webScrapingService.checkContentChanges(urls);
      
      return this.createResponse(200, {
        message: 'Content change check completed',
        results
      });
    } catch (error) {
      return this.createResponse(500, {
        error: 'Content change check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const health = await this.container.healthCheck();
      
      return this.createResponse(health.overall ? 200 : 503, {
        status: health.overall ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: health.services,
        version: '2.0.0',
        features: {
          webScraping: 'Content acquisition with change detection',
          contentStorage: 'S3 storage with encryption',
          changeDetection: 'DynamoDB-based content tracking',
          rateLimiting: 'Configurable delays between requests'
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      
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
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(body, null, 2)
    };
  }
}