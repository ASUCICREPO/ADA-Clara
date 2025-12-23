import { Handler } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  BedrockAgentClient,
  RetrieveCommand,
  RetrieveAndGenerateCommand
} from '@aws-sdk/client-bedrock-agent';

interface CrawlerTestEvent {
  action: 'setup' | 'compare' | 'query' | 'full-test';
  knowledgeBaseId?: string;
  dataSourceId?: string;
  testQueries?: string[];
}

const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bedrock = new BedrockAgentClient({ region: process.env.AWS_REGION || 'us-east-1' });

const BEDROCK_MANAGER_FUNCTION = process.env.BEDROCK_MANAGER_FUNCTION!;

// Test queries to evaluate content quality
const DEFAULT_TEST_QUERIES = [
  'What is type 1 diabetes?',
  'How do I manage blood sugar levels?',
  'What foods should I eat with diabetes?',
  'What are the symptoms of diabetes?',
  'How is diabetes diagnosed?',
  'What is the difference between type 1 and type 2 diabetes?',
  'Can diabetes be prevented?',
  'What complications can diabetes cause?'
];

export const handler: Handler = async (event: CrawlerTestEvent) => {
  console.log('Crawler Test Event:', JSON.stringify(event, null, 2));

  try {
    switch (event.action) {
      case 'setup':
        return await setupBedrockCrawler();
      
      case 'compare':
        return await compareApproaches(event.knowledgeBaseId!);
      
      case 'query':
        return await testQueries(event.knowledgeBaseId!, event.testQueries || DEFAULT_TEST_QUERIES);
      
      case 'full-test':
        return await runFullTest();
      
      default:
        throw new Error(`Unknown action: ${event.action}`);
    }
  } catch (error) {
    console.error('Crawler Test Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Crawler test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function setupBedrockCrawler() {
  console.log('Setting up Bedrock Web Crawler...');

  const command = new InvokeCommand({
    FunctionName: BEDROCK_MANAGER_FUNCTION,
    Payload: JSON.stringify({ action: 'create' }),
  });

  const response = await lambda.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.Payload));

  if (result.statusCode !== 200) {
    throw new Error(`Setup failed: ${result.body}`);
  }

  const setupData = JSON.parse(result.body);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Bedrock Web Crawler setup completed',
      ...setupData,
      nextSteps: [
        'Wait for initial ingestion to complete (5-15 minutes)',
        'Use action=compare to compare with custom crawler',
        'Use action=query to test retrieval quality'
      ]
    })
  };
}

