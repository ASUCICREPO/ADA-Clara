import { APIGatewayProxyResult } from 'aws-lambda';
import { ServiceContainer } from '../../core/container';

export interface TestScraperRequest {
  action: 'test-scraper';
}

export interface ManualCrawlRequest {
  action: 'manual-crawl';
  targetUrls?: string[];
}

export interface TestSingleUrlRequest {
  action: 'test-single-url';
  url?: string;
  testUrl?: string;
}

// Default URLs for testing (from working implementation)
const DEFAULT_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources'
];

/**
 * S3 Vectors Controller - Simplified version based on working implementation
 */
export class S3VectorsController {
  constructor(private container: ServiceContainer) {}

  /**
   * Test basic scraper functionality
   */
  async handleTestScraper(): Promise<APIGatewayProxyResult> {
    try {
      const testUrl = 'https://diabetes.org/about-diabetes/type-1';
      const result = await this.container.crawlerService.processUrl(testUrl);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Scraper test completed',
          testUrl,
          result,
          scraperStatus: 'operational'
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Scraper test failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * Handle manual crawl request
   */
  async handleManualCrawl(request: ManualCrawlRequest): Promise<APIGatewayProxyResult> {
    try {
      const urls = request.targetUrls || DEFAULT_URLS;
      const maxUrls = Math.min(urls.length, 5); // Limit for testing
      
      console.log(`Starting manual crawl for ${maxUrls} URLs`);
      
      const { results, summary } = await this.container.crawlerService.processUrls(urls.slice(0, maxUrls));
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Manual crawl completed',
          result: {
            ...summary,
            results
          },
          crawlerFeatures: {
            contentStorage: 'S3 with encryption',
            vectorStorage: 'S3 Vectors GA',
            embeddingModel: 'Titan Embed Text V2',
            chunkingStrategy: 'Sentence-based with 1000 char limit'
          }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Manual crawl failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * Test single URL processing
   */
  async handleTestSingleUrl(request: TestSingleUrlRequest): Promise<APIGatewayProxyResult> {
    try {
      const url = request.url || request.testUrl;
      if (!url) {
        throw new Error('URL parameter required');
      }
      
      console.log(`Testing single URL: ${url}`);
      
      const result = await this.container.crawlerService.processUrl(url);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Single URL test completed',
          url,
          result
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Single URL test failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<APIGatewayProxyResult> {
    try {
      const health = await this.container.healthCheck();
      
      return {
        statusCode: health.overall ? 200 : 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: health.overall ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: health.services,
          version: '2.0.0',
          features: {
            contentProcessing: 'S3 storage with encryption',
            vectorProcessing: 'S3 Vectors with Bedrock embeddings',
            embeddingModel: 'Titan Embed Text V2',
            chunkingStrategy: 'Sentence-based with 1000 char limit',
            searchCapabilities: 'Semantic search with metadata filtering'
          }
        })
      };
    } catch (error) {
      console.error('Health check failed:', error);
      
      return {
        statusCode: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      };
    }
  }
}