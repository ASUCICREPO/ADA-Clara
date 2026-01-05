import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RAGService, RAGRequest } from '../../business/rag/rag.service';

/**
 * RAG Controller - Handles HTTP requests for RAG processing
 * 
 * This controller provides REST API endpoints for:
 * - RAG query processing with semantic search and response generation
 * - Health checks for RAG service components
 * - Request validation and error handling
 */
export class RAGController {
  constructor(private readonly ragService: RAGService) {}

  /**
   * Process RAG query
   * POST /rag/query
   */
  async processQuery(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      console.log('RAG query request received');

      // Parse request body
      const body = event.body ? JSON.parse(event.body) : {};
      
      // Validate required fields
      if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
        return this.createErrorResponse(400, 'Query is required and must be a non-empty string');
      }

      // Build RAG request
      const ragRequest: RAGRequest = {
        query: body.query.trim(),
        language: body.language || 'en',
        sessionId: body.sessionId,
        maxResults: body.maxResults || 5,
        confidenceThreshold: body.confidenceThreshold || 0.6
      };

      // Validate language
      if (ragRequest.language && !['en', 'es'].includes(ragRequest.language)) {
        return this.createErrorResponse(400, 'Language must be "en" or "es"');
      }

      // Validate maxResults
      if (ragRequest.maxResults && (ragRequest.maxResults < 1 || ragRequest.maxResults > 20)) {
        return this.createErrorResponse(400, 'maxResults must be between 1 and 20');
      }

      // Validate confidenceThreshold
      if (ragRequest.confidenceThreshold && (ragRequest.confidenceThreshold < 0 || ragRequest.confidenceThreshold > 1)) {
        return this.createErrorResponse(400, 'confidenceThreshold must be between 0 and 1');
      }

      console.log(`Processing RAG query: "${ragRequest.query}" (${ragRequest.language})`);

      // Process RAG query
      const response = await this.ragService.processQuery(ragRequest);

      // Check if response meets accuracy requirements (>95% = confidence > 0.95)
      const meetsAccuracyRequirement = response.confidence > 0.95;

      console.log(`RAG query processed successfully. Confidence: ${response.confidence.toFixed(2)}`);

      return {
        statusCode: 200,
        headers: this.getCorsHeaders(),
        body: JSON.stringify({
          ...response,
          meetsAccuracyRequirement,
          metadata: {
            vectorsBucket: process.env.VECTORS_BUCKET,
            vectorIndex: process.env.VECTOR_INDEX,
            embeddingModel: process.env.EMBEDDING_MODEL,
            generationModel: process.env.GENERATION_MODEL,
            processingTimeMs: response.processingTime
          }
        })
      };

    } catch (error) {
      console.error('RAG query processing failed:', error);
      return this.createErrorResponse(500, 'RAG query processing failed', error);
    }
  }

  /**
   * Health check endpoint
   * GET /rag/health
   */
  async healthCheck(): Promise<APIGatewayProxyResult> {
    try {
      console.log('🏥 RAG health check requested');

      const isHealthy = await this.ragService.healthCheck();

      const response = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'rag-processor',
        version: '1.0.0',
        checks: {
          ragService: isHealthy,
          embeddingGeneration: isHealthy,
          vectorSearch: isHealthy
        }
      };

      return {
        statusCode: isHealthy ? 200 : 503,
        headers: this.getCorsHeaders(),
        body: JSON.stringify(response)
      };

    } catch (error) {
      console.error('RAG health check failed:', error);
      return this.createErrorResponse(503, 'Health check failed', error);
    }
  }

  /**
   * Handle OPTIONS requests for CORS
   */
  async handleOptions(): Promise<APIGatewayProxyResult> {
    return {
      statusCode: 200,
      headers: this.getCorsHeaders(),
      body: ''
    };
  }

  /**
   * Route requests to appropriate handlers
   */
  async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const path = event.path;

    console.log(`📨 ${method} ${path}`);

    try {
      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return this.handleOptions();
      }

      // Route to appropriate handler
      if (method === 'POST' && (path === '/rag/query' || path.endsWith('/query'))) {
        return this.processQuery(event);
      }

      if (method === 'GET' && (path === '/rag/health' || path.endsWith('/health'))) {
        return this.healthCheck();
      }

      // Default route - treat as query for backward compatibility
      if (method === 'POST') {
        return this.processQuery(event);
      }

      return this.createErrorResponse(404, `Route not found: ${method} ${path}`);

    } catch (error) {
      console.error('Request handling failed:', error);
      return this.createErrorResponse(500, 'Internal server error', error);
    }
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(
    statusCode: number, 
    message: string, 
    error?: any
  ): APIGatewayProxyResult {
    const errorResponse = {
      error: message,
      timestamp: new Date().toISOString(),
      service: 'rag-processor'
    };

    // Add error details in development
    if (process.env.NODE_ENV === 'development' && error) {
      (errorResponse as any).details = error.message;
      (errorResponse as any).stack = error.stack;
    }

    return {
      statusCode,
      headers: this.getCorsHeaders(),
      body: JSON.stringify(errorResponse)
    };
  }

  /**
   * Get CORS headers
   */
  private getCorsHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    };
  }
}