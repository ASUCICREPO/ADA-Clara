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
  DataSourceConfiguration,
  WebDataSourceConfiguration,
  UrlConfiguration,
  SeedUrl,
  WebCrawlerLimits, // Updated from CrawlerLimits
  ChunkingConfiguration,
  FixedSizeChunkingConfiguration
} from '@aws-sdk/client-bedrock-agent';

interface BedrockManagerEvent {
  action: 'create' | 'sync' | 'status' | 'test';
  knowledgeBaseId?: string;
  dataSourceId?: string;
  testUrls?: string[];
}

const client = new BedrockAgentClient({ region: process.env.AWS_REGION || 'us-east-1' });

const KNOWLEDGE_BASE_ROLE_ARN = process.env.KNOWLEDGE_BASE_ROLE_ARN!;
const VECTOR_COLLECTION_ARN = process.env.VECTOR_COLLECTION_ARN!;
const VECTOR_COLLECTION_ID = process.env.VECTOR_COLLECTION_ID!;

// Seed URLs for diabetes.org crawling
const SEED_URLS: SeedUrl[] = [
  { url: 'https://diabetes.org/about-diabetes/type-1' },
  { url: 'https://diabetes.org/about-diabetes/type-2' },
  { url: 'https://diabetes.org/about-diabetes/prediabetes' },
  { url: 'https://diabetes.org/living-with-diabetes' },
  { url: 'https://diabetes.org/food-nutrition' },
  { url: 'https://diabetes.org/health-wellness' },
  { url: 'https://diabetes.org/tools-resources' },
];

export const handler: Handler = async (event: BedrockManagerEvent) => {
  console.log('Bedrock Manager Event:', JSON.stringify(event, null, 2));

  try {
    switch (event.action) {
      case 'create':
        return await createKnowledgeBaseAndDataSource();
      
      case 'sync':
        return await syncDataSource(event.knowledgeBaseId!, event.dataSourceId!);
      
      case 'status':
        return await getIngestionStatus(event.knowledgeBaseId!, event.dataSourceId!);
      
      case 'test':
        return await testWebCrawler(event.testUrls || []);
      
      default:
        throw new Error(`Unknown action: ${event.action}`);
    }
  } catch (error) {
    console.error('Bedrock Manager Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Bedrock Manager failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      })
    };
  }
};

async function createKnowledgeBaseAndDataSource() {
  console.log('Creating Bedrock Knowledge Base...');

  // Create Knowledge Base
  const createKBCommand = new CreateKnowledgeBaseCommand({
    name: 'ada-clara-diabetes-kb',
    description: 'Knowledge base for ADA Clara chatbot containing diabetes.org content',
    roleArn: KNOWLEDGE_BASE_ROLE_ARN,
    knowledgeBaseConfiguration: {
      type: 'VECTOR',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1'
      }
    },
    storageConfiguration: {
      type: 'OPENSEARCH_SERVERLESS',
      opensearchServerlessConfiguration: {
        collectionArn: VECTOR_COLLECTION_ARN,
        vectorIndexName: 'diabetes-content-index',
        fieldMapping: {
          vectorField: 'vector',
          textField: 'text',
          metadataField: 'metadata'
        }
      }
    }
  });

  const kbResponse = await client.send(createKBCommand);
  const knowledgeBaseId = kbResponse.knowledgeBase!.knowledgeBaseId!;
  
  console.log('Knowledge Base created:', knowledgeBaseId);

  // Wait a bit for the knowledge base to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Create Web Crawler Data Source
  console.log('Creating Web Crawler Data Source...');

  const webConfig: WebDataSourceConfiguration = {
    sourceConfiguration: {
      urlConfiguration: {
        seedUrls: SEED_URLS
      }
    },
    crawlerConfiguration: {
      crawlerLimits: {
        rateLimit: 300, // requests per minute
      },
      inclusionFilters: [
        'https://diabetes.org/about-diabetes/*',
        'https://diabetes.org/living-with-diabetes/*',
        'https://diabetes.org/food-nutrition/*',
        'https://diabetes.org/health-wellness/*',
        'https://diabetes.org/tools-resources/*',
      ],
      exclusionFilters: [
        'https://diabetes.org/admin/*',
        'https://diabetes.org/user/*',
        'https://diabetes.org/*/media/oembed*',
        'https://diabetes.org/search/*',
      ]
    }
  };

  const chunkingConfig: ChunkingConfiguration = {
    chunkingStrategy: 'FIXED_SIZE',
    fixedSizeChunkingConfiguration: {
      maxTokens: 512,
      overlapPercentage: 20
    }
  };

  const createDSCommand = new CreateDataSourceCommand({
    knowledgeBaseId,
    name: 'diabetes-org-web-crawler',
    description: 'Web crawler for diabetes.org content',
    dataSourceConfiguration: {
      type: 'WEB',
      webConfiguration: webConfig
    },
    vectorIngestionConfiguration: {
      chunkingConfiguration: chunkingConfig
    }
  });

  const dsResponse = await client.send(createDSCommand);
  const dataSourceId = dsResponse.dataSource!.dataSourceId!;

  console.log('Data Source created:', dataSourceId);

  // Start initial ingestion
  console.log('Starting initial ingestion...');
  const syncResponse = await syncDataSource(knowledgeBaseId, dataSourceId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Bedrock Knowledge Base and Web Crawler created successfully',
      knowledgeBaseId,
      dataSourceId,
      ingestionJob: syncResponse
    })
  };
}

