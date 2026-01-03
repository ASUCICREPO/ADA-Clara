import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockConfig {
  region?: string;
  modelId?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  inputTokenCount?: number;
}

export class BedrockService {
  private client: BedrockRuntimeClient;
  private defaultModelId: string;

  constructor(config: BedrockConfig = {}) {
    this.client = new BedrockRuntimeClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1'
    });
    
    this.defaultModelId = config.modelId || 'amazon.titan-embed-text-v2:0';
  }

  /**
   * Generate text embeddings using Bedrock
   */
  async generateEmbedding(
    text: string, 
    modelId?: string
  ): Promise<EmbeddingResponse> {
    const command = new InvokeModelCommand({
      modelId: modelId || this.defaultModelId,
      body: JSON.stringify({
        inputText: text,
        dimensions: 1024, // Titan V2 max dimensions
        normalize: true
      })
    });

    const response = await this.client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    return {
      embedding: result.embedding,
      inputTokenCount: result.inputTokenCount
    };
  }

  /**
   * Generate text using Bedrock (for future use)
   */
  async generateText(
    prompt: string,
    modelId: string = 'anthropic.claude-3-sonnet-20240229-v1:0',
    options: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    } = {}
  ): Promise<string> {
    const command = new InvokeModelCommand({
      modelId,
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const response = await this.client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    return result.content[0].text;
  }

  /**
   * Health check - test Bedrock connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Generate a simple embedding to test connection
      await this.generateEmbedding('health check test');
      return true;
    } catch (error) {
      console.error('Bedrock health check failed:', error);
      return false;
    }
  }
}