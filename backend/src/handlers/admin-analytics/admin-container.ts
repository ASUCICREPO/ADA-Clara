import { DynamoDBService } from '../../services/dynamodb-service';

export interface AdminServiceConfig {
  region?: string;
  dynamoEndpoint?: string;
}

/**
 * Minimal Service Container for Admin Analytics
 * Only includes services needed for analytics functionality
 */
export class AdminServiceContainer {
  private static instance: AdminServiceContainer;
  
  public readonly dynamoService: DynamoDBService;
  
  private constructor(config: AdminServiceConfig = {}) {
    this.dynamoService = new DynamoDBService({
      region: config.region,
      endpoint: config.dynamoEndpoint
    });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: AdminServiceConfig): AdminServiceContainer {
    if (!AdminServiceContainer.instance) {
      AdminServiceContainer.instance = new AdminServiceContainer(config);
    }
    return AdminServiceContainer.instance;
  }

  /**
   * Reset instance (useful for testing)
   */
  public static reset(): void {
    AdminServiceContainer.instance = null as any;
  }

  /**
   * Health check for admin services
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