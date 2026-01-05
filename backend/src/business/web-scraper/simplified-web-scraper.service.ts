/**
 * Simplified Web Scraper Service
 * 
 * Focuses on essential functionality only:
 * - Basic web scraping
 * - Simple content chunking
 * - S3 Vectors storage with embeddings
 * - Basic error handling
 * - Simple rate limiting
 */

import { S3Service } from '../../services/s3-service';
import { BedrockService } from '../../services/bedrock.service';
import { S3VectorsService } from '../../services/s3-vectors.service';
import { ScrapingService, ScrapedContent } from '../../services/scraping.service';

export interface SimplifiedScrapingConfig {
  // S3 configuration
  contentBucket: string;
  vectorsBucket: string;
  vectorIndex: string;
  embeddingModel: string;
  
  // Basic processing settings
  maxChunkSize: number;
  chunkOverlap: number;
  rateLimitDelay: number;
  batchSize: number;
  maxRetries: number;
}

export interface SimplifiedScrapingResult {
  url: string;
  success: boolean;
  title?: string;
  contentKey?: string;
  chunksCreated?: number;
  vectorsStored?: number;
  processingTime: number;
  error?: string;
}

export interface BatchSimplifiedScrapingResult {
  message: string;
  summary: {
    totalUrls: number;
    successful: number;
    failed: number;
    totalChunksCreated: number;
    totalVectorsStored: number;
    averageProcessingTime: number;
    successRate: string;
  };
  results: SimplifiedScrapingResult[];
}

/**
 * Simplified Web Scraper Service
 * Essential functionality only - no complex AI processing or quality scoring
 */
export class SimplifiedWebScraperService {
  constructor(
    private s3Service: S3Service,
    private bedrockService: BedrockService,
    private s3VectorsService: S3VectorsService,
    private scrapingService: ScrapingService,
    private config: SimplifiedScrapingConfig
  ) {}

  /**
   * Scrape multiple URLs with basic processing
   */
  async scrapeUrls(urls: string[]): Promise<BatchSimplifiedScrapingResult> {
    const startTime = Date.now();
    const results: SimplifiedScrapingResult[] = [];
    
    let totalChunksCreated = 0;
    let totalVectorsStored = 0;
    let totalProcessingTime = 0;
    let successCount = 0;

    console.log(`Starting simplified scraping for ${urls.length} URLs`);

    // Process URLs in batches with simple rate limiting
    for (let i = 0; i < urls.length; i += this.config.batchSize) {
      const batch = urls.slice(i, i + this.config.batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(url => this.scrapeUrlWithRetry(url));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          
          if (result.value.success) {
            successCount++;
            totalChunksCreated += result.value.chunksCreated || 0;
            totalVectorsStored += result.value.vectorsStored || 0;
            totalProcessingTime += result.value.processingTime;
          }
        } else {
          // Handle rejected promises
          const failedUrl = batch[batchResults.indexOf(result)];
          results.push({
            url: failedUrl,
            success: false,
            error: result.reason?.message || 'Unknown error',
            processingTime: 0
          });
        }
      }

      // Simple rate limiting between batches
      if (i + this.config.batchSize < urls.length) {
        console.log(`Rate limiting: ${this.config.rateLimitDelay}ms delay between batches`);
        await this.sleep(this.config.rateLimitDelay);
      }
    }

    const averageProcessingTime = successCount > 0 ? totalProcessingTime / successCount : 0;

