import { S3Service } from '../../core/services/s3.service';
import { BedrockService } from '../../core/services/bedrock.service';
import { S3VectorsService } from '../../core/services/s3-vectors.service';
import { ScrapingService } from '../../core/services/scraping.service';

export interface CrawlerConfig {
  contentBucket: string;
  vectorsBucket: string;
  vectorIndex: string;
  embeddingModel?: string;
  chunkSize?: number;
  maxPages?: number;
}

export interface CrawlResult {
  url: string;
  title: string;
  contentLength: number;
  contentKey: string;
  chunks: number;
  vectors: number;
  success: boolean;
  error?: string;
}

/**
 * Simplified Crawler Service based on proven working implementation
 */
export class CrawlerService {
  private config: Required<CrawlerConfig>;

  constructor(
    private s3Service: S3Service,
    private bedrockService: BedrockService,
    private s3VectorsService: S3VectorsService,
    private scrapingService: ScrapingService,
    config: CrawlerConfig
  ) {
    this.config = {
      contentBucket: config.contentBucket,
      vectorsBucket: config.vectorsBucket,
      vectorIndex: config.vectorIndex,
      embeddingModel: config.embeddingModel || 'amazon.titan-embed-text-v2:0',
      chunkSize: config.chunkSize || 1000,
      maxPages: config.maxPages || 5
    };
  }

  /**
   * Process a single URL using proven working logic
   */
  async processUrl(url: string): Promise<CrawlResult> {
    console.log(`Processing: ${url}`);
    
    try {
      // Step 1: Scrape content (using existing working logic)
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      if (!scrapingResult.success || !scrapingResult.data) {
        throw new Error(`Scraping failed: ${scrapingResult.error}`);
      }

      const scrapedData = scrapingResult.data;
      
      if (scrapedData.contentLength < 100) {
        throw new Error('Content too short');
      }

      // Step 2: Store raw content in S3
      const contentKey = await this.storeContent(scrapedData);

      // Step 3: Chunk content (using proven working logic)
      const chunks = this.chunkContent(scrapedData.content, scrapedData.title, url);
      console.log(`Created ${chunks.length} chunks`);

      // Step 4: Generate embeddings and store vectors
      const vectorCount = await this.storeVectors(chunks);

      return {
        url,
        title: scrapedData.title,
        contentLength: scrapedData.contentLength,
        contentKey,
        chunks: chunks.length,
        vectors: vectorCount,
        success: true
      };
    } catch (error) {
      console.error(`Failed to process ${url}:`, error);
      return {
        url,
        title: '',
        contentLength: 0,
        contentKey: '',
        chunks: 0,
        vectors: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process multiple URLs
   */
  async processUrls(urls: string[]): Promise<{
    results: CrawlResult[];
    summary: {
      totalUrls: number;
      successCount: number;
      failureCount: number;
      successRate: number;
    };
  }> {
    console.log(`Starting scraper for ${urls.length} URLs`);
    
    const results: CrawlResult[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (const url of urls.slice(0, this.config.maxPages)) {
      const result = await this.processUrl(url);
      results.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
      
      // Rate limiting between URLs
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return {
      results,
      summary: {
        totalUrls: urls.length,
        successCount,
        failureCount,
        successRate: (successCount / results.length) * 100
      }
    };
  }

  /**
   * Store content in S3 (from working implementation)
   */
  private async storeContent(scrapedData: any): Promise<string> {
    const key = `diabetes-content/${this.urlToKey(scrapedData.url)}.json`;
    
    const contentData = {
      ...scrapedData,
      contentHash: require('crypto').createHash('sha256').update(scrapedData.content).digest('hex'),
      storedAt: new Date().toISOString()
    };

    await this.s3Service.putJsonObject(this.config.contentBucket, key, contentData, {
      url: scrapedData.url,
      title: scrapedData.title,
      scrapedAt: scrapedData.scrapedAt
    });

    console.log(`Content stored: ${key}`);
    return key;
  }

  /**
   * Chunk content (from working implementation)
   */
  private chunkContent(content: string, title: string, url: string): any[] {
    const chunks = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.config.chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${this.urlToKey(url)}-chunk-${chunkIndex.toString().padStart(3, '0')}`,
          content: currentChunk.trim(),
          metadata: {
            url,
            title,
            chunkIndex: chunkIndex.toString(),
            source: 'diabetes.org',
            contentType: 'article'
          }
        });
        currentChunk = '';
        chunkIndex++;
      }
      currentChunk += sentence + '. ';
    }
    
    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${this.urlToKey(url)}-chunk-${chunkIndex.toString().padStart(3, '0')}`,
        content: currentChunk.trim(),
        metadata: {
          url,
          title,
          chunkIndex: chunkIndex.toString(),
          source: 'diabetes.org',
          contentType: 'article'
        }
      });
    }
    
    return chunks;
  }

  /**
   * Store vectors (from working implementation)
   */
  private async storeVectors(chunks: any[]): Promise<number> {
    const vectors = [];
    
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    
    for (const chunk of chunks) {
      try {
        const embeddingResponse = await this.bedrockService.generateEmbedding(
          chunk.content,
          this.config.embeddingModel
        );
        
        // Extract the actual embedding array from the response
        const embedding = embeddingResponse.embedding;
        
        vectors.push({
          key: chunk.id,
          vector: embedding,
          metadata: chunk.metadata
        });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to generate embedding for chunk ${chunk.id}:`, error);
      }
    }
    
    if (vectors.length === 0) {
      throw new Error('No vectors generated');
    }
    
    console.log(`Storing ${vectors.length} vectors in S3 Vectors...`);
    
    return await this.s3VectorsService.putVectors(
      this.config.vectorsBucket,
      this.config.vectorIndex,
      vectors
    );
  }

  /**
   * Utility function to convert URL to safe key
   */
  private urlToKey(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Get configuration
   */
  getConfig(): CrawlerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CrawlerConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.s3VectorsService.healthCheck();
    } catch (error) {
      return false;
    }
  }
}