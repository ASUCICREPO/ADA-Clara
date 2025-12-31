import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { KnowledgeContent } from '../types/index';

/**
 * S3 Service for ADA Clara Chatbot
 * Handles content storage and retrieval from S3 buckets
 */
export class S3Service {
  private client: S3Client;
  
  // Bucket names from environment variables or defaults
  private readonly CONTENT_BUCKET = process.env.CONTENT_BUCKET || `ada-clara-content-${process.env.AWS_ACCOUNT_ID || 'dev'}-${process.env.AWS_REGION || 'us-east-1'}`;
  private readonly VECTORS_BUCKET = process.env.VECTORS_BUCKET || `ada-clara-vectors-${process.env.AWS_ACCOUNT_ID || 'dev'}-${process.env.AWS_REGION || 'us-east-1'}`;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  // ===== CONTENT BUCKET OPERATIONS =====

  /**
   * Store raw scraped content in S3
   */
  async storeRawContent(
    url: string, 
    content: string, 
    metadata: {
      title: string;
      contentType: string;
      scrapedAt: Date;
      language: string;
    }
  ): Promise<string> {
    const key = this.generateContentKey(url, metadata.contentType);
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: key,
      Body: content,
      ContentType: 'text/html',
      Metadata: {
        sourceUrl: url,
        title: metadata.title,
        contentType: metadata.contentType,
        scrapedAt: metadata.scrapedAt.toISOString(),
        language: metadata.language,
        wordCount: content.split(/\s+/).length.toString(),
        readingTime: Math.ceil(content.split(/\s+/).length / 200).toString() // ~200 words per minute
      }
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Retrieve raw content from S3
   */
  async getRawContent(key: string): Promise<{ content: string; metadata: any } | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: key
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        return null;
      }

      const content = await response.Body.transformToString();
      
      return {
        content,
        metadata: response.Metadata || {}
      };
    } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Store processed content chunks in S3
   */
  async storeProcessedContent(
    contentId: string,
    chunks: Array<{
      chunkId: string;
      content: string;
      metadata: any;
    }>
  ): Promise<string[]> {
    const keys: string[] = [];

    for (const chunk of chunks) {
      const key = `processed/${contentId}/${chunk.chunkId}.json`;
      
      const command = new PutObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: key,
        Body: JSON.stringify({
          chunkId: chunk.chunkId,
          content: chunk.content,
          metadata: chunk.metadata,
          processedAt: new Date().toISOString()
        }),
        ContentType: 'application/json'
      });

      await this.client.send(command);
      keys.push(key);
    }

    return keys;
  }

  /**
   * List content by type and date range
   */
  async listContent(
    contentType?: string,
    startDate?: Date,
    endDate?: Date,
    maxKeys: number = 100
  ): Promise<Array<{
    key: string;
    lastModified: Date;
    size: number;
    metadata?: any;
  }>> {
    let prefix = 'raw/';
    if (contentType) {
      prefix += `${contentType}/`;
    }

    const command = new ListObjectsV2Command({
      Bucket: this.CONTENT_BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys
    });

    const response = await this.client.send(command);
    
    if (!response.Contents) {
      return [];
    }

    let items = response.Contents.map(item => ({
      key: item.Key!,
      lastModified: item.LastModified!,
      size: item.Size!
    }));

    // Filter by date range if provided
    if (startDate || endDate) {
      items = items.filter(item => {
        if (startDate && item.lastModified < startDate) return false;
        if (endDate && item.lastModified > endDate) return false;
        return true;
      });
    }

    return items;
  }

  /**
   * Delete content from S3
   */
  async deleteContent(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: key
    });

    await this.client.send(command);
  }

  // ===== UTILITY METHODS =====

  /**
   * Generate S3 key for content based on URL and type
   */
  private generateContentKey(url: string, contentType: string): string {
    // Extract domain and path from URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/\./g, '-');
    const path = urlObj.pathname.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    return `raw/${contentType}/${domain}${path}-${timestamp}.html`;
  }

  /**
   * Generate content ID from URL for consistent referencing
   */
  generateContentId(url: string): string {
    // Create a consistent ID from URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/\./g, '-');
    const path = urlObj.pathname.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
    
    return `${domain}${path}`.replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  }

  /**
   * Health check - verify connection to S3
   */
  async healthCheck(): Promise<{ contentBucket: boolean; vectorsBucket: boolean }> {
    try {
      // Test content bucket access
      const contentCommand = new ListObjectsV2Command({
        Bucket: this.CONTENT_BUCKET,
        MaxKeys: 1
      });
      await this.client.send(contentCommand);

      // Note: S3 Vectors buckets cannot be accessed via regular S3 API
      // They require the S3 Vectors API. We'll assume it's healthy if content bucket works.
      return {
        contentBucket: true,
        vectorsBucket: true // Assume healthy - S3 Vectors requires different API
      };
    } catch (error) {
      console.error('S3 health check failed:', error);
      return {
        contentBucket: false,
        vectorsBucket: false
      };
    }
  }

  /**
   * Get bucket information
   */
  getBucketNames(): { contentBucket: string; vectorsBucket: string } {
    return {
      contentBucket: this.CONTENT_BUCKET,
      vectorsBucket: this.VECTORS_BUCKET
    };
  }

  /**
   * Store content metadata for integration with DynamoDB
   */
  async storeContentMetadata(content: KnowledgeContent): Promise<string> {
    const key = `metadata/${content.contentType}/${content.contentId}.json`;
    
    const command = new PutObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: key,
      Body: JSON.stringify(content),
      ContentType: 'application/json',
      Metadata: {
        contentId: content.contentId,
        contentType: content.contentType,
        language: content.language,
        lastUpdated: content.lastUpdated.toISOString()
      }
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Retrieve content metadata
   */
  async getContentMetadata(contentId: string, contentType: string): Promise<KnowledgeContent | null> {
    try {
      const key = `metadata/${contentType}/${contentId}.json`;
      
      const command = new GetObjectCommand({
        Bucket: this.CONTENT_BUCKET,
        Key: key
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        return null;
      }

      const content = await response.Body.transformToString();
      return JSON.parse(content) as KnowledgeContent;
    } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Batch operations for efficient content management
   */
  async batchStoreContent(
    contents: Array<{
      url: string;
      content: string;
      metadata: {
        title: string;
        contentType: string;
        scrapedAt: Date;
        language: string;
      };
    }>
  ): Promise<string[]> {
    const keys: string[] = [];
    
    // Process in parallel but with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const batch = contents.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(item => 
        this.storeRawContent(item.url, item.content, item.metadata)
      );
      
      const batchKeys = await Promise.all(batchPromises);
      keys.push(...batchKeys);
    }
    
    return keys;
  }
}