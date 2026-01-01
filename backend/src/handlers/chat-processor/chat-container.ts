import { DynamoDBService } from '../../core/services/dynamodb.service';
import { BedrockService } from '../../core/services/bedrock.service';
import { ComprehendService } from '../../core/services/comprehend.service';

export interface ChatServiceConfig {
  region?: string;
  dynamoEndpoint?: string;
  bedrockModelId?: string;
}

/**
 * Minimal Service Container for Chat Processor
 * Only includes services needed for chat functionality
 */
export class ChatServiceContainer {
  private static instance: ChatServiceContainer;
  
  public readonly dynamoService: DynamoDBService;
  public readonly bedrockService: BedrockService;
  public readonly comprehendService: ComprehendService;
  
  private constructor(config: ChatServiceConfig = {}) {
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
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: ChatServiceConfig): ChatServiceContainer {
    if (!ChatServiceContainer.instance) {
      ChatServiceContainer.instance = new ChatServiceContainer(config);
    }
    return ChatServiceContainer.instance;
  }

  /**
   * Reset instance (useful for testing)
   */
  public static reset(): void {
    ChatServiceContainer.instance = null as any;
  }

  /**
   * Health check for chat services
   */
  async healthCheck(): Promise<{
    overall: boolean;
    services: {
      dynamodb: boolean;
      bedrock: boolean;
      comprehend: boolean;
    };
  }> {
    const [dynamoHealth, bedrockHealth, comprehendHealth] = await Promise.allSettled([
      this.dynamoService.healthCheck(process.env.SESSIONS_TABLE || 'ada-clara-chat-sessions'),
      this.bedrockService.healthCheck(),
      this.comprehendService.healthCheck()
    ]);

    const services = {
      dynamodb: dynamoHealth.status === 'fulfilled' && dynamoHealth.value,
      bedrock: bedrockHealth.status === 'fulfilled' && bedrockHealth.value,
      comprehend: comprehendHealth.status === 'fulfilled' && comprehendHealth.value
    };

    return {
      overall: Object.values(services).every(status => status),
      services
    };
  }
}