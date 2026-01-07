/**
 * RAG Processor Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /query - Process RAG queries using Bedrock Knowledge Base
 * - GET /query/health - Health check
 */

const { BedrockAgentRuntimeClient, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Initialize AWS clients
const bedrockAgent = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });
const bedrockRuntime = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID || '';
const GENERATION_MODEL = process.env.GENERATION_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');

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

    // STEP 1: Retrieve relevant documents with scores from Knowledge Base
    console.log('Step 1: Retrieving documents from Knowledge Base...');
    const retrieveCommand = new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: {
        text: query
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: maxResults
          // Note: HYBRID search not supported for S3 Vectors, using default SEMANTIC search
        }
      }
    });

    const retrieveResponse = await bedrockAgent.send(retrieveCommand);
    console.log(`Retrieved ${retrieveResponse.retrievalResults?.length || 0} documents`);

    // STEP 2: Extract sources with relevance scores
    const sources = [];
    const retrievalResults = retrieveResponse.retrievalResults || [];

    for (const result of retrievalResults) {
      if (result.content?.text && result.location?.s3Location?.uri) {
        // Bedrock Retrieve API returns score at root level of each result
        const relevanceScore = result.score || 0;

        sources.push({
          url: result.location.s3Location.uri,
          title: extractTitleFromUri(result.location.s3Location.uri),
          excerpt: result.content.text.length > 200
            ? result.content.text.substring(0, 200) + '...'
            : result.content.text,
          relevanceScore: relevanceScore,
          fullContent: result.content.text // Keep full content for context
        });
      }
    }

    // STEP 3: Calculate confidence using Bedrock's relevance scores
    let totalRelevanceScore = 0;
    let validSourceCount = 0;
    let topScore = 0;

    for (const source of sources) {
      if (source.relevanceScore > 0) {
        totalRelevanceScore += source.relevanceScore;
        validSourceCount++;
        topScore = Math.max(topScore, source.relevanceScore);
      }
    }

    // Use top score as confidence (best source determines quality)
    // Fall back to average if no valid scores
    const avgConfidence = validSourceCount > 0
      ? totalRelevanceScore / validSourceCount
      : 0;
    const confidence = topScore > 0 ? topScore : avgConfidence;

    // Sort sources by relevance (best first)
    sources.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Log detailed confidence analysis
    console.log(`=== CONFIDENCE ANALYSIS ===`);
    console.log(`Top Score: ${topScore.toFixed(3)}, Avg Score: ${avgConfidence.toFixed(3)}, Sources: ${validSourceCount}`);
    console.log(`Final Confidence: ${confidence.toFixed(3)} (threshold: ${confidenceThreshold})`);
    if (validSourceCount > 0) {
      sources.slice(0, 3).forEach((s, i) => {
        console.log(`  Source ${i + 1}: ${s.relevanceScore.toFixed(3)} - ${s.title}`);
      });
    }

    // STEP 4: Filter sources by minimum relevance score (0.5 threshold for quality)
    const MIN_RELEVANCE_SCORE = 0.5;
    const filteredSources = sources.filter(s => s.relevanceScore >= MIN_RELEVANCE_SCORE);
    console.log(`Filtered to ${filteredSources.length} sources above ${MIN_RELEVANCE_SCORE} relevance`);

    // STEP 5: Generate response using Claude with filtered context
    let answer;
    if (filteredSources.length === 0) {
      // No high-quality sources found
      console.log('No sources meet minimum relevance threshold - returning fallback response');
      answer = language === 'es'
        ? 'Lo siento, no encontré información confiable para responder a tu pregunta. Por favor, reformula tu pregunta o contacta a un profesional de la salud.'
        : 'I apologize, but I could not find reliable information to answer your question. Please rephrase your question or consult with a healthcare professional.';
    } else {
      console.log('Step 2: Generating response with Claude...');

      // Build context from filtered sources
      const context = filteredSources.map((source, idx) =>
        `Source ${idx + 1} (Relevance: ${source.relevanceScore.toFixed(2)}):\n${source.fullContent}`
      ).join('\n\n---\n\n');

      const prompt = language === 'es'
        ? `Eres un asistente médico especializado en diabetes. Responde la siguiente pregunta usando SOLO la información proporcionada. Si la información no es suficiente, indícalo claramente.

Contexto de fuentes verificadas:
${context}

Pregunta: ${query}

Proporciona una respuesta precisa, clara y basada únicamente en las fuentes proporcionadas. Cita las fuentes cuando sea apropiado.`
        : `You are a medical assistant specialized in diabetes. Answer the following question using ONLY the provided information. If the information is insufficient, clearly state that.

Context from verified sources:
${context}

Question: ${query}

Provide an accurate, clear response based solely on the provided sources. Cite sources when appropriate.`;

      const invokeCommand = new InvokeModelCommand({
        modelId: GENERATION_MODEL,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1024,
          temperature: 0.3, // Low temperature for factual responses
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      const generateResponse = await bedrockRuntime.send(invokeCommand);
      const responseBody = JSON.parse(new TextDecoder().decode(generateResponse.body));
      answer = responseBody.content[0].text || 'I apologize, but I could not generate a response to your question.';

      console.log(`Generated response: ${answer.substring(0, 100)}...`);
    }

    const processingTime = Date.now() - startTime;

    // Remove fullContent from sources before returning (was only needed for generation)
    sources.forEach(source => delete source.fullContent);

    const ragResponse = {
      response: answer,
      confidence: confidence,
      sources: sources,
      language: language,
      sessionId: sessionId,
      processingTime: processingTime,
      meetsAccuracyRequirement: confidence >= confidenceThreshold && validSourceCount >= 1,
      metadata: {
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        generationModel: GENERATION_MODEL,
        numberOfSources: validSourceCount,
        totalSourcesRetrieved: sources.length,
        topRelevanceScore: topScore,
        avgRelevanceScore: avgConfidence,
        confidenceThreshold: confidenceThreshold,
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

    // Test Knowledge Base access with a simple retrieve query
    const testCommand = new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: {
        text: 'What is diabetes?'
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 1
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