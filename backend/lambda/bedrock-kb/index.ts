/**
 * Bedrock Knowledge Base GA Integration Lambda
 * 
 * This Lambda function tests and validates the integration between
 * Bedrock Knowledge Base and S3 Vectors GA, including:
 * - Knowledge Base indexing with GA vector storage
 * - RAG query performance with sub-100ms latency
 * - Citation metadata preservation through GA pipeline
 * - End-to-end content workflow validation
 */

import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  BedrockAgentClient, 
  StartIngestionJobCommand,
  GetIngestionJobCommand,
  ListIngestionJobsCommand
} from '@aws-sdk/client-bedrock-agent';
import { 
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveAndGenerateCommand
} from '@aws-sdk/client-bedrock-agent-runtime';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';

interface KnowledgeBaseConfig {
  knowledgeBaseId: string;
  dataSourceId: string;
  embeddingModel: string;
  generationModel: string;
}

interface RAGTestResult {
  query: string;
  retrievalLatency: number;
  generationLatency: number;
  totalLatency: number;
  retrievedSources: number;
  citations: any[];
  answer: string;
  meetsLatencyTarget: boolean;
}

interface IngestionTestResult {
  jobId: string;
  status: string;
  documentsProcessed: number;
  vectorsCreated: number;
  duration: number;
  success: boolean;
  errors?: string[];
}

class KnowledgeBaseGATester {
  private bedrockAgent: BedrockAgentClient;
  private bedrockAgentRuntime: BedrockAgentRuntimeClient;
  private bedrockRuntime: BedrockRuntimeClient;
  private config: KnowledgeBaseConfig;

  constructor() {
    this.bedrockAgent = new BedrockAgentClient({ region: 'us-east-1' });
    this.bedrockAgentRuntime = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
    this.bedrockRuntime = new BedrockRuntimeClient({ region: 'us-east-1' });
    
    this.config = {
      knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID!,
      dataSourceId: process.env.DATA_SOURCE_ID!,
      embeddingModel: process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
      generationModel: process.env.GENERATION_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0'
    };
  }

  /**
   * Test Knowledge Base indexing with GA S3 Vectors
   */
  async testKnowledgeBaseIndexing(): Promise<IngestionTestResult> {
    console.log('🔄 Testing Knowledge Base indexing with GA S3 Vectors...');
    
    try {
      const startTime = Date.now();
      
      // Start ingestion job
      const startJobCommand = new StartIngestionJobCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        dataSourceId: this.config.dataSourceId,
        description: 'GA S3 Vectors indexing test'
      });
      
      const jobResponse = await this.bedrockAgent.send(startJobCommand);
      const jobId = jobResponse.ingestionJob?.ingestionJobId!;
      
      console.log(`📋 Started ingestion job: ${jobId}`);
      
      // Poll for job completion
      let status = 'IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max
      
      while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const getJobCommand = new GetIngestionJobCommand({
          knowledgeBaseId: this.config.knowledgeBaseId,
          dataSourceId: this.config.dataSourceId,
          ingestionJobId: jobId
        });
        
        const jobStatus = await this.bedrockAgent.send(getJobCommand);
        status = jobStatus.ingestionJob?.status || 'UNKNOWN';
        attempts++;
        