    return {
      message: 'Simplified scraping completed',
      summary: {
        totalUrls: urls.length,
        successful: successCount,
        failed: urls.length - successCount,
        totalChunksCreated,
        totalVectorsStored,
        averageProcessingTime,
        successRate: ((successCount / urls.length) * 100).toFixed(1) + '%'
      },
      results
    };
  }

  /**
   * Scrape single URL with basic retry logic
   */
  private async scrapeUrlWithRetry(url: string): Promise<SimplifiedScrapingResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.scrapeUrl(url);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.log(`Attempt ${attempt}/${this.config.maxRetries} failed for ${url}: ${lastError.message}`);
        
        if (attempt < this.config.maxRetries) {
          // Simple exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.sleep(delay);
        }
      }
    }
    
    return {
      url,
      success: false,
      error: lastError?.message || 'Max retries exceeded',
      processingTime: 0
    };
  }

  /**
   * Scrape single URL with basic processing pipeline
   */
  private async scrapeUrl(url: string): Promise<SimplifiedScrapingResult> {
    const startTime = Date.now();

    try {
      console.log(`Processing URL: ${url}`);

      // Step 1: Scrape content
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      if (!scrapingResult.success || !scrapingResult.data) {
        throw new Error(`Scraping failed: ${scrapingResult.error}`);
      }

      const scrapedData = scrapingResult.data;

      // Step 2: Basic text extraction
      const cleanText = this.extractCleanText(scrapedData.content);
      if (cleanText.length < 100) {
        throw new Error('Content too short after cleaning');
      }

      // Step 3: Basic chunking
      const chunks = this.createBasicChunks(cleanText, url, scrapedData.title);
      console.log(`Created ${chunks.length} chunks for ${url}`);

      // Step 4: Generate embeddings and store vectors
      const vectorsStored = await this.storeVectors(chunks);
      console.log(`Stored ${vectorsStored} vectors for ${url}`);

      // Step 5: Store simple text content in S3
      const contentKey = await this.storeSimpleTextContent(scrapedData, cleanText);

      const processingTime = Date.now() - startTime;

      return {
        url,
        success: true,
        title: scrapedData.title,
        contentKey,
        chunksCreated: chunks.length,
        vectorsStored,
        processingTime
      };

    } catch (error) {
      console.error(`Processing failed for ${url}:`, error);
      
      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Basic text extraction - remove HTML and clean up
   */
  private extractCleanText(htmlContent: string): string {
    // Remove HTML tags
    let text = htmlContent.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Remove common navigation/footer text patterns
    const unwantedPatterns = [
      /skip to main content/gi,
      /copyright \d{4}/gi,
      /all rights reserved/gi,
      /privacy policy/gi,
      /terms of use/gi,
      /cookie policy/gi
    ];
    
    for (const pattern of unwantedPatterns) {
      text = text.replace(pattern, '');
    }
    
    return text.trim();
  }

  /**
   * Create basic chunks with simple overlap
   */
  private createBasicChunks(text: string, url: string, title: string): Array<{
    id: string;
    content: string;
    metadata: any;
  }> {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const sentence of sentences) {
      const sentenceText = sentence.trim() + '.';
      
      // Check if adding this sentence would exceed chunk size
      if (currentChunk.length + sentenceText.length > this.config.maxChunkSize && currentChunk.length > 0) {
        // Create chunk
        chunks.push({
          id: `${this.urlToKey(url)}-chunk-${chunkIndex.toString().padStart(3, '0')}`,
          content: currentChunk.trim(),
          metadata: {
            sourceUrl: url,
            sourceTitle: title,
            chunkIndex: chunkIndex,
            totalChunks: 0, // Will be updated later
            lastUpdated: new Date().toISOString()
          }
        });
        
        // Start new chunk with overlap
        const overlapWords = currentChunk.split(' ').slice(-this.config.chunkOverlap);
        currentChunk = overlapWords.join(' ') + ' ' + sentenceText;
        chunkIndex++;
      } else {
        currentChunk += ' ' + sentenceText;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${this.urlToKey(url)}-chunk-${chunkIndex.toString().padStart(3, '0')}`,
        content: currentChunk.trim(),
        metadata: {
          sourceUrl: url,
          sourceTitle: title,
          chunkIndex: chunkIndex,
          totalChunks: 0, // Will be updated below
          lastUpdated: new Date().toISOString()
        }
      });
    }
    
    // Update totalChunks for all chunks
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });
    
    return chunks;
  }

  /**
   * Store vectors in S3 Vectors
   */
  private async storeVectors(chunks: Array<{ id: string; content: string; metadata: any }>): Promise<number> {
    let storedCount = 0;

    try {
      // Process chunks in small batches for embedding generation
      const EMBEDDING_BATCH_SIZE = 3;
      
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        
        // Generate embeddings for batch
        const embeddingPromises = batch.map(chunk => 
          this.bedrockService.generateEmbedding(chunk.content, this.config.embeddingModel)
        );
        
        const embeddings = await Promise.all(embeddingPromises);
        
        // Store vectors in S3 Vectors
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          
          if (embedding && embedding.embedding.length > 0) {
            await this.s3VectorsService.putVectors(
              this.config.vectorsBucket,
              this.config.vectorIndex,
              [{
                key: chunk.id,
                vector: embedding.embedding,
                metadata: {
                  content: chunk.content, // Required for Bedrock KB
                  sourceUrl: chunk.metadata.sourceUrl,
                  sourceTitle: chunk.metadata.sourceTitle,
                  chunkIndex: chunk.metadata.chunkIndex.toString(),
                  totalChunks: chunk.metadata.totalChunks.toString(),
                  lastUpdated: chunk.metadata.lastUpdated
                }
              }]
            );
            
            storedCount++;
          }
        }
        
        // Small delay between embedding batches
        if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
          await this.sleep(200);
        }
      }

    } catch (error) {
      console.error(`Failed to store vectors:`, error);
      throw error;
    }

    return storedCount;
  }

  /**
   * Store simple text content in S3 (just the scraped text, no metadata)
   */
  private async storeSimpleTextContent(
    scrapedData: ScrapedContent, 
    cleanText: string
  ): Promise<string> {
    const key = `simple-content/${this.urlToKey(scrapedData.url)}.txt`;
    
    // Store just the clean text content - no metadata headers
    await this.s3Service.putObject(this.config.contentBucket, {
      key: key,
      body: cleanText,
      contentType: 'text/plain',
      metadata: {
        url: scrapedData.url,
        title: scrapedData.title.substring(0, 100),
        processedAt: new Date().toISOString()
      }
    });

    return key;
  }

  /*
  // COMMENTED OUT: Complex JSON storage - keeping for reference
  private async storeContent(
    scrapedData: ScrapedContent, 
    cleanText: string, 
    chunks: Array<{ id: string; content: string; metadata: any }>
  ): Promise<string> {
    const key = `simplified-content/${this.urlToKey(scrapedData.url)}.json`;
    
    const contentData = {
      url: scrapedData.url,
      title: scrapedData.title,
      originalContent: scrapedData.content,
      cleanText: cleanText,
      contentLength: scrapedData.contentLength,
      scrapedAt: scrapedData.scrapedAt,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata
      })),
      processedAt: new Date().toISOString(),
      version: '1.0-simplified',
      source: 'simplified-web-scraper'
    };

    await this.s3Service.putJsonObject(this.config.contentBucket, key, contentData, {
      url: scrapedData.url,
      title: scrapedData.title.substring(0, 100),
      processedAt: contentData.processedAt,
      chunksCount: chunks.length.toString()
    });

    return key;
  }
  */

  /**
   * Convert URL to safe key for storage
   */
  private urlToKey(url: string): string {
    return url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const healthChecks = await Promise.allSettled([
        this.s3Service.healthCheck(),
        this.s3VectorsService.healthCheck(),
        this.bedrockService.healthCheck(),
        this.scrapingService.healthCheck()
      ]);

      return healthChecks.every(result => 
        result.status === 'fulfilled' && result.value
      );
    } catch (error) {
      console.error('Simplified web scraper health check failed:', error);
      return false;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): SimplifiedScrapingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SimplifiedScrapingConfig>): void {
    Object.assign(this.config, updates);
  }
}