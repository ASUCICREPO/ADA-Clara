import { DynamoDBService } from './services/dynamodb.service';
import { BedrockService } from './services/bedrock.service';
import { ComprehendService } from './services/comprehend.service';
import { S3Service } from './services/s3.service';
import { S3VectorsService } from './services/s3-vectors.service';
import { ScrapingService } from './services/scraping.service';
import { CrawlerService } from '../business/crawler/crawler.service';
import { WebScrapingService } from '../business/web-scraper/web-scraping.service';
import { EnhancedWebScraperService } from '../business/enhanced-web-scraper/enhanced-web-scraper.service';
import { RAGService, RAGConfig } from '../business/rag/rag.service';

export interface ServiceConfig {
  region?: string;
  dynamoEndpoint?: string;
  bedrockModelId?: string;
  // S3 Vectors configuration
  contentBucket?: string;
  vectorsBucket?: string;
  vectorIndex?: string;
  embeddingModel?: string;
  // Web scraper configuration
  contentTrackingTable?: string;
  targetDomain?: string;
  maxPages?: number;
  rateLimitDelay?: number;
  allowedPaths?: string[];
  blockedPaths?: string[];
}

/**
 * Service Container for Dependency Injection
 * Provides centralized access to all core services and business services
 */
export class ServiceContainer {
  private static instance: ServiceContainer;
  
  // Core infrastructure services
  public readonly dynamoService: DynamoDBService;
  public readonly bedrockService: BedrockService;
  public readonly comprehendService: ComprehendService;
  public readonly s3Service: S3Service;
  public readonly s3VectorsService: S3VectorsService;
  public readonly scrapingService: ScrapingService;
  
  // Business services
  public readonly crawlerService: CrawlerService;
  public readonly webScrapingService: WebScrapingService;
  public readonly enhancedWebScraperService: EnhancedWebScraperService;
  
  // RAG service factory method (created on demand)
  private ragServiceInstance?: RAGService;
  
