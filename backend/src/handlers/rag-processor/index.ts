import { APIGatewayProxyEvent, APIGatewayProxyResult, Handler } from 'aws-lambda';
import { BedrockService } from '../../services/bedrock.service';
import { RAGService } from '../../business/rag/rag.service';
import { RAGController } from './rag.controller';

/**
 * RAG Processor Lambda Handler
 * 
 * This Lambda function implements RAG (Retrieval-Augmented Generation) query processing
 * for the ADA Clara chatbot system. It integrates with:
 * - S3 Vectors for semantic search
 * - Amazon Bedrock for response generation  
 * - Source citation and metadata preservation
 * 
 * Requirements: 1.4, 2.5 (>95% accuracy, source citations)
 */

let bedrockService: BedrockService;
let ragService: RAGService;
let ragController: RAGController;

/**
 * Initialize services (cold start optimization)
 */
function initializeServices(): void {
  if (!ragController) {
    console.log('Initializing RAG Processor services...');
    
    // Initialize core services
    bedrockService = new BedrockService({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    // Create RAG service with configuration
    ragService = new RAGService(
      bedrockService,
      {
        knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID || '',
        embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
        generationModel: process.env.GENERATION_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
        maxResults: parseInt(process.env.MAX_RESULTS || '5'),
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.95')
      }
    );

    ragController = new RAGController(ragService);
    
    console.log('RAG Processor services initialized');
  }
}

/**
 * Lambda handler function
 */
export const handler: Handler<APIGatewayProxyEvent, APIGatewayProxyResult> = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('RAG Query Processing Lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Initialize services on cold start
    initializeServices();

    // Handle the request
    return await ragController.handleRequest(event);

  } catch (error) {
    console.error('RAG processing failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'RAG query processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        service: 'rag-processor'
      })
    };
  }
};