# Amazon Bedrock Web Crawler Research

## Service Overview

Amazon Bedrock Web Crawler is a managed service that automatically crawls websites and creates a knowledge base for RAG (Retrieval-Augmented Generation) applications. It's part of the Amazon Bedrock Knowledge Base service.

## Key Features

### Automated Web Crawling
- **Managed Service**: No infrastructure to manage
- **Scheduled Crawling**: Configurable crawl frequency (daily, weekly, monthly)
- **Intelligent Crawling**: Follows robots.txt and respects rate limits
- **Content Processing**: Automatic text extraction and chunking
- **Vector Generation**: Built-in embedding generation for semantic search

### Integration with Bedrock Knowledge Base
- **Direct Integration**: Crawled content automatically indexed
- **Vector Storage**: Uses Amazon OpenSearch Serverless or Amazon Aurora
- **Embedding Models**: Choice of embedding models (Titan, Cohere, etc.)
- **Chunking Strategy**: Configurable text chunking for optimal retrieval

### Configuration Options
- **URL Patterns**: Include/exclude URL patterns
- **Crawl Depth**: Maximum depth to crawl from seed URLs
- **Content Filters**: Filter by content type, file size, etc.
- **Rate Limiting**: Respectful crawling with configurable delays
- **Authentication**: Support for basic auth and custom headers

## Advantages for diabetes.org

### 1. **Compliance with robots.txt**
- Bedrock Web Crawler respects robots.txt automatically
- However, diabetes.org blocks "Amazonbot" which may include Bedrock crawler
- Need to verify if Bedrock Web Crawler uses different user agent

### 2. **Managed Infrastructure**
- No Lambda functions to maintain
- Automatic scaling and error handling
- Built-in retry logic and failure recovery

### 3. **Integrated Vector Processing**
- Automatic text extraction and cleaning
- Built-in chunking strategies optimized for RAG
- Direct integration with vector databases
- No need for separate embedding generation

### 4. **Content Freshness**
- Scheduled updates (weekly as required)
- Incremental crawling for changed content
- Automatic detection of new pages

## Potential Challenges

### 1. **robots.txt Restrictions**
```
User-agent: Amazonbot
Disallow: /
```
This could block Bedrock Web Crawler if it uses the Amazonbot user agent.

### 2. **Limited Customization**
- Less control over content extraction logic
- May not handle complex JavaScript-rendered content
- Limited ability to customize chunking for medical content

### 3. **Cost Considerations**
- Managed service pricing
- Vector storage costs in OpenSearch/Aurora
- Embedding model usage costs

## Comparison: Bedrock Web Crawler vs Custom Implementation

| Feature | Bedrock Web Crawler | Custom Implementation |
|---------|-------------------|---------------------|
| **Setup Complexity** | Low - Managed service | High - Custom Lambda functions |
| **Maintenance** | Minimal | Ongoing maintenance required |
| **Customization** | Limited | Full control |
| **Content Processing** | Built-in AI processing | Custom logic with Bedrock enhancement |
| **Cost** | Managed service fees | Lambda + storage costs |
| **robots.txt Compliance** | Automatic | Manual implementation |
| **JavaScript Handling** | Limited | Full control with Playwright |
| **Medical Content Optimization** | Generic | Specialized for diabetes content |

## Recommendation for Testing

### Phase 1: Test Bedrock Web Crawler
1. **Check User Agent**: Verify if Bedrock uses "Amazonbot" or different agent
2. **Small Scale Test**: Test with a few diabetes.org pages
3. **Content Quality Assessment**: Evaluate extraction quality vs custom crawler
4. **Cost Analysis**: Compare pricing with custom implementation

### Phase 2: Hybrid Approach (if needed)
1. **Use Bedrock for bulk crawling** of allowed content
2. **Custom crawler for restricted content** or specialized processing
3. **Combine results** in unified knowledge base

## Implementation Steps