  private constructor(config: ServiceConfig = {}) {
    // Initialize core infrastructure services
    this.dynamoService = new DynamoDBService({
      region: config.region,
      endpoint: config.dynamoEndpoint
    });
    
    this.bedrockService = new BedrockService({
      region: config.region,
      modelId: config.bedrockModelId
    });
    
    this.comprehendService = new ComprehendService({
      region: config.region
    });
    
    this.s3Service = new S3Service({
      region: config.region
    });
    
    this.s3VectorsService = new S3VectorsService();
    
    this.scrapingService = new ScrapingService({
      timeout: 30000,
      userAgent: 'ADA Clara Crawler/2.0',
      maxRetries: 3
    });
    
    // Initialize business services with dependencies
    this.crawlerService = new CrawlerService(
      this.s3Service,
      this.bedrockService,
      this.s3VectorsService,
      this.scrapingService,
      {
        contentBucket: config.contentBucket || process.env.CONTENT_BUCKET || '',
        vectorsBucket: config.vectorsBucket || process.env.VECTORS_BUCKET || '',
        vectorIndex: config.vectorIndex || process.env.VECTOR_INDEX || '',
        embeddingModel: config.embeddingModel || 'amazon.titan-embed-text-v2:0',
        chunkSize: 1000,
        maxPages: config.maxPages || 5
      }
    );

    this.webScrapingService = new WebScrapingService(
      this.s3Service,
      this.dynamoService,
      this.scrapingService,
      {
        contentBucket: config.contentBucket || process.env.CONTENT_BUCKET || '',
        contentTrackingTable: config.contentTrackingTable || process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking',
        targetDomain: config.targetDomain || process.env.TARGET_DOMAIN || 'diabetes.org',
        maxPages: config.maxPages || parseInt(process.env.MAX_PAGES || '10'),
        rateLimitDelay: config.rateLimitDelay || parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
        allowedPaths: config.allowedPaths || ['/about-diabetes', '/living-with-diabetes', '/tools-and-resources', '/community', '/professionals'],
        blockedPaths: config.blockedPaths || ['/admin', '/login', '/api/internal', '/private']
      }
    );

    this.enhancedWebScraperService = new EnhancedWebScraperService(
      this.s3Service,
      this.bedrockService,
      this.s3VectorsService,
      this.scrapingService,
      {
        // S3 Vectors configuration
        contentBucket: config.contentBucket || process.env.CONTENT_BUCKET || '',
        vectorsBucket: config.vectorsBucket || process.env.VECTORS_BUCKET || '',
        vectorIndex: config.vectorIndex || process.env.VECTOR_INDEX || '',
        embeddingModel: config.embeddingModel || 'amazon.titan-embed-text-v2:0',
        
        // Domain and scraping configuration
        targetDomain: config.targetDomain || process.env.TARGET_DOMAIN || 'diabetes.org',
        maxPages: config.maxPages || parseInt(process.env.MAX_PAGES || '10'),
        rateLimitDelay: config.rateLimitDelay || parseInt(process.env.RATE_LIMIT_DELAY || '2000'),
        
        // Enhanced processing configuration
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
   * Get singleton instance of service container
   */
  public static getInstance(config?: ServiceConfig): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer(config);
    }
    return ServiceContainer.instance;
  }

  /**
   * Create RAG service with configuration
   */
  createRAGService(config: RAGConfig): RAGService {
    if (!this.ragServiceInstance) {
      this.ragServiceInstance = new RAGService(
        this.bedrockService,
        config
      );
    }
    return this.ragServiceInstance;
  }

  /**
   * Reset instance (useful for testing)
   */
  public static reset(): void {
    ServiceContainer.instance = null as any;
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{
    overall: boolean;
    services: {
      dynamodb: boolean;
      bedrock: boolean;
      comprehend: boolean;
      s3: boolean;
      s3Vectors: boolean;
      scraping: boolean;
      crawler: boolean;
      webScraper: boolean;
      enhancedWebScraper: boolean;
      rag?: boolean;
    };
  }> {
    const [
      dynamoHealth, 
      bedrockHealth, 
      comprehendHealth,
      s3Health,
      s3VectorsHealth,
      scrapingHealth,
      crawlerHealth,
      webScraperHealth,
      enhancedWebScraperHealth,
      ragHealth
    ] = await Promise.allSettled([
      this.dynamoService.healthCheck(process.env.SESSIONS_TABLE || 'ada-clara-sessions'),
      this.bedrockService.healthCheck(),
      this.comprehendService.healthCheck(),
      this.s3Service.healthCheck(process.env.CONTENT_BUCKET || 'test-bucket'),
      this.s3VectorsService.healthCheck(),
      this.scrapingService.healthCheck(),
      this.crawlerService.healthCheck(),
      Promise.resolve(true), // WebScrapingService doesn't have async health check
      this.enhancedWebScraperService.healthCheck(),
      this.ragServiceInstance?.healthCheck() || Promise.resolve(true) // RAG service if available
    ]);

    const services = {
      dynamodb: dynamoHealth.status === 'fulfilled' && dynamoHealth.value,
      bedrock: bedrockHealth.status === 'fulfilled' && bedrockHealth.value,
      comprehend: comprehendHealth.status === 'fulfilled' && comprehendHealth.value,
      s3: s3Health.status === 'fulfilled' && s3Health.value,
      s3Vectors: s3VectorsHealth.status === 'fulfilled' && s3VectorsHealth.value,
      scraping: scrapingHealth.status === 'fulfilled' && scrapingHealth.value,
      crawler: crawlerHealth.status === 'fulfilled' && crawlerHealth.value,
      webScraper: webScraperHealth.status === 'fulfilled' && webScraperHealth.value,
      enhancedWebScraper: enhancedWebScraperHealth.status === 'fulfilled' && enhancedWebScraperHealth.value,
      ...(this.ragServiceInstance && { rag: ragHealth.status === 'fulfilled' && ragHealth.value })
    };

    return {
      overall: Object.values(services).every(status => status),
      services
    };
  }
}