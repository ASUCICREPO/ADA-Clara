/**
 * Web Scraper Service
 * 
 * Integrates all enhanced services for comprehensive content processing:
 * - Domain Discovery for intelligent URL discovery
 * - Structured Content Extraction for semantic understanding
 * - Content Enhancement using AI for medical accuracy
 * - Intelligent Chunking with multiple strategies
 * - S3 Vectors integration for embedding storage
 */

import { DomainDiscoveryService } from '../../services/domain-discovery-service';
import { StructuredContentExtractorService } from '../../services/structured-content-extractor-service';
import { ContentEnhancementService } from '../../services/content-enhancement.service';
import { IntelligentChunkingService } from '../../services/intelligent-chunking-service';
import { ErrorResilienceService } from '../../services/error-resilience-service';
import { HtmlProcessingService, CleanedHtmlResult } from '../../services/html-processing-service';
import { ContentDetectionService } from '../../services/content-detection-service';
import { S3Service } from '../../services/s3-service';
import { BedrockService } from '../../services/bedrock.service';
import { S3VectorsService } from '../../services/s3-vectors.service';
import { ScrapingService, ScrapedContent } from '../../services/scraping.service';

import { 
  DiscoveredUrl, 
  DiscoveryOptions, 
  ComprehensiveDiscoveryResult,
  COMPREHENSIVE_DISCOVERY_OPTIONS 
} from '../../types/domain-discovery.types';
import { 
  StructuredContent,
  ExtractionResult 
} from '../../types/structured-content.types';
import { 
  EnhancementRequest, 
  EnhancementResult,
  MEDICAL_ENHANCEMENT_OPTIONS 
} from '../../types/content-enhancement.types';
import { 
  StructuredChunk, 
  StructuredChunkingResult,
  MEDICAL_CONTENT_CHUNKING 
} from '../../types/intelligent-chunking.types';

export interface EnhancedScrapingConfig {
  // S3 Vectors configuration
  contentBucket: string;
  vectorsBucket: string;
  vectorIndex: string;
  embeddingModel: string;
  
  // Domain and scraping configuration
  targetDomain: string;
  maxPages: number;
  rateLimitDelay: number;
  
  // Enhanced processing configuration
  enableContentEnhancement: boolean;
  enableIntelligentChunking: boolean;
  enableStructuredExtraction: boolean;
  chunkingStrategy: 'semantic' | 'hierarchical' | 'factual' | 'hybrid';
  
  // Change detection configuration
  enableChangeDetection: boolean;
  skipUnchangedContent: boolean;
  forceRefresh: boolean;
  
  // Quality and performance settings
  qualityThreshold: number;
  maxRetries: number;
  batchSize: number;
}

export interface EnhancedScrapingResult {
  url: string;
  success: boolean;
  title?: string;
  contentType?: 'symptoms' | 'treatment' | 'definition' | 'facts' | 'faq' | 'resource' | 'general';
  
  // Processing results
  structuredContent?: StructuredContent;
  enhancementResult?: EnhancementResult;
  chunkingResult?: StructuredChunkingResult;
  
  // Storage information
  contentKey?: string;
  vectorsStored?: number;
  
  // Metrics
  processingTime: number;
  qualityScore?: number;
  medicalRelevance?: number;
  
  // Error handling
  error?: string;
  warnings: string[];
  retryCount?: number;
}

export interface BatchEnhancedScrapingResult {
  message: string;
  summary: {
    totalUrls: number;
    successful: number;
    failed: number;
    totalVectorsStored: number;
    averageQualityScore: number;
    averageProcessingTime: number;
    successRate: string;
  };
  results: EnhancedScrapingResult[];
  domainDiscovery?: {
    discoveredUrls: number;
    relevantUrls: number;
    discoveryTime: number;
  };
}

/**
 * Web Scraper Service
 * Orchestrates all enhanced services for comprehensive content processing
 */
export class WebScraperService {
  private domainDiscoveryService: DomainDiscoveryService;
  private structuredContentService: StructuredContentExtractorService;
  private contentEnhancementService: ContentEnhancementService;
  private intelligentChunkingService: IntelligentChunkingService;
  private errorResilienceService: ErrorResilienceService;
  private htmlProcessingService: HtmlProcessingService;
  private contentDetectionService: ContentDetectionService;

