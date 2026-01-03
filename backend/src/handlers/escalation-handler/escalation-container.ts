import { DynamoDBService } from '../../services/dynamodb-service';

export interface EscalationServiceConfig {
  region?: string;
  dynamoEndpoint?: string;
}

/**
 * Minimal Service Container for Escalation Handler
 * Only includes services needed for escalation functionality
 */
export class EscalationServiceContainer {
  private static instance: EscalationServiceContainer;
  
  public readonly dynamoService: DynamoDBService;
  
  private constructor(config: EscalationServiceConfig = {}) {
    this.dynamoService = new DynamoDBService({
      region: config.region,
      endpoint: config.dynamoEndpoint
    });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: EscalationServiceConfig): EscalationServiceContainer {
    if (!EscalationServiceContainer.instance) {
      EscalationServiceContainer.instance = new EscalationServiceContainer(config);
    }
    return EscalationServiceContainer.instance;
  }

  /**
   * Reset instance (useful for testing)
   */
  public static reset(): void {
    EscalationServiceContainer.instance = null as any;
  }

  /**
   * Health check for escalation services
   */
  async healthCheck(): Promise<{
    overall: boolean;
    services: {
      dynamodb: boolean;
    };
  }> {
    const [dynamoHealth] = await Promise.allSettled([
      this.dynamoService.healthCheck()
    ]);

    const services = {
      dynamodb: dynamoHealth.status === 'fulfilled' && dynamoHealth.value
    };

    return {
      overall: Object.values(services).every(status => status),
      services
    };
  }
}