async function compareApproaches(knowledgeBaseId: string) {
  console.log('Comparing Bedrock Web Crawler vs Custom Crawler...');

  // Get Bedrock ingestion status
  const statusCommand = new InvokeCommand({
    FunctionName: BEDROCK_MANAGER_FUNCTION,
    Payload: JSON.stringify({ 
      action: 'status',
      knowledgeBaseId 
    }),
  });

  const statusResponse = await lambda.send(statusCommand);
  const statusResult = JSON.parse(new TextDecoder().decode(statusResponse.Payload));
  const bedrockStatus = JSON.parse(statusResult.body);

  // Test retrieval with sample queries
  const testResults = await Promise.all(
    DEFAULT_TEST_QUERIES.slice(0, 3).map(async (query) => {
      try {
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
        
        return {
          query,
          success: true,
          resultsCount: retrieveResponse.retrievalResults?.length || 0,
          results: retrieveResponse.retrievalResults?.map(r => ({
            score: r.score,
            content: r.content?.text?.substring(0, 200) + '...',
            source: r.location?.webLocation?.url
          }))
        };
      } catch (error) {
        return {
          query,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );

  const comparison = {
    bedrockWebCrawler: {
      status: bedrockStatus.summary,
      ingestionJobs: bedrockStatus.totalJobs,
      testResults: testResults.filter(r => r.success),
      errors: testResults.filter(r => !r.success)
    },
    customCrawler: {
      note: 'Run custom crawler test separately for comparison',
      advantages: [
        'Full control over content extraction',
        'Custom medical content processing',
        'JavaScript rendering capability',
        'Detailed error handling'
      ]
    },
    bedrockAdvantages: [
      'Managed infrastructure',
      'Automatic scheduling',
      'Built-in vector processing',
      'Integrated with Bedrock ecosystem'
    ],
    recommendation: 'TBD - depends on content quality and cost analysis'
  };

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Crawler comparison completed',
      comparison,
      testQueries: DEFAULT_TEST_QUERIES.slice(0, 3),
      timestamp: new Date().toISOString()
    })
  };
}

async function testQueries(knowledgeBaseId: string, queries: string[]) {
  console.log(`Testing ${queries.length} queries against Knowledge Base: ${knowledgeBaseId}`);

  const results = await Promise.all(
    queries.map(async (query, index) => {
      try {
        console.log(`Testing query ${index + 1}/${queries.length}: ${query}`);

        // Test retrieval
        const retrieveCommand = new RetrieveCommand({
          knowledgeBaseId,
          retrievalQuery: { text: query },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 3
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
            topResults: retrieveResponse.retrievalResults?.slice(0, 2).map(r => ({
              score: r.score,
              content: r.content?.text?.substring(0, 300) + '...',
              source: r.location?.webLocation?.url
            }))
          },
          generation: {
            answer: ragResponse.output?.text?.substring(0, 500) + '...',
            citations: ragResponse.citations?.map(c => ({
              content: c.retrievedReferences?.[0]?.content?.text?.substring(0, 200) + '...',
              source: c.retrievedReferences?.[0]?.location?.webLocation?.url
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
      message: 'Query testing completed',
      knowledgeBaseId,
      totalQueries: queries.length,
      successful: successful.length,
      failed: failed.length,
      qualityMetrics,
      results: successful,
      errors: failed.map(f => ({ query: f.query, error: f.error })),
      timestamp: new Date().toISOString()
    })
  };
}

async function runFullTest() {
  console.log('Running full Bedrock Web Crawler test...');

  try {
    // Step 1: Setup
    console.log('Step 1: Setting up Bedrock Web Crawler...');
    const setupResult = await setupBedrockCrawler();
    const setupData = JSON.parse(setupResult.body);

    // Step 2: Wait for ingestion (in real scenario, this would be longer)
    console.log('Step 2: Waiting for initial ingestion...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    // Step 3: Check status
    console.log('Step 3: Checking ingestion status...');
    const statusCommand = new InvokeCommand({
      FunctionName: BEDROCK_MANAGER_FUNCTION,
      Payload: JSON.stringify({ 
        action: 'status',
        knowledgeBaseId: setupData.knowledgeBaseId,
        dataSourceId: setupData.dataSourceId
      }),
    });

    const statusResponse = await lambda.send(statusCommand);
    const statusResult = JSON.parse(new TextDecoder().decode(statusResponse.Payload));

    // Step 4: Test queries (if ingestion is complete)
    let queryResults = null;
    const status = JSON.parse(statusResult.body);
    
    if (status.summary.completed > 0) {
      console.log('Step 4: Testing queries...');
      const queryResult = await testQueries(setupData.knowledgeBaseId, DEFAULT_TEST_QUERIES.slice(0, 3));
      queryResults = JSON.parse(queryResult.body);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Full Bedrock Web Crawler test completed',
        steps: {
          setup: setupData,
          status: status,
          queries: queryResults
        },
        recommendation: queryResults ? 
          (queryResults.qualityMetrics.successRate > 80 ? 
            'Bedrock Web Crawler shows good results - recommend for production' :
            'Bedrock Web Crawler needs improvement - consider custom crawler') :
          'Ingestion still in progress - rerun test later',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Full test failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Full test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    };
  }
}