        console.log(`📊 Ingestion job status: ${status} (attempt ${attempts}/${maxAttempts})`);
      }
      
      const duration = Date.now() - startTime;
      
      // Get final job details
      const finalJobCommand = new GetIngestionJobCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        dataSourceId: this.config.dataSourceId,
        ingestionJobId: jobId
      });
      
      const finalJob = await this.bedrockAgent.send(finalJobCommand);
      const job = finalJob.ingestionJob!;
      
      return {
        jobId,
        status: job.status!,
        documentsProcessed: job.statistics?.numberOfDocumentsScanned || 0,
        vectorsCreated: job.statistics?.numberOfNewDocumentsIndexed || 0,
        duration,
        success: job.status === 'COMPLETE',
        errors: job.failureReasons || []
      };
      
    } catch (error: any) {
      console.error('❌ Knowledge Base indexing test failed:', error);
      return {
        jobId: 'failed',
        status: 'FAILED',
        documentsProcessed: 0,
        vectorsCreated: 0,
        duration: 0,
        success: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Test RAG query performance with GA S3 Vectors
   */
  async testRAGPerformance(query: string): Promise<RAGTestResult> {
    console.log(`🔍 Testing RAG performance for query: "${query}"`);
    
    try {
      const totalStartTime = Date.now();
      
      // Step 1: Retrieval test
      const retrievalStartTime = Date.now();
      
      const retrieveCommand = new RetrieveCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        retrievalQuery: {
          text: query
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 10, // GA supports up to 100
            overrideSearchType: 'HYBRID' // Vector + keyword search
          }
        }
      });
      
      const retrievalResponse = await this.bedrockAgentRuntime.send(retrieveCommand);
      const retrievalLatency = Date.now() - retrievalStartTime;
      
      console.log(`📥 Retrieval completed in ${retrievalLatency}ms`);
      console.log(`📄 Retrieved ${retrievalResponse.retrievalResults?.length || 0} sources`);
      
      // Step 2: Generation test
      const generationStartTime = Date.now();
      
      const ragCommand = new RetrieveAndGenerateCommand({
        input: {
          text: query
        },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: this.config.knowledgeBaseId,
            modelArn: `arn:aws:bedrock:us-east-1::foundation-model/${this.config.generationModel}`,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 5,
                overrideSearchType: 'HYBRID'
              }
            }
          }
        }
      });
      
      const ragResponse = await this.bedrockAgentRuntime.send(ragCommand);
      const generationLatency = Date.now() - generationStartTime;
      const totalLatency = Date.now() - totalStartTime;
      
      console.log(`🤖 Generation completed in ${generationLatency}ms`);
      console.log(`⏱️ Total RAG latency: ${totalLatency}ms`);
      
      return {
        query,
        retrievalLatency,
        generationLatency,
        totalLatency,
        retrievedSources: retrievalResponse.retrievalResults?.length || 0,
        citations: ragResponse.citations || [],
        answer: ragResponse.output?.text || '',
        meetsLatencyTarget: retrievalLatency < 100 // GA target: sub-100ms retrieval
      };
      
    } catch (error: any) {
      console.error('❌ RAG performance test failed:', error);
      return {
        query,
        retrievalLatency: -1,
        generationLatency: -1,
        totalLatency: -1,
        retrievedSources: 0,
        citations: [],
        answer: `Error: ${error.message}`,
        meetsLatencyTarget: false
      };
    }
  }

  /**
   * Test citation metadata preservation through GA pipeline
   */
  async testCitationMetadata(query: string): Promise<any> {
    console.log(`📚 Testing citation metadata preservation for: "${query}"`);
    
    try {
      const ragCommand = new RetrieveAndGenerateCommand({
        input: {
          text: query
        },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: this.config.knowledgeBaseId,
            modelArn: `arn:aws:bedrock:us-east-1::foundation-model/${this.config.generationModel}`,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 3
              }
            }
          }
        }
      });
      
      const response = await this.bedrockAgentRuntime.send(ragCommand);
      
      // Analyze citation metadata
      const citations = response.citations || [];
      const citationAnalysis = citations.map((citation: any, index: number) => {
        const retrievedRefs = citation.retrievedReferences || [];
        return {
          citationIndex: index,
          referencesCount: retrievedRefs.length,
          references: retrievedRefs.map((ref: any) => ({
            content: ref.content?.text?.substring(0, 100) + '...',
            location: ref.location,
            metadata: ref.metadata,
            hasUrl: !!ref.location?.s3Location?.uri,
            hasMetadata: !!ref.metadata && Object.keys(ref.metadata).length > 0
          }))
        };
      });
      
      console.log(`📋 Found ${citations.length} citations with metadata`);
      
      return {
        query,
        totalCitations: citations.length,
        citationAnalysis,
        metadataPreserved: citationAnalysis.every((c: any) => 
          c.references.every((r: any) => r.hasUrl && r.hasMetadata)
        ),
        answer: response.output?.text || ''
      };
      
    } catch (error: any) {
      console.error('❌ Citation metadata test failed:', error);
      return {
        query,
        totalCitations: 0,
        citationAnalysis: [],
        metadataPreserved: false,
        answer: `Error: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Test Knowledge Base access to GA vector indices
   */
  async testVectorIndexAccess(): Promise<any> {
    console.log('🔗 Testing Knowledge Base access to GA vector indices...');
    
    try {
      // Test with a simple retrieval query
      const testQuery = 'diabetes management';
      
      const retrieveCommand = new RetrieveCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        retrievalQuery: {
          text: testQuery
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5
          }
        }
      });
      
      const startTime = Date.now();
      const response = await this.bedrockAgentRuntime.send(retrieveCommand);
      const latency = Date.now() - startTime;
      
      const results = response.retrievalResults || [];
      
      console.log(`✅ Vector index access successful: ${results.length} results in ${latency}ms`);
      
      return {
        accessSuccessful: true,
        resultsReturned: results.length,
        queryLatency: latency,
        meetsLatencyTarget: latency < 100,
        sampleResults: results.slice(0, 2).map((result: any) => ({
          score: result.score,
          hasContent: !!result.content?.text,
          hasLocation: !!result.location,
          hasMetadata: !!result.metadata,
          contentPreview: result.content?.text?.substring(0, 100) + '...'
        }))
      };
      
    } catch (error: any) {
      console.error('❌ Vector index access test failed:', error);
      return {
        accessSuccessful: false,
        resultsReturned: 0,
        queryLatency: -1,
        meetsLatencyTarget: false,
        error: error.message
      };
    }
  }

  /**
   * List recent ingestion jobs for monitoring
   */
  async listIngestionJobs(): Promise<any> {
    try {
      const command = new ListIngestionJobsCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        dataSourceId: this.config.dataSourceId,
        maxResults: 10
      });
      
      const response = await this.bedrockAgent.send(command);
      
      return {
        totalJobs: response.ingestionJobSummaries?.length || 0,
        jobs: response.ingestionJobSummaries?.map(job => ({
          jobId: job.ingestionJobId,
          status: job.status,
          startedAt: job.startedAt,
          updatedAt: job.updatedAt,
          description: job.description
        })) || []
      };
      
    } catch (error: any) {
      console.error('❌ Failed to list ingestion jobs:', error);
      return {
        totalJobs: 0,
        jobs: [],
        error: error.message
      };
    }
  }
}

/**
 * Lambda handler
 */
export const handler: Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('🚀 Bedrock Knowledge Base GA Integration Test started');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = event.body ? JSON.parse(event.body) : event;
    const action = body.action || 'test-kb-access';
    
    const tester = new KnowledgeBaseGATester();

    if (action === 'test-kb-access') {
      // Test basic Knowledge Base access to GA vector indices
      console.log('🧪 Testing Knowledge Base access to GA vector indices...');
      
      const accessResult = await tester.testVectorIndexAccess();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Knowledge Base GA vector index access test completed',
          accessResult,
          gaFeatures: {
            vectorBackend: 'S3_VECTORS_GA',
            maxResults: '100 per query',
            queryLatency: 'sub-100ms target',
            scaleLimit: '2 billion vectors per index',
            embeddingModel: 'amazon.titan-embed-text-v2:0'
          }
        })
      };
      
    } else if (action === 'test-kb-indexing') {
      // Test Knowledge Base indexing with GA S3 Vectors
      console.log('🧪 Testing Knowledge Base indexing with GA S3 Vectors...');
      
      const indexingResult = await tester.testKnowledgeBaseIndexing();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Knowledge Base GA indexing test completed',
          indexingResult,
          gaIndexingFeatures: {
            vectorStorage: 'S3 Vectors GA backend',
            scaleCapability: '2 billion vectors per index',
            processingSpeed: 'Optimized for GA throughput',
            metadataSupport: 'Enhanced GA metadata handling'
          }
        })
      };
      
    } else if (action === 'test-rag-performance') {
      // Test RAG query performance with GA
      console.log('🧪 Testing RAG performance with GA S3 Vectors...');
      
      const query = body.query || 'What are the symptoms of type 1 diabetes?';
      const ragResult = await tester.testRAGPerformance(query);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'RAG performance test with GA completed',
          ragResult,
          gaPerformanceFeatures: {
            retrievalLatency: 'sub-100ms target',
            maxResults: '100 per query',
            searchType: 'Hybrid (vector + keyword)',
            embeddingModel: 'Titan V2 (1024 dimensions)'
          }
        })
      };
      
    } else if (action === 'test-citation-metadata') {
      // Test citation metadata preservation
      console.log('🧪 Testing citation metadata preservation...');
      
      const query = body.query || 'How to manage blood sugar levels?';
      const citationResult = await tester.testCitationMetadata(query);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Citation metadata preservation test completed',
          citationResult,
          gaMetadataFeatures: {
            metadataKeys: '50 max per vector',
            metadataSize: '2KB max per vector',
            preservationThroughPipeline: 'Full metadata preservation',
            citationAccuracy: 'Enhanced with GA reliability'
          }
        })
      };
      
    } else if (action === 'list-ingestion-jobs') {
      // List recent ingestion jobs
      console.log('🧪 Listing recent ingestion jobs...');
      
      const jobsResult = await tester.listIngestionJobs();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Ingestion jobs list retrieved',
          jobsResult
        })
      };
      
    } else if (action === 'comprehensive-test') {
      // Run comprehensive Knowledge Base GA integration test
      console.log('🧪 Running comprehensive Knowledge Base GA integration test...');
      
      const results = {
        vectorIndexAccess: await tester.testVectorIndexAccess(),
        ragPerformance: await tester.testRAGPerformance('What is diabetes and how is it treated?'),
        citationMetadata: await tester.testCitationMetadata('Diabetes prevention strategies'),
        ingestionJobs: await tester.listIngestionJobs()
      };
      
      // Calculate overall success
      const overallSuccess = results.vectorIndexAccess.accessSuccessful &&
                           results.ragPerformance.meetsLatencyTarget &&
                           results.citationMetadata.metadataPreserved;
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Comprehensive Knowledge Base GA integration test completed',
          overallSuccess,
          results,
          gaIntegrationSummary: {
            vectorBackend: 'S3 Vectors GA',
            accessSuccessful: results.vectorIndexAccess.accessSuccessful,
            performanceTarget: results.ragPerformance.meetsLatencyTarget,
            metadataPreserved: results.citationMetadata.metadataPreserved,
            totalIngestionJobs: results.ingestionJobs.totalJobs
          }
        })
      };
      
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid action. Supported actions: test-kb-access, test-kb-indexing, test-rag-performance, test-citation-metadata, list-ingestion-jobs, comprehensive-test',
          supportedActions: [
            'test-kb-access - Test Knowledge Base access to GA vector indices',
            'test-kb-indexing - Test Knowledge Base indexing with GA S3 Vectors',
            'test-rag-performance - Test RAG query performance with GA',
            'test-citation-metadata - Test citation metadata preservation',
            'list-ingestion-jobs - List recent ingestion jobs',
            'comprehensive-test - Run all Knowledge Base GA integration tests'
          ]
        })
      };
    }
    
  } catch (error: any) {
    console.error('❌ Knowledge Base GA integration test failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        message: 'Knowledge Base GA integration test failed'
      })
    };
  }
};