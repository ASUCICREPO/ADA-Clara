/**
 * Content Detection Service
 * 
 * Provides intelligent content change detection for the web crawler
 * to avoid reprocessing unchanged content and optimize performance.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';
import { 
  ContentRecord, 
  ChangeDetectionResult,
  ContentChangesSummary 
} from '../types/index';

export class ContentDetectionService {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking';
  }

  /**
   * Detect if content has changed since last crawl
   */
  async detectChanges(url: string, newContent: string): Promise<ChangeDetectionResult> {
    try {
      // Generate hash of new content
      const currentHash = this.generateContentHash(newContent);
      
      // Get previous content record
      const previousRecord = await this.getContentRecord(url);
      
      if (!previousRecord) {
        // New content
        return {
          hasChanged: true,
          changeType: 'new',
          currentHash,
          processingDecision: 'processed'
        };
      }

      // Compare hashes
      const hasChanged = previousRecord.contentHash !== currentHash;
      
      return {
        hasChanged,
        changeType: hasChanged ? 'modified' : 'unchanged',
        previousHash: previousRecord.contentHash,
        currentHash,
        lastCrawled: previousRecord.lastCrawled,
        processingDecision: hasChanged ? 'processed' : 'skipped'
      };

    } catch (error) {
      console.error('Content change detection failed:', error);
      // Default to processing content if detection fails
      return {
        hasChanged: true,
        changeType: 'new',
        currentHash: this.generateContentHash(newContent),
        processingDecision: 'processed'
      };
    }
  }

  /**
   * Update content record after processing
   */
  async updateContentRecord(url: string, content: ContentRecord): Promise<void> {
    try {
      const item = {
        pk: `CONTENT#${this.urlToKey(url)}`,
        sk: 'METADATA',
        url: content.url,
        contentHash: content.contentHash,
        lastCrawled: content.lastCrawled.toISOString(),
        wordCount: content.wordCount,
        chunkCount: content.chunkCount,
        vectorIds: content.vectorIds || [],
        metadata: content.metadata || {},
        updatedAt: new Date().toISOString()
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: item
      }));

      console.log(`Content record updated for ${url}`);
    } catch (error) {
      console.error(`Failed to update content record for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Get last crawl timestamp for a URL
   */
  async getLastCrawlTimestamp(url: string): Promise<Date | null> {
    try {
      const record = await this.getContentRecord(url);
      return record ? record.lastCrawled : null;
    } catch (error) {
      console.error(`Failed to get last crawl timestamp for ${url}:`, error);
      return null;
    }
  }

  /**
   * Mark content as processed
   */
  async markContentProcessed(url: string, contentHash: string): Promise<void> {
    try {
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `CONTENT#${this.urlToKey(url)}`,
          sk: 'METADATA'
        },
        UpdateExpression: 'SET contentHash = :hash, lastProcessed = :timestamp',
        ExpressionAttributeValues: {
          ':hash': contentHash,
          ':timestamp': new Date().toISOString()
        }
      }));

      console.log(`Content marked as processed for ${url}`);
    } catch (error) {
      console.error(`Failed to mark content as processed for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Get content record from DynamoDB
   */
  private async getContentRecord(url: string): Promise<ContentRecord | null> {
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `CONTENT#${this.urlToKey(url)}`,
          sk: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      return {
        url: result.Item.url,
        contentHash: result.Item.contentHash,
        lastCrawled: new Date(result.Item.lastCrawled),
        wordCount: result.Item.wordCount || 0,
        chunkCount: result.Item.chunkCount || 0,
        vectorIds: result.Item.vectorIds || [],
        metadata: result.Item.metadata || {}
      };
    } catch (error) {
      console.error(`Failed to get content record for ${url}:`, error);
      return null;
    }
  }

  /**
   * Generate SHA-256 hash of content
   */
  private generateContentHash(content: string): string {
    return createHash('sha256')
      .update(content.trim())
      .digest('hex');
  }

  /**
   * Convert URL to DynamoDB-safe key
   */
  private urlToKey(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Get content change statistics
   */
  async getChangeStatistics(urls: string[]): Promise<{
    total: number;
    new: number;
    modified: number;
    unchanged: number;
  }> {
    const stats = { total: urls.length, new: 0, modified: 0, unchanged: 0 };

    for (const url of urls) {
      const record = await this.getContentRecord(url);
      if (!record) {
        stats.new++;
      } else {
        // This would require fetching current content to compare
        // For now, assume unchanged if record exists
        stats.unchanged++;
      }
    }

    return stats;
  }
}