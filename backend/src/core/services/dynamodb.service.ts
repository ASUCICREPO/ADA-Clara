import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export interface DynamoDBConfig {
  region?: string;
  endpoint?: string;
}

export class DynamoDBService {
  private client: DynamoDBDocumentClient;

  constructor(config: DynamoDBConfig = {}) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      ...(config.endpoint && { endpoint: config.endpoint })
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient);
  }

  /**
   * Put item in DynamoDB table
   */
  async putItem(tableName: string, item: Record<string, any>): Promise<void> {
    const command = new PutCommand({
      TableName: tableName,
      Item: item
    });
    
    await this.client.send(command);
  }

  /**
   * Get item from DynamoDB table
   */
  async getItem(tableName: string, key: Record<string, any>): Promise<Record<string, any> | null> {
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    });
    
    const result = await this.client.send(command);
    return result.Item || null;
  }

  /**
   * Query items from DynamoDB table
   */
  async queryItems(
    tableName: string, 
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: {
      indexName?: string;
      limit?: number;
      scanIndexForward?: boolean;
    } = {}
  ): Promise<Record<string, any>[]> {
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      IndexName: options.indexName,
      Limit: options.limit,
      ScanIndexForward: options.scanIndexForward
    });
    
    const result = await this.client.send(command);
    return result.Items || [];
  }

  /**
   * Scan items from DynamoDB table (use sparingly)
   */
  async scanItems(
    tableName: string,
    options: {
      filterExpression?: string;
      expressionAttributeValues?: Record<string, any>;
      limit?: number;
    } = {}
  ): Promise<Record<string, any>[]> {
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: options.filterExpression,
      ExpressionAttributeValues: options.expressionAttributeValues,
      Limit: options.limit
    });
    
    const result = await this.client.send(command);
    return result.Items || [];
  }

  /**
   * Health check - test DynamoDB connection
   */
  async healthCheck(tableName: string): Promise<boolean> {
    try {
      // Try to get a non-existent item to test connection
      // Use PK/SK pattern for tables that use it
      const testKey = tableName.includes('chat-sessions') || tableName.includes('analytics') 
        ? { PK: 'HEALTH#CHECK', SK: 'TEST' }
        : tableName.includes('conversations')
        ? { conversationId: 'health-check-test', timestamp: '2024-01-01T00:00:00.000Z' }
        : { id: 'health-check-test' };
        
      await this.getItem(tableName, testKey);
      return true;
    } catch (error) {
      console.error('DynamoDB health check failed:', error);
      return false;
    }
  }
}