async function syncDataSource(knowledgeBaseId: string, dataSourceId: string) {
  console.log(`Starting ingestion for KB: ${knowledgeBaseId}, DS: ${dataSourceId}`);

  const command = new StartIngestionJobCommand({
    knowledgeBaseId,
    dataSourceId,
    description: `Manual sync triggered at ${new Date().toISOString()}`
  });

  const response = await client.send(command);
  const ingestionJobId = response.ingestionJob!.ingestionJobId!;

  console.log('Ingestion job started:', ingestionJobId);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Ingestion job started',
      knowledgeBaseId,
      dataSourceId,
      ingestionJobId,
      status: response.ingestionJob!.status
    })
  };
}

async function getIngestionStatus(knowledgeBaseId: string, dataSourceId: string) {
  console.log(`Getting ingestion status for KB: ${knowledgeBaseId}, DS: ${dataSourceId}`);

  const listCommand = new ListIngestionJobsCommand({
    knowledgeBaseId,
    dataSourceId,
    maxResults: 10
  });

  const response = await client.send(listCommand);
  const jobs = response.ingestionJobSummaries || [];

  const detailedJobs = await Promise.all(
    jobs.slice(0, 3).map(async (job) => {
      const getCommand = new GetIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        ingestionJobId: job.ingestionJobId!
      });
      const details = await client.send(getCommand);
      return details.ingestionJob;
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Ingestion status retrieved',
      knowledgeBaseId,
      dataSourceId,
      totalJobs: jobs.length,
      recentJobs: detailedJobs,
      summary: {
        completed: jobs.filter(j => j.status === 'COMPLETE').length,
        inProgress: jobs.filter(j => j.status === 'IN_PROGRESS').length,
        failed: jobs.filter(j => j.status === 'FAILED').length
      }
    })
  };
}

async function testWebCrawler(testUrls: string[]) {
  console.log('Testing Bedrock Web Crawler with URLs:', testUrls);

  // This is a test function to verify the crawler configuration
  // In a real scenario, you would create a temporary knowledge base with test URLs

  const urls = testUrls.length > 0 ? testUrls : [
    'https://diabetes.org/about-diabetes/type-1',
    'https://diabetes.org/about-diabetes/type-2'
  ];

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Test mode - would crawl these URLs',
      testUrls: urls,
      configuration: {
        seedUrls: SEED_URLS,
        rateLimit: 300,
        chunkSize: 512,
        overlapPercentage: 20
      },
      note: 'Use action=create to actually create the knowledge base and start crawling'
    })
  };
}