### 1. Create Bedrock Knowledge Base
```typescript
import { BedrockAgentClient, CreateKnowledgeBaseCommand } from "@aws-sdk/client-bedrock-agent";

const createKnowledgeBase = async () => {
  const client = new BedrockAgentClient({ region: 'us-east-1' });
  
  const command = new CreateKnowledgeBaseCommand({
    name: 'ada-clara-diabetes-kb',
    description: 'Diabetes.org content for ADA Clara chatbot',
    roleArn: 'arn:aws:iam::ACCOUNT:role/BedrockKnowledgeBaseRole',
    knowledgeBaseConfiguration: {
      type: 'VECTOR',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1'
      }
    },
    storageConfiguration: {
      type: 'OPENSEARCH_SERVERLESS',
      opensearchServerlessConfiguration: {
        collectionArn: 'arn:aws:aoss:us-east-1:ACCOUNT:collection/ada-clara-vectors',
        vectorIndexName: 'diabetes-content-index',
        fieldMapping: {
          vectorField: 'vector',
          textField: 'text',
          metadataField: 'metadata'
        }
      }
    }
  });
  
  return await client.send(command);
};
```

### 2. Configure Web Crawler Data Source
```typescript
import { CreateDataSourceCommand } from "@aws-sdk/client-bedrock-agent";

const createWebCrawlerDataSource = async (knowledgeBaseId: string) => {
  const command = new CreateDataSourceCommand({
    knowledgeBaseId,
    name: 'diabetes-org-crawler',
    description: 'Web crawler for diabetes.org content',
    dataSourceConfiguration: {
      type: 'WEB',
      webConfiguration: {
        sourceConfiguration: {
          urlConfiguration: {
            seedUrls: [
              { url: 'https://diabetes.org/about-diabetes' },
              { url: 'https://diabetes.org/living-with-diabetes' },
              { url: 'https://diabetes.org/food-nutrition' },
              { url: 'https://diabetes.org/health-wellness' },
              { url: 'https://diabetes.org/tools-resources' }
            ]
          }
        },
        crawlerConfiguration: {
          crawlerLimits: {
            rateLimit: 300, // requests per minute
            maxPages: 1000
          },
          inclusionFilters: [
            'https://diabetes.org/about-diabetes/*',
            'https://diabetes.org/living-with-diabetes/*',
            'https://diabetes.org/food-nutrition/*',
            'https://diabetes.org/health-wellness/*',
            'https://diabetes.org/tools-resources/*'
          ],
          exclusionFilters: [
            'https://diabetes.org/admin/*',
            'https://diabetes.org/user/*',
            'https://diabetes.org/*/media/oembed*'
          ]
        }
      }
    },
    vectorIngestionConfiguration: {
      chunkingConfiguration: {
        chunkingStrategy: 'FIXED_SIZE',
        fixedSizeChunkingConfiguration: {
          maxTokens: 512,
          overlapPercentage: 20
        }
      }
    }
  });
  
  return await client.send(command);
};
```

### 3. Schedule Regular Crawling
```typescript
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";

const scheduleWeeklyCrawl = async (knowledgeBaseId: string, dataSourceId: string) => {
  const eventBridge = new EventBridgeClient({ region: 'us-east-1' });
  
  // Create weekly schedule rule
  const ruleCommand = new PutRuleCommand({
    Name: 'ada-clara-weekly-crawl',
    ScheduleExpression: 'cron(0 2 ? * SUN *)', // Every Sunday at 2 AM
    Description: 'Weekly crawl of diabetes.org for ADA Clara',
    State: 'ENABLED'
  });
  
  await eventBridge.send(ruleCommand);
  
  // Add Bedrock data source sync as target
  const targetCommand = new PutTargetsCommand({
    Rule: 'ada-clara-weekly-crawl',
    Targets: [{
      Id: '1',
      Arn: `arn:aws:bedrock:us-east-1:ACCOUNT:knowledge-base/${knowledgeBaseId}/data-source/${dataSourceId}`,
      RoleArn: 'arn:aws:iam::ACCOUNT:role/EventBridgeBedrockRole'
    }]
  });
  
  return await eventBridge.send(targetCommand);
};
```

## Next Steps

1. **Verify Bedrock Web Crawler availability** in our AWS region
2. **Test user agent compatibility** with diabetes.org robots.txt
3. **Create minimal test implementation** with a few seed URLs
4. **Compare content quality** with our custom crawler results
5. **Evaluate cost implications** for full-scale deployment
6. **Make final decision** on crawler approach based on test results