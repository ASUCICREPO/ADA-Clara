import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { StructuralMetrics } from './html-processing-service';

/**
 * Enhanced content metadata for HTML/PDF storage
 */
export interface EnhancedContentMetadata {
  originalUrl: string;
  title: string;
  scrapedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  structuralMetrics: StructuralMetrics;
  processingTime: {
    htmlCleaning: number;
    pdfGeneration?: number;
    s3Upload: number;
  };
  fileSize: {
    html: number;
    pdf?: number;
    originalJson: number;
  };
}

/**
 * Enhanced scraping result with HTML/PDF support
 */
export interface EnhancedScrapingResult {
  // Existing fields (backward compatibility)
  title: string;
  content: string; // Plain text
  url: string;
  scrapedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  wordCount: number;
  links: string[];
  success: boolean;
  error?: string;
  
  // New HTML enhancement fields
  cleanedHtml: string;
  htmlS3Key: string;
  structuralMetrics: StructuralMetrics;
  
  // Optional PDF fields
  pdfS3Key?: string;
  pdfGenerated?: boolean;
}

/**
 * Enhanced Storage Service for HTML/PDF content
 * Adapts and extends bedrock-crawler's storeContentInS3 functionality
 */
export class EnhancedStorageService {
  private client: S3Client;
  private readonly CONTENT_BUCKET = process.env.CONTENT_BUCKET!;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  /**
   * Store HTML content with proper metadata and organized folder structure
   * Adapted from bedrock-crawler's storeContentInS3 function
   */
  async storeHtmlContent(
    html: string, 
    metadata: EnhancedContentMetadata
  ): Promise<string> {
    const htmlKey = this.generateHtmlS3Key(metadata.originalUrl);
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: htmlKey,
      Body: html,
      ContentType: 'text/html',
      Metadata: {
        originalUrl: metadata.originalUrl,
        title: metadata.title,
        contentType: metadata.contentType,
        scrapedAt: metadata.scrapedAt,
        tableCount: metadata.structuralMetrics.tableCount.toString(),
        listCount: metadata.structuralMetrics.listCount.toString(),
        headingCount: metadata.structuralMetrics.headingCount.toString(),
        linkCount: metadata.structuralMetrics.linkCount.toString(),
        processingTime: metadata.processingTime.htmlCleaning.toString(),
        fileSize: metadata.fileSize.html.toString()
      },
      // Server-side encryption (SSE-S3) for security compliance
      ServerSideEncryption: 'AES256'
    });

    await this.client.send(command);
    console.log(`Stored HTML content in S3: ${htmlKey}`);
    
    return htmlKey;
  }

  /**
   * Store PDF content with proper metadata
   */
  async storePdfContent(
    pdfBuffer: Buffer,
    metadata: EnhancedContentMetadata
  ): Promise<string> {
    const pdfKey = this.generatePdfS3Key(metadata.originalUrl);
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        originalUrl: metadata.originalUrl,
        title: metadata.title,
        contentType: metadata.contentType,
        scrapedAt: metadata.scrapedAt,
        pdfGenerationTime: metadata.processingTime.pdfGeneration?.toString() || '0',
        fileSize: metadata.fileSize.pdf?.toString() || '0'
      },
      // Server-side encryption (SSE-S3) for security compliance
      ServerSideEncryption: 'AES256'
    });

    await this.client.send(command);
    console.log(`Stored PDF content in S3: ${pdfKey}`);
    
    return pdfKey;
  }

  /**
   * Store enhanced metadata alongside content
   */
  async storeEnhancedMetadata(
    metadata: EnhancedContentMetadata
  ): Promise<string> {
    const metadataKey = this.generateMetadataS3Key(metadata.originalUrl);
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: 'application/json',
      Metadata: {
        originalUrl: metadata.originalUrl,
        contentType: metadata.contentType,
        scrapedAt: metadata.scrapedAt
      },
      // Server-side encryption (SSE-S3) for security compliance
      ServerSideEncryption: 'AES256'
    });

    await this.client.send(command);
    console.log(`Stored enhanced metadata in S3: ${metadataKey}`);
    
    return metadataKey;
  }

  /**
   * Store original JSON content for backward compatibility
   * Maintains existing storeContentInS3 functionality
   */
  async storeOriginalJsonContent(result: {
    url: string;
    title: string;
    content: string;
    extractedAt: string;
    contentType: 'article' | 'faq' | 'resource' | 'event';
    wordCount: number;
    links: string[];
    success: boolean;
    error?: string;
  }): Promise<string> {
    // Use original key format for backward compatibility
    const key = `scraped-content/${new Date().toISOString().split('T')[0]}/${encodeURIComponent(result.url)}.json`;
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: key,
      Body: JSON.stringify(result, null, 2),
      ContentType: 'application/json',
      Metadata: {
        url: result.url,
        contentType: result.contentType,
        extractedAt: result.extractedAt,
        wordCount: result.wordCount.toString(),
      },
      // Server-side encryption (SSE-S3) for security compliance
      ServerSideEncryption: 'AES256'
    });
    
    await this.client.send(command);
    console.log(`Stored original JSON content in S3: ${key}`);
    
    return key;
  }

  /**
   * Retrieve HTML content from S3
   */
  async getHtmlContent(htmlKey: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: htmlKey
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        return null;
      }

      return await response.Body.transformToString();
    } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Retrieve PDF content from S3
   */
  async getPdfContent(pdfKey: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: pdfKey
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        return null;
      }

      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Generate S3 key for HTML content with organized folder structure
   * Uses date prefixes and URL-based naming like original implementation
   */
  private generateHtmlS3Key(url: string): string {
    const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const urlKey = this.urlToKey(url);
    return `html-content/${datePrefix}/${urlKey}.html`;
  }

  /**
   * Generate S3 key for PDF content
   */
  private generatePdfS3Key(url: string): string {
    const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const urlKey = this.urlToKey(url);
    return `pdf-content/${datePrefix}/${urlKey}.pdf`;
  }

  /**
   * Generate S3 key for enhanced metadata
   */
  private generateMetadataS3Key(url: string): string {
    const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const urlKey = this.urlToKey(url);
    return `metadata/${datePrefix}/${urlKey}-meta.json`;
  }

  /**
   * Convert URL to S3-safe key
   * Adapted from original implementation
   */
  private urlToKey(url: string): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/\./g, '-');
      const path = urlObj.pathname.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
      return `${domain}${path}`.replace(/^-|-$/g, ''); // Remove leading/trailing dashes
    } catch (error) {
      // Fallback for invalid URLs
      return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
  }

  /**
   * Store complete enhanced scraping result
   * Combines HTML, PDF (optional), JSON, and metadata storage
   */
  async storeEnhancedResult(
    result: EnhancedScrapingResult,
    metadata: EnhancedContentMetadata,
    pdfBuffer?: Buffer
  ): Promise<{
    htmlKey: string;
    jsonKey: string;
    metadataKey: string;
    pdfKey?: string;
  }> {
    const uploadStart = Date.now();

    // Store all content in parallel for efficiency
    const promises: Promise<string>[] = [
      this.storeHtmlContent(result.cleanedHtml, metadata),
      this.storeOriginalJsonContent({
        url: result.url,
        title: result.title,
        content: result.content,
        extractedAt: result.scrapedAt,
        contentType: result.contentType,
        wordCount: result.wordCount,
        links: result.links,
        success: result.success,
        error: result.error
      }),
      this.storeEnhancedMetadata(metadata)
    ];

    // Add PDF storage if buffer provided
    if (pdfBuffer) {
      promises.push(this.storePdfContent(pdfBuffer, metadata));
    }

    const keys = await Promise.all(promises);
    
    // Update metadata with actual upload time
    metadata.processingTime.s3Upload = Date.now() - uploadStart;

    return {
      htmlKey: keys[0],
      jsonKey: keys[1],
      metadataKey: keys[2],
      pdfKey: pdfBuffer ? keys[3] : undefined
    };
  }

  /**
   * Validate encryption for stored content (security compliance)
   */
  async validateStoredContentEncryption(key: string): Promise<{
    encrypted: boolean;
    encryptionType?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: key
      });

      const response = await this.client.send(command);
      
      return {
        encrypted: !!response.ServerSideEncryption,
        encryptionType: response.ServerSideEncryption
      };
    } catch (error) {
      console.error(`Failed to validate encryption for ${key}:`, error);
      return { encrypted: false };
    }
  }

  /**
   * Get bucket name for external integrations
   */
  getBucketName(): string {
    return this.CONTENT_BUCKET;
  }

  /**
   * Generate S3 keys for a URL (utility for external services)
   */
  generateS3Keys(url: string): {
    htmlKey: string;
    pdfKey: string;
    metadataKey: string;
    jsonKey: string;
  } {
    const datePrefix = new Date().toISOString().split('T')[0];
    const urlKey = this.urlToKey(url);
    
    return {
      htmlKey: `html-content/${datePrefix}/${urlKey}.html`,
      pdfKey: `pdf-content/${datePrefix}/${urlKey}.pdf`,
      metadataKey: `metadata/${datePrefix}/${urlKey}-meta.json`,
      jsonKey: `scraped-content/${datePrefix}/${encodeURIComponent(url)}.json`
    };
  }
}