  constructor(
    private s3Service: S3Service,
    private bedrockService: BedrockService,
    private s3VectorsService: S3VectorsService,
    private scrapingService: ScrapingService,
    private config: EnhancedScrapingConfig
  ) {
    // Initialize enhanced services with optimized configurations
    this.domainDiscoveryService = new DomainDiscoveryService();
    this.structuredContentService = new StructuredContentExtractorService();
    this.contentEnhancementService = new ContentEnhancementService(MEDICAL_ENHANCEMENT_OPTIONS);
    this.intelligentChunkingService = new IntelligentChunkingService({
      ...MEDICAL_CONTENT_CHUNKING,
      strategy: config.chunkingStrategy
    });
    this.errorResilienceService = new ErrorResilienceService();
    this.htmlProcessingService = new HtmlProcessingService();
    this.contentDetectionService = new ContentDetectionService();
  }

  /**
   * Discover and scrape domain URLs with enhanced processing
   */
  async discoverAndScrape(
    domain: string = this.config.targetDomain,
    maxUrls: number = this.config.maxPages
  ): Promise<BatchEnhancedScrapingResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Starting enhanced domain discovery and scraping for: ${domain}`);
      
      // Step 1: Domain Discovery
      const discoveryOptions: DiscoveryOptions = {
        ...COMPREHENSIVE_DISCOVERY_OPTIONS,
        maxUrls: Math.min(maxUrls * 2, 100) // Discover more URLs than we'll process
      };

      const discoveryResult = await this.domainDiscoveryService.discoverDomainUrls(domain, discoveryOptions);
      console.log(`Discovered ${discoveryResult.totalUrls} URLs`);

      // Step 2: Filter and prioritize URLs
      const prioritizedUrls = this.prioritizeUrls(discoveryResult.urls, maxUrls);
      console.log(`Selected ${prioritizedUrls.length} URLs for processing`);

      // Step 3: Enhanced scraping with all services
      const scrapingResult = await this.scrapeUrlsEnhanced(prioritizedUrls.map(u => u.url));

      const discoveryTime = Date.now() - startTime;

      return {
        ...scrapingResult,
        domainDiscovery: {
          discoveredUrls: discoveryResult.totalUrls,
          relevantUrls: prioritizedUrls.length,
          discoveryTime
        }
      };

    } catch (error) {
      console.error('Enhanced domain discovery and scraping failed:', error);
      throw error;
    }
  }

  /**
   * Scrape URLs with enhanced processing pipeline
   */
  async scrapeUrlsEnhanced(urls: string[]): Promise<BatchEnhancedScrapingResult> {
    const startTime = Date.now();
    const results: EnhancedScrapingResult[] = [];
    
    let totalVectorsStored = 0;
    let totalQualityScore = 0;
    let totalProcessingTime = 0;
    let successCount = 0;

    console.log(`Starting enhanced scraping for ${urls.length} URLs`);

    // Step 0: Filter URLs based on change detection (if enabled)
    let urlsToProcess = urls;
    if (this.config.enableChangeDetection && this.config.skipUnchangedContent) {
      urlsToProcess = await this.filterUrlsByChangeDetection(urls);
      console.log(`After change detection filtering: ${urlsToProcess.length}/${urls.length} URLs to process`);
    }

    // Process URLs in batches to manage resources
    for (let i = 0; i < urlsToProcess.length; i += this.config.batchSize) {
      const batch = urlsToProcess.slice(i, i + this.config.batchSize);
      
      // Process batch in parallel with error resilience
      const batchPromises = batch.map(url => 
        this.errorResilienceService.executeWithRetry(
          () => this.scrapeUrlEnhanced(url),
          `scrape-${url}`
        )
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          
          if (result.value.success) {
            successCount++;
            totalVectorsStored += result.value.vectorsStored || 0;
            totalQualityScore += result.value.qualityScore || 0;
            totalProcessingTime += result.value.processingTime;
          }
        } else {
          // Handle rejected promises
          const failedUrl = batch[batchResults.indexOf(result)];
          results.push({
            url: failedUrl,
            success: false,
            error: result.reason?.message || 'Unknown error',
            warnings: [],
            processingTime: 0
          });
        }
      }

      // Enhanced rate limiting between batches - more conservative for larger operations
      if (i + this.config.batchSize < urlsToProcess.length) {
        // Dynamic rate limiting based on total URLs being processed
        let delay = this.config.rateLimitDelay;
        
        if (urlsToProcess.length > 200) {
          delay = Math.max(delay, 3000); // 3 second delay for very large batches
        } else if (urlsToProcess.length > 100) {
          delay = Math.max(delay, 2000); // 2 second delay for large batches
        } else if (urlsToProcess.length > 50) {
          delay = Math.max(delay, 1500); // 1.5 second delay for medium batches
        }
        
        console.log(`Rate limiting: ${delay}ms delay between batches (${urlsToProcess.length} total URLs)`);
        await this.sleep(delay);
      }
    }

    // Add skipped URLs to results if change detection was used
    if (this.config.enableChangeDetection && this.config.skipUnchangedContent) {
      const skippedUrls = urls.filter(url => !urlsToProcess.includes(url));
      for (const skippedUrl of skippedUrls) {
        results.push({
          url: skippedUrl,
          success: true,
          title: 'Skipped - No changes detected',
          contentType: 'general',
          processingTime: 0,
          warnings: ['Content unchanged since last crawl - skipped processing']
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const averageQualityScore = successCount > 0 ? totalQualityScore / successCount : 0;
    const averageProcessingTime = successCount > 0 ? totalProcessingTime / successCount : 0;

    return {
      message: 'Enhanced scraping completed',
      summary: {
        totalUrls: urls.length,
        successful: successCount,
        failed: urls.length - successCount,
        totalVectorsStored,
        averageQualityScore,
        averageProcessingTime,
        successRate: ((successCount / urls.length) * 100).toFixed(1) + '%'
      },
      results
    };
  }

  /**
   * Enhanced processing pipeline for a single URL
   */
  async scrapeUrlEnhanced(url: string): Promise<EnhancedScrapingResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      console.log(`Processing URL with enhanced pipeline: ${url}`);

      // Step 0: Change Detection (if enabled)
      if (this.config.enableChangeDetection && this.config.skipUnchangedContent) {
        try {
          // First, do a quick HEAD request to get content length/last-modified
          const headResponse = await fetch(url, { 
            method: 'HEAD',
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          const contentLength = headResponse.headers.get('content-length');
          const lastModified = headResponse.headers.get('last-modified');
          
          // Create a simple hash from URL + content-length + last-modified for quick change detection
          const quickHash = `${url}-${contentLength}-${lastModified}`;
          
          const changeResult = await this.contentDetectionService.detectChanges(url, quickHash);
          
          if (!changeResult.hasChanged && !this.config.forceRefresh) {
            console.log(`Skipping unchanged content: ${url}`);
            return {
              url,
              success: true,
              title: 'Skipped - No changes detected',
              contentType: 'general',
              processingTime: Date.now() - startTime,
              warnings: ['Content unchanged since last crawl - skipped processing']
            };
          }
          
          if (changeResult.hasChanged) {
            console.log(`Content changed detected for ${url}: ${changeResult.changeType}`);
          }
        } catch (error) {
          warnings.push(`Change detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.log(`Change detection failed for ${url}, proceeding with full processing`);
        }
      }

      // Step 1: Scrape raw content
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      if (!scrapingResult.success || !scrapingResult.data) {
        throw new Error(`Scraping failed: ${scrapingResult.error}`);
      }

      const scrapedData = scrapingResult.data;

      // Step 2: HTML Processing
      const htmlResult = await this.htmlProcessingService.processHtml(
        (scrapedData as any).rawHtml || scrapedData.content, 
        url
      );

      // Step 3: Structured Content Extraction (if enabled)
      let structuredContent: StructuredContent | undefined;
      if (this.config.enableStructuredExtraction) {
        try {
          const extractionResult = await this.structuredContentService.extractStructuredContent(
            htmlResult.plainText,
            url,
            scrapedData.title
          );
          
          if (extractionResult.success && extractionResult.content) {
            structuredContent = extractionResult.content;
            console.log(`Extracted ${structuredContent.sections.length} sections with ${structuredContent.totalFacts} medical facts`);
          } else {
            warnings.push(`Structured extraction failed: ${extractionResult.error || 'Unknown error'}`);
          }
        } catch (error) {
          warnings.push(`Structured extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 4: Content Enhancement (if enabled)
      let enhancementResult: EnhancementResult | undefined;
      if (this.config.enableContentEnhancement && structuredContent) {
        try {
          const enhancementRequest: EnhancementRequest = {
            content: htmlResult.plainText,
            contentType: this.determineContentType(url, scrapedData.title, structuredContent),
            sourceUrl: url,
            medicalKeywords: structuredContent.sections.flatMap(s => s.keyTerms),
            targetAudience: ['patients', 'caregivers', 'newly-diagnosed'],
            enhancementGoals: ['enhance-medical-accuracy', 'improve-clarity', 'optimize-for-search']
          };

          enhancementResult = await this.contentEnhancementService.enhanceContent(enhancementRequest);
          if (enhancementResult.warnings.length > 0) {
            warnings.push(...enhancementResult.warnings);
          }
        } catch (error) {
          warnings.push(`Content enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 5: Intelligent Chunking (if enabled)
      let chunkingResult: StructuredChunkingResult | undefined;
      let vectorsStored = 0;
      
      if (this.config.enableIntelligentChunking) {
        try {
          const contentToChunk = enhancementResult?.enhancedContent || htmlResult.plainText;
          
          chunkingResult = await this.intelligentChunkingService.createStructuredChunks(
            contentToChunk,
            url,
            scrapedData.title,
            structuredContent
          );

          if (chunkingResult.success && chunkingResult.chunks.length > 0) {
            // Step 6: Generate embeddings and store in S3 Vectors
            vectorsStored = await this.storeVectors(chunkingResult.chunks, url);
            console.log(`Stored ${vectorsStored} vectors for ${url}`);
          }

          if (chunkingResult.warnings.length > 0) {
            warnings.push(...chunkingResult.warnings);
          }
        } catch (error) {
          warnings.push(`Intelligent chunking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 7: Store processed content in S3 and update change tracking
      const contentKey = await this.storeProcessedContent({
        scrapedData,
        htmlResult,
        structuredContent,
        enhancementResult,
        chunkingResult
      });

      // Update content tracking for change detection
      if (this.config.enableChangeDetection) {
        try {
          await this.contentDetectionService.updateContentRecord(scrapedData.url, {
            url: scrapedData.url,
            contentHash: scrapedData.contentHash,
            lastCrawled: new Date(),
            wordCount: htmlResult.plainText.split(/\s+/).length,
            chunkCount: chunkingResult?.chunks.length || 0,
            vectorIds: chunkingResult?.chunks.map(c => c.id) || [],
            metadata: {
              title: scrapedData.title,
              qualityScore: this.calculateOverallQualityScore({
                htmlResult,
                structuredContent,
                enhancementResult,
                chunkingResult
              }).toString(),
              contentType: structuredContent ? this.determineContentType(url, scrapedData.title, structuredContent) : 'general',
              processingTime: (Date.now() - startTime).toString()
            }
          });
        } catch (error) {
          warnings.push(`Failed to update content tracking: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const processingTime = Date.now() - startTime;
      const qualityScore = this.calculateOverallQualityScore({
        htmlResult,
        structuredContent,
        enhancementResult,
        chunkingResult
      });

      return {
        url,
        success: true,
        title: scrapedData.title,
        contentType: structuredContent ? this.determineContentType(url, scrapedData.title, structuredContent) : 'general',
        structuredContent,
        enhancementResult,
        chunkingResult,
        contentKey,
        vectorsStored,
        processingTime,
        qualityScore,
        medicalRelevance: structuredContent ? this.calculateMedicalRelevance(structuredContent) : 0,
        warnings
      };

    } catch (error) {
      console.error(`Enhanced processing failed for ${url}:`, error);
      
      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warnings,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Filter URLs based on change detection to avoid reprocessing unchanged content
   */
  private async filterUrlsByChangeDetection(urls: string[]): Promise<string[]> {
    const urlsToProcess: string[] = [];
    
    try {
      // Check each URL for changes
      const changeCheckPromises = urls.map(async (url) => {
        try {
          // Get last crawl timestamp
          const lastCrawled = await this.contentDetectionService.getLastCrawlTimestamp(url);
          
          if (!lastCrawled) {
            // Never crawled before
            return { url, shouldProcess: true, reason: 'new' };
          }
          
          // Skip age-based checks - only use content hash comparison
          // For scheduled executions, always check for content changes
          try {
            const headResponse = await fetch(url, { 
              method: 'HEAD',
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            const lastModified = headResponse.headers.get('last-modified');
            if (lastModified) {
              const serverLastModified = new Date(lastModified);
              if (serverLastModified <= lastCrawled) {
                return { url, shouldProcess: false, reason: 'unchanged' };
              }
            }
          } catch (error) {
            // If HEAD request fails, process the URL to be safe
            console.log(`HEAD request failed for ${url}, will process: ${error}`);
          }
          
          return { url, shouldProcess: true, reason: 'potentially-changed' };
          
        } catch (error) {
          // If change detection fails, process the URL to be safe
          console.log(`Change detection failed for ${url}, will process: ${error}`);
          return { url, shouldProcess: true, reason: 'detection-failed' };
        }
      });
      
      const changeResults = await Promise.all(changeCheckPromises);
      
      // Log change detection results
      const stats = {
        new: 0,
        unchanged: 0,
        'potentially-changed': 0,
        'detection-failed': 0
      };
      
      changeResults.forEach(result => {
        stats[result.reason as keyof typeof stats]++;
        if (result.shouldProcess) {
          urlsToProcess.push(result.url);
        }
      });
      
      console.log('Change detection results:', stats);
      
    } catch (error) {
      console.error('Batch change detection failed, processing all URLs:', error);
      return urls; // Fall back to processing all URLs
    }
    
    return urlsToProcess;
  }

  /**
   * Store vectors in S3 Vectors with embeddings
   */
  private async storeVectors(chunks: StructuredChunk[], sourceUrl: string): Promise<number> {
    let storedCount = 0;

    try {
      // Process chunks in batches for embedding generation
      const EMBEDDING_BATCH_SIZE = 5;
      
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        
        // Generate embeddings for batch
        const embeddingPromises = batch.map(chunk => 
          this.bedrockService.generateEmbedding(chunk.embedding_text, this.config.embeddingModel)
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
                  sourceUrl: chunk.metadata.sourceUrl,
                  sourceTitle: chunk.metadata.sourceTitle,
                  section: chunk.metadata.section,
                  contentType: chunk.metadata.contentType,
                  medicalRelevance: chunk.metadata.medicalRelevance === 'high' ? 0.9 : 
                                   chunk.metadata.medicalRelevance === 'medium' ? 0.6 : 0.3,
                  chunkIndex: chunk.metadata.chunkIndex.toString(),
                  totalChunks: chunk.metadata.totalChunks.toString(),
                  lastUpdated: chunk.metadata.lastUpdated
                }
              }]
            );
            
            storedCount++;
          }
        }
        
        // Rate limiting between embedding batches
        if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
          await this.sleep(200); // Reduced from 500ms to 200ms delay between embedding batches
        }
      }

    } catch (error) {
      console.error(`Failed to store vectors for ${sourceUrl}:`, error);
      throw error;
    }

    return storedCount;
  }

  /**
   * Store processed content in S3
   */
  private async storeProcessedContent(data: {
    scrapedData: ScrapedContent;
    htmlResult: CleanedHtmlResult;
    structuredContent?: StructuredContent;
    enhancementResult?: EnhancementResult;
    chunkingResult?: StructuredChunkingResult;
  }): Promise<string> {
    const key = `enhanced-content/${this.urlToKey(data.scrapedData.url)}.json`;
    
    const contentData = {
      // Original scraped data
      url: data.scrapedData.url,
      title: data.scrapedData.title,
      originalContent: data.scrapedData.content,
      contentLength: data.scrapedData.contentLength,
      contentHash: data.scrapedData.contentHash,
      scrapedAt: data.scrapedData.scrapedAt,
      
      // Enhanced processing results
      htmlProcessing: {
        cleanedHtml: data.htmlResult.cleanedHtml,
        plainText: data.htmlResult.plainText,
        structuralMetrics: data.htmlResult.structuralMetrics,
        processingTime: data.htmlResult.processingTime
      },
      
      structuredContent: data.structuredContent,
      
      contentEnhancement: data.enhancementResult ? {
        enhancedContent: data.enhancementResult.enhancedContent,
        embeddingOptimizedText: data.enhancementResult.embeddingOptimizedText,
        improvements: data.enhancementResult.improvements,
        qualityScore: data.enhancementResult.qualityScore,
        medicalAccuracyScore: data.enhancementResult.medicalAccuracyScore,
        processingTime: data.enhancementResult.processingTime
      } : undefined,
      
      intelligentChunking: data.chunkingResult ? {
        strategy: data.chunkingResult.strategy,
        totalChunks: data.chunkingResult.totalChunks,
        averageTokenCount: data.chunkingResult.averageTokenCount,
        averageQualityScore: data.chunkingResult.averageQualityScore,
        processingTime: data.chunkingResult.processingTime,
        chunks: data.chunkingResult.chunks
      } : undefined,
      
      // Metadata
      processedAt: new Date().toISOString(),
      version: '1.0',
      source: 'web-scraper'
    };

    await this.s3Service.putJsonObject(this.config.contentBucket, key, contentData, {
      url: data.scrapedData.url,
      title: data.scrapedData.title.substring(0, 100),
      processedAt: contentData.processedAt,
      hasStructuredContent: data.structuredContent ? 'true' : 'false',
      hasEnhancement: data.enhancementResult ? 'true' : 'false',
      hasChunking: data.chunkingResult ? 'true' : 'false'
    });

    return key;
  }

  /**
   * Prioritize URLs based on relevance and content type
   */
  private prioritizeUrls(discoveredUrls: DiscoveredUrl[], maxUrls: number): DiscoveredUrl[] {
    return discoveredUrls
      .sort((a, b) => {
        // Sort by relevance score (descending)
        if (b.estimatedRelevance !== a.estimatedRelevance) {
          return b.estimatedRelevance - a.estimatedRelevance;
        }
        // Then by depth (ascending - prefer shallower pages)
        return a.depth - b.depth;
      })
      .slice(0, maxUrls);
  }

  /**
   * Determine content type based on URL and structured content
   */
  private determineContentType(
    url: string, 
    title: string, 
    structuredContent: StructuredContent
  ): 'symptoms' | 'treatment' | 'definition' | 'facts' | 'faq' | 'resource' | 'general' {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();
    
    // Check URL patterns
    if (urlLower.includes('symptom')) return 'symptoms';
    if (urlLower.includes('treatment') || urlLower.includes('medication')) return 'treatment';
    if (urlLower.includes('about') || urlLower.includes('what-is')) return 'definition';
    if (urlLower.includes('faq') || urlLower.includes('question')) return 'faq';
    if (urlLower.includes('resource') || urlLower.includes('tool')) return 'resource';
    
    // Check title patterns
    if (titleLower.includes('symptom')) return 'symptoms';
    if (titleLower.includes('treatment')) return 'treatment';
    if (titleLower.includes('what is') || titleLower.includes('about')) return 'definition';
    
    // Check structured content
    if (structuredContent.totalFacts > 5) return 'facts';
    if (structuredContent.sections.some(s => s.heading.toLowerCase().includes('symptom'))) return 'symptoms';
    if (structuredContent.sections.some(s => s.heading.toLowerCase().includes('treatment'))) return 'treatment';
    
    return 'general';
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallQualityScore(data: {
    htmlResult: CleanedHtmlResult;
    structuredContent?: StructuredContent;
    enhancementResult?: EnhancementResult;
    chunkingResult?: StructuredChunkingResult;
  }): number {
    let score = 0.5; // Base score
    let factors = 1;
    
    // HTML processing quality
    const htmlQuality = this.htmlProcessingService.validateHtmlQuality(
      data.htmlResult.cleanedHtml,
      data.htmlResult.structuralMetrics
    );
    score += htmlQuality.score * 0.2;
    factors++;
    
    // Structured content quality
    if (data.structuredContent) {
      const structuredScore = Math.min(
        this.calculateMedicalRelevance(data.structuredContent) + 
        (data.structuredContent.totalFacts / 10) * 0.1 +
        (data.structuredContent.sections.length / 5) * 0.1,
        1.0
      );
      score += structuredScore * 0.3;
      factors++;
    }
    
    // Enhancement quality
    if (data.enhancementResult) {
      score += data.enhancementResult.qualityScore * 0.3;
      factors++;
    }
    
    // Chunking quality
    if (data.chunkingResult) {
      score += data.chunkingResult.averageQualityScore * 0.2;
      factors++;
    }
    
    return Math.min(score / factors, 1.0);
  }

  /**
   * Calculate medical relevance score from structured content
   */
  private calculateMedicalRelevance(content: StructuredContent): number {
    const factScore = Math.min(content.totalFacts / 10, 1.0) * 0.4;
    const sectionScore = Math.min(content.sections.length / 5, 1.0) * 0.3;
    const qualityScore = content.metadata.qualityScore * 0.3;
    
    return factScore + sectionScore + qualityScore;
  }

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
   * Check content changes for multiple URLs
   */
  async checkContentChanges(urls: string[]): Promise<Array<{
    url: string;
    hasChanged?: boolean;
    lastCrawled?: string;
    status: string;
    error?: string;
  }>> {
    const changeResults = [];
    
    for (const url of urls) {
      try {
        // Validate URL first
        if (!this.isValidUrl(url)) {
          changeResults.push({
            url,
            status: 'invalid',
            error: 'Invalid or blocked URL'
          });
          continue;
        }
        
        const hasChanged = await this.checkContentChanged(url);
        const lastCrawled = await this.contentDetectionService.getLastCrawlTimestamp(url);
        
        changeResults.push({
          url,
          hasChanged,
          lastCrawled: lastCrawled ? lastCrawled.toISOString() : 'Never',
          status: hasChanged ? 'needs-update' : 'current'
        });
      } catch (error) {
        changeResults.push({
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error'
        });
      }
    }
    
    return changeResults;
  }

  /**
   * Check if content has changed since last crawl
   */
  private async checkContentChanged(url: string): Promise<boolean> {
    try {
      const changeResult = await this.contentDetectionService.detectChanges(url, '');
      
      if (changeResult.changeType === 'new') {
        return true; // New content
      }
      
      // For existing content, fetch current content to compare
      const scrapingResult = await this.scrapingService.scrapeUrl(url);
      if (!scrapingResult.success || !scrapingResult.data) {
        return true; // Default to processing if scraping fails
      }
      
      const currentChangeResult = await this.contentDetectionService.detectChanges(
        url, 
        scrapingResult.data.content
      );
      
      const hasChanged = currentChangeResult.hasChanged;
      
      console.log(`Content change check for ${url}: ${hasChanged ? 'CHANGED' : 'UNCHANGED'}`);
      return hasChanged;
      
    } catch (error) {
      console.error(`Content change check failed for ${url}:`, error);
      return true; // Default to processing if check fails
    }
  }

  /**
   * Validate URL against allowed/blocked patterns
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check domain
      if (!urlObj.hostname.includes(this.config.targetDomain)) {
        return false;
      }
      
      // Check protocol
      if (urlObj.protocol !== 'https:') {
        return false;
      }
      
      // Check blocked paths (get from config or environment)
      const blockedPaths = process.env.BLOCKED_PATHS?.split(',') || [
        '/admin', '/login', '/api/internal', '/private', '/search', '/cart', '/checkout'
      ];
      
      for (const blockedPath of blockedPaths) {
        if (urlObj.pathname.startsWith(blockedPath)) {
          return false;
        }
      }
      
      // Check allowed paths (if configured)
      const allowedPaths = process.env.ALLOWED_PATHS?.split(',') || [];
      if (allowedPaths.length > 0) {
        const isAllowed = allowedPaths.some(allowedPath => 
          urlObj.pathname.startsWith(allowedPath)
        );
        if (!isAllowed) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Health check for all enhanced services
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test core services
      const coreHealthChecks = await Promise.allSettled([
        this.s3Service.healthCheck(),
        this.s3VectorsService.healthCheck(),
        this.bedrockService.healthCheck(),
        this.scrapingService.healthCheck()
      ]);

      const coreHealthy = coreHealthChecks.every(result => 
        result.status === 'fulfilled' && result.value
      );

      if (!coreHealthy) {
        return false;
      }

      // Test enhanced services with simple operations
      const testUrl = `https://${this.config.targetDomain}/about-diabetes/type-1`;
      const testContent = 'Diabetes is a chronic condition that affects how your body processes blood sugar.';

      // Test HTML processing
      await this.htmlProcessingService.processHtml('<p>' + testContent + '</p>', testUrl);

      // Test structured extraction
      if (this.config.enableStructuredExtraction) {
        await this.structuredContentService.extractStructuredContent(testContent, testUrl, 'Test');
      }

      // Test chunking
      if (this.config.enableIntelligentChunking) {
        await this.intelligentChunkingService.chunkContent(testContent, testUrl, 'Test');
      }

      return true;
    } catch (error) {
      console.error('Web scraper health check failed:', error);
      return false;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): EnhancedScrapingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<EnhancedScrapingConfig>): void {
    Object.assign(this.config, updates);
  }
}