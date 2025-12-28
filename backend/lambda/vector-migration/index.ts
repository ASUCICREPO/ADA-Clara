import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

interface VectorDocument {
  id: string;
  text: string;
  vector: number[];
  metadata: {
    url: string;
    title: string;
    chunkIndex: number;
    totalChunks: number;
    wordCount: number;
    source: string;
  };
}

interface MigrationEvent {
  action: 'migrate' | 'test' | 'status';
  batchSize?: number;
  dryRun?: boolean;
}

interface MigrationResult {
  success: boolean;
  processed: number;
  errors: number;
  details: string[];
  totalCost?: number;
}

export const handler: Handler<MigrationEvent, MigrationResult> = async (event) => {
  console.log('Vector Migration Lambda started:', JSON.stringify(event, null, 2));

  const {
    action = 'migrate',
    batchSize = 10,
    dryRun = false
  } = event;

  try {
    const migrator = new VectorMigrator();
    
    switch (action) {
      case 'migrate':
        return await migrator.migrateVectors(batchSize, dryRun);
      case 'test':
        return await migrator.testConnection();
      case 'status':
        return await migrator.getStatus();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      processed: 0,
      errors: 1,
      details: [`Migration failed: ${error}`]
    };
  }
};

class VectorMigrator {
  private s3Client: S3Client;
  private bedrockClient: BedrockRuntimeClient;
  private opensearchClient: Client;
  
  private readonly CONTENT_BUCKET = process.env.CONTENT_BUCKET || 'ada-clara-content-minimal-023336033519-us-east-1';
  private readonly OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT;
  private readonly INDEX_NAME = 'ada-clara-index';
  private readonly EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    if (!this.OPENSEARCH_ENDPOINT) {
      throw new Error('OPENSEARCH_ENDPOINT environment variable is required');
    }

