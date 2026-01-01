import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, ServerSideEncryption } from '@aws-sdk/client-s3';

export interface S3Config {
  region?: string;
  endpoint?: string;
}

export interface S3Object {
  key: string;
  body: string | Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  serverSideEncryption?: ServerSideEncryption;
}

export interface S3ListResult {
  objects: Array<{
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
  }>;
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export class S3Service {
  private client: S3Client;

  constructor(config: S3Config = {}) {
    this.client = new S3Client({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      ...(config.endpoint && { endpoint: config.endpoint })
    });
  }

  /**
   * Store object in S3 bucket
   */
  async putObject(bucket: string, object: S3Object): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType || 'application/json',
        ServerSideEncryption: object.serverSideEncryption || ServerSideEncryption.AES256,
        Metadata: object.metadata
      });

      const result = await this.client.send(command);
      console.log(`S3 object stored: s3://${bucket}/${object.key}`);
      
      return result.ETag || '';
    } catch (error) {
      console.error(`Failed to store S3 object: s3://${bucket}/${object.key}`, error);
      throw new Error(`S3 put operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get object from S3 bucket
   */
  async getObject(bucket: string, key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const result = await this.client.send(command);
      
      if (!result.Body) {
        throw new Error('Object body is empty');
      }

      // Convert stream to string
      const bodyString = await result.Body.transformToString();
      return bodyString;
    } catch (error) {
      console.error(`Failed to get S3 object: s3://${bucket}/${key}`, error);
      throw new Error(`S3 get operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete object from S3 bucket
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      });

      await this.client.send(command);
      console.log(`S3 object deleted: s3://${bucket}/${key}`);
    } catch (error) {
      console.error(`Failed to delete S3 object: s3://${bucket}/${key}`, error);
      throw new Error(`S3 delete operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List objects in S3 bucket
   */
  async listObjects(
    bucket: string, 
    prefix?: string, 
    maxKeys?: number,
    continuationToken?: string
  ): Promise<S3ListResult> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken
      });

      const result = await this.client.send(command);
      
      return {
        objects: (result.Contents || []).map(obj => ({
          key: obj.Key || '',
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
          etag: obj.ETag || ''
        })),
        isTruncated: result.IsTruncated || false,
        nextContinuationToken: result.NextContinuationToken
      };
    } catch (error) {
      console.error(`Failed to list S3 objects: s3://${bucket}/${prefix || ''}`, error);
      throw new Error(`S3 list operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if object exists in S3 bucket
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Store JSON data in S3
   */
  async putJsonObject(bucket: string, key: string, data: any, metadata?: Record<string, string>): Promise<string> {
    return this.putObject(bucket, {
      key,
      body: JSON.stringify(data, null, 2),
      contentType: 'application/json',
      metadata
    });
  }

  /**
   * Get JSON data from S3
   */
  async getJsonObject<T = any>(bucket: string, key: string): Promise<T> {
    const content = await this.getObject(bucket, key);
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON from S3 object: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  /**
   * Health check for S3 service
   */
  async healthCheck(bucket: string): Promise<boolean> {
    try {
      // Try to list objects in the bucket (minimal operation)
      await this.listObjects(bucket, undefined, 1);
      return true;
    } catch (error) {
      console.error('S3 health check failed:', error);
      return false;
    }
  }

  /**
   * Generate safe S3 key from URL or string
   */
  static generateSafeKey(input: string, prefix?: string): string {
    // Convert URL or string to safe S3 key
    const safeKey = input
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    
    return prefix ? `${prefix}/${safeKey}` : safeKey;
  }

  /**
   * Generate timestamped key
   */
  static generateTimestampedKey(base: string, extension?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = extension ? `.${extension}` : '';
    return `${base}-${timestamp}${ext}`;
  }
}