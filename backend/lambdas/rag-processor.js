/**
 * RAG Processor Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /query - Process RAG queries using Bedrock Knowledge Base
 * - GET /query/health - Health check
 */

const { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } = require('@aws-sdk/client-bedrock-agent-runtime');

// Initialize AWS clients
const bedrockAgent = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID || '';
const GENERATION_MODEL = process.env.GENERATION_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.95');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('RAG processor invoked:', JSON.stringify(event, null, 2));

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Route requests
    if (method === 'POST' && (path === '/query' || path.endsWith('/query'))) {
      return await processQuery(event);
    } else if (method === 'GET' && (path === '/query/health' || path === '/health')) {
      return await healthCheck();
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /query',
          'GET /query/health'
        ]
      });
    }

  } catch (error) {
    console.error('RAG processor error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    });
  }
};

/**
 * Process RAG query using Bedrock Knowledge Base
 */
async function processQuery(event) {
  try {
    console.log('Processing RAG query...');

    // Parse request body
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      return createResponse(400, {
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      });
    }

    // Validate required fields
    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return createResponse(400, {
        error: 'Query is required',
        message: 'Query must be a non-empty string'
      });
    }

    // Extract parameters with defaults
    const query = body.query.trim();
    const language = body.language || 'en';
    const sessionId = body.sessionId || `session-${Date.now()}`;
    const maxResults = body.maxResults || 5;
    const confidenceThreshold = body.confidenceThreshold || CONFIDENCE_THRESHOLD;

    // Validate parameters
    if (language && !['en', 'es'].includes(language)) {
      return createResponse(400, {
        error: 'Invalid language',
        message: 'Language must be "en" or "es"'
      });
    }

    if (maxResults < 1 || maxResults > 20) {
      return createResponse(400, {
        error: 'Invalid maxResults',
        message: 'maxResults must be between 1 and 20'
      });
    }

    if (confidenceThreshold < 0 || confidenceThreshold > 1) {
      return createResponse(400, {
        error: 'Invalid confidenceThreshold',
        message: 'confidenceThreshold must be between 0 and 1'
      });
    }

    console.log(`Processing query: "${query}" (${language})`);

    const startTime = Date.now();

    // Call Bedrock Knowledge Base
    const command = new RetrieveAndGenerateCommand({
      input: {
        text: query
      },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-west-2'}::foundation-model/${GENERATION_MODEL}`,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: maxResults,
              overrideSearchType: 'HYBRID' // Combines vector + keyword search
            }
          }
        }
      }
    });

    const response = await bedrockAgent.send(command);
    const processingTime = Date.now() - startTime;

    // Extract response data
    const answer = response.output?.text || 'I apologize, but I could not generate a response to your question.';
    
    // Extract sources from citations
    const sources = [];
    if (response.citations && response.citations.length > 0) {
      for (const citation of response.citations) {
        if (citation.retrievedReferences) {
          for (const ref of citation.retrievedReferences) {
            if (ref.content?.text && ref.location?.s3Location?.uri) {
              sources.push({
                url: ref.location.s3Location.uri,
                title: extractTitleFromUri(ref.location.s3Location.uri),
                excerpt: ref.content.text.substring(0, 200) + '...',
                relevanceScore: ref.metadata?.score || 0.8
              });
            }
          }
        }
      }
    }

    // Calculate confidence based on number of sources and content quality
    let confidence = 0.5; // Base confidence
    if (sources.length > 0) {
      confidence = Math.min(0.95, 0.6 + (sources.length * 0.1)); // Increase confidence with more sources
    }
    if (answer.length > 100) {
      confidence += 0.1; // Boost for longer, more detailed answers
    }

    const ragResponse = {
      response: answer,
      confidence: confidence,
      sources: sources,
      language: language,
      sessionId: sessionId,
      processingTime: processingTime,
      meetsAccuracyRequirement: confidence > CONFIDENCE_THRESHOLD,
      metadata: {
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        generationModel: GENERATION_MODEL,
        numberOfSources: sources.length,
        queryLength: query.length
      }
    };

    console.log(`RAG query processed successfully. Confidence: ${confidence.toFixed(2)}, Sources: ${sources.length}`);

    return createResponse(200, ragResponse);

  } catch (error) {
    console.error('Error processing RAG query:', error);
    
    // Handle specific Bedrock errors
    if (error.name === 'ValidationException') {
      return createResponse(400, {
        error: 'Invalid request',
        message: error.message || 'Request validation failed'
      });
    } else if (error.name === 'ResourceNotFoundException') {
      return createResponse(404, {
        error: 'Knowledge base not found',
        message: 'The specified knowledge base could not be found'
      });
    } else if (error.name === 'AccessDeniedException') {
      return createResponse(403, {
        error: 'Access denied',
        message: 'Insufficient permissions to access the knowledge base'
      });
    }

    return createResponse(500, {
      error: 'RAG query processing failed',
      message: error.message || 'Unknown error occurred'
    });
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    console.log('Performing RAG health check...');

    // Test Knowledge Base access with a simple query
    const testCommand = new RetrieveAndGenerateCommand({
      input: {
        text: 'What is diabetes?'
      },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-west-2'}::foundation-model/${GENERATION_MODEL}`,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 1
            }
          }
        }
      }
    });

    await bedrockAgent.send(testCommand);

    return createResponse(200, {
      status: 'healthy',
      service: 'rag-processor',
      timestamp: new Date().toISOString(),
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      generationModel: GENERATION_MODEL,
      confidenceThreshold: CONFIDENCE_THRESHOLD
    });

  } catch (error) {
    console.error('RAG health check failed:', error);
    return createResponse(503, {
      status: 'unhealthy',
      service: 'rag-processor',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error',
      knowledgeBaseId: KNOWLEDGE_BASE_ID
    });
  }
}

/**
 * Extract title from S3 URI
 */
function extractTitleFromUri(uri) {
  try {
    // Extract filename from S3 URI and make it readable
    const filename = uri.split('/').pop() || 'Unknown Source';
    return filename
      .replace(/\.txt$/, '')
      .replace(/https?-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  } catch (error) {
    return 'Diabetes Information';
  }
}

/**
 * Create standardized API response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}