    // Initialize OpenSearch client with AWS Sigv4 signing
    this.opensearchClient = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'aoss',
        getCredentials: () => defaultProvider()()
      }),
      node: this.OPENSEARCH_ENDPOINT
    });
  }

  async testConnection(): Promise<MigrationResult> {
    console.log('Testing OpenSearch connection...');
    
    try {
      // Test OpenSearch connection
      const response = await this.opensearchClient.cluster.health();
      console.log('OpenSearch cluster health:', response.body);

      // Test if index exists
      const indexExists = await this.opensearchClient.indices.exists({
        index: this.INDEX_NAME
      });

      const details = [
        `OpenSearch connection: SUCCESS`,
        `Cluster status: ${response.body.status}`,
        `Index exists: ${indexExists.body ? 'YES' : 'NO'}`
      ];

      if (!indexExists.body) {
        await this.createIndex();
        details.push('Index created successfully');
      }

      return {
        success: true,
        processed: 0,
        errors: 0,
        details
      };
    } catch (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        processed: 0,
        errors: 1,
        details: [`Connection test failed: ${error}`]
      };
    }
  }

  async getStatus(): Promise<MigrationResult> {
    console.log('Getting migration status...');
    
    try {
      // Count documents in S3
      const s3Objects = await this.listS3Objects();
      
      // Count documents in OpenSearch
      const searchResponse = await this.opensearchClient.count({
        index: this.INDEX_NAME
      });
      
      const opensearchCount = searchResponse.body.count || 0;
      
      return {
        success: true,
        processed: opensearchCount,
        errors: 0,
        details: [
          `S3 content files: ${s3Objects.length}`,
          `OpenSearch documents: ${opensearchCount}`,
          `Migration status: ${opensearchCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'}`
        ]
      };
    } catch (error) {
      console.error('Status check failed:', error);
      return {
        success: false,
        processed: 0,
        errors: 1,
        details: [`Status check failed: ${error}`]
      };
    }
  }

  async migrateVectors(batchSize: number, dryRun: boolean): Promise<MigrationResult> {
    console.log(`Starting vector migration (batchSize: ${batchSize}, dryRun: ${dryRun})`);
    
    let processed = 0;
    let errors = 0;
    const details: string[] = [];
    let totalCost = 0;

    try {
      // Ensure index exists
      const indexExists = await this.opensearchClient.indices.exists({
        index: this.INDEX_NAME
      });

      if (!indexExists.body) {
        if (!dryRun) {
          await this.createIndex();
          details.push('Created OpenSearch index');
        } else {
          details.push('Would create OpenSearch index');
        }
      }

      // Get all content files from S3
      const s3Objects = await this.listS3Objects();
      console.log(`Found ${s3Objects.length} content files in S3`);

      // Process files in batches
      for (let i = 0; i < s3Objects.length; i += batchSize) {
        const batch = s3Objects.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(s3Objects.length / batchSize)}`);

        try {
          const batchResult = await this.processBatch(batch, dryRun);
          processed += batchResult.processed;
          errors += batchResult.errors;
          totalCost += batchResult.cost;
          details.push(...batchResult.details);
        } catch (error) {
          console.error(`Batch processing failed:`, error);
          errors++;
          details.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error}`);
        }

        // Rate limiting between batches
        if (i + batchSize < s3Objects.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      details.push(`Migration completed: ${processed} processed, ${errors} errors`);
      details.push(`Estimated cost: $${totalCost.toFixed(4)}`);

      return {
        success: errors === 0,
        processed,
        errors,
        details,
        totalCost
      };

    } catch (error) {
      console.error('Migration failed:', error);
      return {
        success: false,
        processed,
        errors: errors + 1,
        details: [...details, `Migration failed: ${error}`],
        totalCost
      };
    }
  }

  private async processBatch(s3Objects: any[], dryRun: boolean): Promise<{
    processed: number;
    errors: number;
    cost: number;
    details: string[];
  }> {
    const documents: VectorDocument[] = [];
    let batchCost = 0;
    const details: string[] = [];

    // Process each S3 object
    for (const obj of s3Objects) {
      try {
        // Get content from S3
        const content = await this.getS3Content(obj.Key);
        
        // Generate chunks from content
        const chunks = this.chunkContent(content, obj.Key);
        
        // Generate embeddings for each chunk
        for (const chunk of chunks) {
          const embedding = await this.generateEmbedding(chunk.text);
          batchCost += 0.0001; // Approximate cost per embedding
          
          documents.push({
            id: chunk.id,
            text: chunk.text,
            vector: embedding,
            metadata: chunk.metadata
          });
        }
        
        details.push(`Processed ${chunks.length} chunks from ${obj.Key}`);
      } catch (error) {
        console.error(`Failed to process ${obj.Key}:`, error);
        details.push(`Failed to process ${obj.Key}: ${error}`);
      }
    }

    // Bulk index to OpenSearch
    if (documents.length > 0 && !dryRun) {
      try {
        await this.bulkIndexDocuments(documents);
        details.push(`Indexed ${documents.length} documents to OpenSearch`);
      } catch (error) {
        console.error('Bulk indexing failed:', error);
        details.push(`Bulk indexing failed: ${error}`);
        return { processed: 0, errors: documents.length, cost: batchCost, details };
      }
    } else if (dryRun) {
      details.push(`Would index ${documents.length} documents to OpenSearch`);
    }

    return {
      processed: documents.length,
      errors: 0,
      cost: batchCost,
      details
    };
  }

  private async listS3Objects(): Promise<any[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.CONTENT_BUCKET,
      Prefix: 'processed/'
    });

    const response = await this.s3Client.send(command);
    return response.Contents || [];
  }

  private async getS3Content(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.CONTENT_BUCKET,
      Key: key
    });

    const response = await this.s3Client.send(command);
    return await response.Body?.transformToString() || '';
  }

  private chunkContent(content: string, key: string): Array<{
    id: string;
    text: string;
    metadata: any;
  }> {
    // Parse the content (assuming it's JSON with metadata)
    let contentData;
    try {
      contentData = JSON.parse(content);
    } catch {
      // If not JSON, treat as plain text
      contentData = {
        content: content,
        url: key,
        title: key.split('/').pop()
      };
    }

    // Simple chunking strategy (can be enhanced)
    const text = contentData.content || contentData.text || content;
    const chunkSize = 1000;
    const chunks = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunkText = text.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      
      chunks.push({
        id: `${key.replace(/[^a-zA-Z0-9]/g, '-')}-chunk-${chunkIndex}`,
        text: chunkText,
        metadata: {
          url: contentData.url || key,
          title: contentData.title || key,
          chunkIndex,
          totalChunks: Math.ceil(text.length / chunkSize),
          wordCount: chunkText.split(' ').length,
          source: 'diabetes.org'
        }
      });
    }

    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const command = new InvokeModelCommand({
      modelId: this.EMBEDDING_MODEL,
      body: JSON.stringify({ inputText: text })
    });

    const response = await this.bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.embedding;
  }

  private async createIndex(): Promise<void> {
    console.log('Creating OpenSearch index...');
    
    const indexBody = {
      settings: {
        index: {
          knn: true,
          'knn.algo_param.ef_search': 512
        }
      },
      mappings: {
        properties: {
          vector: {
            type: 'knn_vector',
            dimension: 1024,
            method: {
              name: 'hnsw',
              space_type: 'cosinesimil',
              engine: 'nmslib',
              parameters: {
                ef_construction: 512,
                m: 16
              }
            }
          },
          text: {
            type: 'text',
            analyzer: 'standard'
          },
          metadata: {
            type: 'object',
            properties: {
              url: { type: 'keyword' },
              title: { type: 'text' },
              chunkIndex: { type: 'integer' },
              totalChunks: { type: 'integer' },
              wordCount: { type: 'integer' },
              source: { type: 'keyword' }
            }
          }
        }
      }
    };

    await this.opensearchClient.indices.create({
      index: this.INDEX_NAME,
      body: indexBody
    });

    console.log('OpenSearch index created successfully');
  }

  private async bulkIndexDocuments(documents: VectorDocument[]): Promise<void> {
    const body = documents.flatMap(doc => [
      { index: { _index: this.INDEX_NAME, _id: doc.id } },
      {
        vector: doc.vector,
        text: doc.text,
        metadata: doc.metadata
      }
    ]);

    const response = await this.opensearchClient.bulk({ body });
    
    if (response.body.errors) {
      const errors = response.body.items.filter((item: any) => item.index?.error);
      console.error('Bulk indexing errors:', errors);
      throw new Error(`Bulk indexing failed with ${errors.length} errors`);
    }

    console.log(`Successfully indexed ${documents.length} documents`);
  }
}