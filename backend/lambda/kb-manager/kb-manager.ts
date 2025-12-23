import { Handler } from 'aws-lambda';
import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  GetKnowledgeBaseCommand,
  CreateDataSourceCommand,
  GetDataSourceCommand,
  StartIngestionJobCommand,
  GetIngestionJobCommand,
  ListIngestionJobsCommand,
  RetrieveCommand,
  RetrieveAndGenerateCommand
} from '@aws-sdk/client-bedrock-agent';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

interface KBManagerEvent {
  action: 'create-kb' | 'sync-content' | 'test-retrieval' | 'full-setup';
  knowledgeBaseId?: string;
  dataSourceId?: string;
  testQueries?: string[];
}

const bedrock = new BedrockAgentClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const VECTORS_BUCKET = process.env.VECTORS_BUCKET!;
const CRAWLER_FUNCTION = process.env.CRAWLER_FUNCTION!;

// Default test queries for diabetes content
const DEFAULT_TEST_QUERIES = [
  'What is type 1 diabetes?',
  'How do I manage my blood sugar levels?',
  'What foods should I eat with diabetes?',
  'What are the symptoms of diabetes?',
  'How can I prevent diabetes complications?'
];

export const handler: Handler = async (event: KBManagerEvent) => {
  console.log('KB Manager Event:', JSON.stringify(event, null, 2));

  try {
    switch (event.action) {
      case 'create-kb':
        return await createKnowledgeBase();
      
      case 'sync-content':
        return await syncContent(event.knowledgeBaseId!, event.dataSourceId!);
      
      case 'test-retrieval':
        return await testRetrieval(event.knowledgeBaseId!, event.testQueries || DEFAULT_TEST_QUERIES);
      
      case 'full-setup':
        return await fullSetup();
      
      default:
        throw new Error(`Unknown action: ${event.action}`);
    }
  } catch (error) {
    console.error('KB Manager Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'KB Manager failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function createKnowledgeBase() {
  console.log('Creating Bedrock Knowledge Base with S3 Vectors...');

  // Create Knowledge Base with S3 Vectors as vector store
  const createKBCommand = new CreateKnowledgeBaseCommand({
    name: 'ada-clara-diabetes-s3-vectors-kb',
    description: 'ADA Clara Knowledge Base using S3 Vectors for diabetes.org content',
    roleArn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/BedrockKnowledgeBaseRole`, // This role needs to be created
    knowledgeBaseConfiguration: {
      type: 'VECTOR',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1'
      }
    },
    storageConfiguration: {
      type: 'S3_VECTORS',
      s3VectorsConfiguration: {
        bucketArn: `arn:aws:s3:::${VECTORS_BUCKET}`,
        vectorIndexName: 'ada-clara-vector-index',
        fieldMapping: {
          vectorField: 'vector',
          textField: 'content',
          metadataField: 'metadata'
        }
      }
    }
  });

  const kbResponse = await bedrock.send(createKBCommand);
  const knowledgeBaseId = kbResponse.knowledgeBase!.knowledgeBaseId!;
  
  console.log('Knowledge Base created:', knowledgeBaseId);

  // Wait for knowledge base to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Create S3 Vectors Data Source
  console.log('Creating S3 Vectors Data Source...');

  const createDSCommand = new CreateDataSourceCommand({
    knowledgeBaseId,
    name: 'diabetes-org-s3-vectors-source',
    description: 'S3 Vectors data source for scraped diabetes.org content',
    dataSourceConfiguration: {
      type: 'S3_VECTORS',
      s3VectorsConfiguration: {
        bucketArn: `arn:aws:s3:::${CONTENT_BUCKET}`,
        inclusionPrefixes: ['vectors/'], // Updated to match S3 Vectors structure
        vectorIndexName: 'ada-clara-vector-index'
      }
    },
    vectorIngestionConfiguration: {
      chunkingConfiguration: {
        chunkingStrategy: 'NONE' // We're pre-chunking the content
      }
    }
  });

  const dsResponse = await bedrock.send(createDSCommand);
  const dataSourceId = dsResponse.dataSource!.dataSourceId!;

  console.log('Data Source created:', dataSourceId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Knowledge Base and Data Source created successfully',
      knowledgeBaseId,
      dataSourceId,
      nextSteps: [
        'Run crawler to populate content',
        'Sync data source to ingest content',
        'Test retrieval functionality'
      ]
    })
  };
}

async function syncContent(knowledgeBaseId: string, dataSourceId: string) {
  console.log(`Syncing content for KB: ${knowledgeBaseId}, DS: ${dataSourceId}`);

  // First, ensure we have content and embeddings
  const contentStats = await getContentStats();
  
  if (contentStats.chunks === 0) {
    // Run crawler first
    console.log('No content found, running crawler...');
    await runCrawler('full-crawl');
  }

  if (contentStats.embeddings === 0) {
    // Create embeddings
    console.log('No embeddings found, creating embeddings...');
    await runCrawler('create-embeddings');
  }

  // Start ingestion job
  const command = new StartIngestionJobCommand({
    knowledgeBaseId,
    dataSourceId,
    description: `Content sync at ${new Date().toISOString()}`
  });

  const response = await bedrock.send(command);
  const ingestionJobId = response.ingestionJob!.ingestionJobId!;

  console.log('Ingestion job started:', ingestionJobId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Content sync started',
      knowledgeBaseId,
      dataSourceId,
      ingestionJobId,
      contentStats,
      status: response.ingestionJob!.status
    })
  };
}

async function testRetrieval(knowledgeBaseId: string, queries: string[]) {
  console.log(`Testing retrieval for KB: ${knowledgeBaseId} with ${queries.length} queries`);

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        // Test retrieval
        const retrieveCommand = new RetrieveCommand({
          knowledgeBaseId,
          retrievalQuery: { text: query },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5
            }
          }
        });

        const retrieveResponse = await bedrock.send(retrieveCommand);

        // Test retrieval and generation
        const ragCommand = new RetrieveAndGenerateCommand({
          input: { text: query },
          retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
              knowledgeBaseId,
              modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'
            }
          }
        });

        const ragResponse = await bedrock.send(ragCommand);

        return {
          query,
          success: true,
          retrieval: {
            resultsCount: retrieveResponse.retrievalResults?.length || 0,
            topResults: retrieveResponse.retrievalResults?.slice(0, 3).map(r => ({
              score: r.score,
              content: r.content?.text?.substring(0, 200) + '...',
              source: r.location?.s3Location?.uri
            }))
          },
          generation: {
            answer: ragResponse.output?.text?.substring(0, 300) + '...',
            citations: ragResponse.citations?.map(c => ({
              content: c.retrievedReferences?.[0]?.content?.text?.substring(0, 150) + '...',
              source: c.retrievedReferences?.[0]?.location?.s3Location?.uri
            }))
          }
        };
      } catch (error) {
        console.error(`Query failed: ${query}`, error);
        return {
          query,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  const qualityMetrics = {
    successRate: (successful.length / results.length) * 100,
    averageResultsPerQuery: successful.reduce((sum, r) => sum + (r.retrieval?.resultsCount || 0), 0) / successful.length,
    queriesWithResults: successful.filter(r => (r.retrieval?.resultsCount || 0) > 0).length,
    queriesWithCitations: successful.filter(r => (r.generation?.citations?.length || 0) > 0).length
  };

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Retrieval testing completed',
      knowledgeBaseId,
      totalQueries: queries.length,
      successful: successful.length,
      failed: failed.length,
      qualityMetrics,
      results: successful,
      errors: failed.map(f => ({ query: f.query, error: f.error }))
    })
  };
}

async function fullSetup() {
  console.log('Running full S3 Vectors Knowledge Base setup...');

  try {
    // Step 1: Create Knowledge Base
    console.log('Step 1: Creating Knowledge Base...');
    const kbResult = await createKnowledgeBase();
    const kbData = JSON.parse(kbResult.body);

    // Step 2: Run crawler to get content
    console.log('Step 2: Running crawler...');
    await runCrawler('full-crawl');

    // Step 3: Sync content
    console.log('Step 3: Syncing content...');
    const syncResult = await syncContent(kbData.knowledgeBaseId, kbData.dataSourceId);
    const syncData = JSON.parse(syncResult.body);

    // Step 4: Wait for ingestion (in real scenario, this would be longer)
    console.log('Step 4: Waiting for ingestion...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    // Step 5: Test retrieval
    console.log('Step 5: Testing retrieval...');
    const testResult = await testRetrieval(kbData.knowledgeBaseId, DEFAULT_TEST_QUERIES.slice(0, 3));
    const testData = JSON.parse(testResult.body);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Full S3 Vectors Knowledge Base setup completed',
        steps: {
          knowledgeBase: kbData,
          sync: syncData,
          test: testData
        },
        recommendation: testData.qualityMetrics.successRate > 80 ? 
          'S3 Vectors Knowledge Base is working well - ready for production' :
          'S3 Vectors Knowledge Base needs tuning - check content quality',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Full setup failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Full setup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

async function runCrawler(action: string) {
  const command = new InvokeCommand({
    FunctionName: CRAWLER_FUNCTION,
    Payload: JSON.stringify({ action }),
  });

  const response = await lambda.send(command);
  
  if (response.Payload) {
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    if (result.statusCode !== 200) {
      throw new Error(`Crawler failed: ${result.body}`);
    }
    return JSON.parse(result.body);
  } else {
    throw new Error('No response from crawler');
  }
}

async function getContentStats() {
  const [chunksResponse, vectorsResponse] = await Promise.all([
    s3.send(new ListObjectsV2Command({
      Bucket: CONTENT_BUCKET,
      Prefix: 'chunks/',
    })),
    s3.send(new ListObjectsV2Command({
      Bucket: VECTORS_BUCKET,
      Prefix: 'vectors/', // Updated to S3 Vectors format
    }))
  ]);

  return {
    chunks: chunksResponse.Contents?.length || 0,
    embeddings: vectorsResponse.Contents?.length || 0
  };
}