import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';
import { DomainDiscoveryService, DiscoveredUrl } from '../../services/domain-discovery-service';
import { DiscoveryOptions, MEDICAL_DOMAIN_CONFIGS } from '../../types/domain-discovery.types';

export interface DiscoverDomainRequest {
  action: 'discover-domain';
  domain?: string;
  maxUrls?: number;
  maxDepth?: number;
  relevanceThreshold?: number;
}

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
 * Handles HTTP requests for web scraping operations with enhanced domain discovery
 */
export class WebScraperController {
  private domainDiscoveryService: DomainDiscoveryService;

  constructor(private container: ServiceContainer) {
    this.domainDiscoveryService = new DomainDiscoveryService();
  }

  /**
   * Handle domain discovery for systematic URL discovery
   */
  async handleDiscoverDomain(request: DiscoverDomainRequest): Promise<APIGatewayProxyResult> {
    try {
      const domain = request.domain || 'diabetes.org';
      
      // Use default comprehensive options for all domains
      const domainConfig = MEDICAL_DOMAIN_CONFIGS.COMPREHENSIVE_DISCOVERY_OPTIONS;

      const options: DiscoveryOptions = {
        maxDepth: request.maxDepth || domainConfig.maxDepth,
        maxUrls: request.maxUrls || 50,
        respectRobotsTxt: domainConfig.respectRobotsTxt,
        includeExternalLinks: false,
        relevanceThreshold: request.relevanceThreshold || domainConfig.relevanceThreshold,
        allowedPathPatterns: domainConfig.allowedPathPatterns,
        blockedPathPatterns: domainConfig.blockedPathPatterns,
        medicalKeywords: domainConfig.medicalKeywords,
        rateLimitDelay: domainConfig.rateLimitDelay
      };

      console.log(`Starting domain discovery for ${domain} with options:`, options);
      
      const discoveredUrls = await this.domainDiscoveryService.discoverDomainUrls(domain, options);
      
      return this.createResponse(200, {
        message: `Domain discovery completed for ${domain}`,
        domain,
        totalUrls: discoveredUrls.totalUrls,
        urls: discoveredUrls.urls,
        options,
        nextSteps: {
          scraping: `Use 'scrape-urls' action with discovered URLs`,
          filtering: `URLs filtered by relevance threshold: ${options.relevanceThreshold}`
        }
      });
    } catch (error) {
      console.error('Domain discovery failed:', error);
      return this.createResponse(500, {
        error: 'Domain discovery failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

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