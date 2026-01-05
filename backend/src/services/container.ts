import { DynamoDBService } from '../services/dynamodb-service';
import { BedrockService } from '../services/bedrock.service';
import { ComprehendService } from '../services/comprehend.service';
import { S3Service } from '../services/s3-service';
import { S3VectorsService } from '../services/s3-vectors.service';
import { ScrapingService } from '../services/scraping.service';
import { WebScraperService } from '../business/web-scraper/web-scraper.service';
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
  public readonly webScraperService: WebScraperService;
  
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
    this.webScraperService = new WebScraperService(
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
      webScraper: boolean;
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
      webScraperHealth,
      ragHealth
    ] = await Promise.allSettled([
      this.dynamoService.healthCheck(),
      this.bedrockService.healthCheck(),
      this.comprehendService.healthCheck(),
      this.s3Service.healthCheck(),
      this.s3VectorsService.healthCheck(),
      this.scrapingService.healthCheck(),
      this.webScraperService.healthCheck(),
      this.ragServiceInstance?.healthCheck() || Promise.resolve(true) // RAG service if available
    ]);

    const services = {
      dynamodb: dynamoHealth.status === 'fulfilled' && dynamoHealth.value,
      bedrock: bedrockHealth.status === 'fulfilled' && bedrockHealth.value,
      comprehend: comprehendHealth.status === 'fulfilled' && comprehendHealth.value,
      s3: s3Health.status === 'fulfilled' && s3Health.value && s3Health.value.contentBucket,
      s3Vectors: s3VectorsHealth.status === 'fulfilled' && s3VectorsHealth.value,
      scraping: scrapingHealth.status === 'fulfilled' && scrapingHealth.value,
      webScraper: webScraperHealth.status === 'fulfilled' && webScraperHealth.value,
      ...(this.ragServiceInstance && { rag: ragHealth.status === 'fulfilled' && ragHealth.value })
    };

    return {
      overall: Object.values(services).every(status => status),
      services
    };
  }
}