# Project Modification Guide

This guide is for developers who want to extend, customize, or modify ADA Clara.

---

## Introduction

This document provides guidance on how to modify and extend ADA Clara. Whether you want to add new features, change existing behavior, or customize the application for your needs, this guide will help you understand the codebase and make changes effectively.

---

## Table of Contents

- [Project Structure Overview](#project-structure-overview)
- [Frontend Modifications](#frontend-modifications)
- [Backend Modifications](#backend-modifications)
- [Adding New Features](#adding-new-features)
- [Changing AI/ML Models](#changing-aiml-models)
- [Configuring RAG and Confidence Thresholds](#configuring-rag-and-confidence-thresholds)
- [Database Modifications](#database-modifications)
- [Best Practices](#best-practices)

---

## Project Structure Overview

```
├── backend/
│   ├── bin/backend.ts                    # CDK app entry point
│   ├── lib/ada-clara-unified-stack.ts    # Infrastructure definitions (unified stack)
│   ├── lambda/                           # Lambda function handlers (JavaScript)
│   │   ├── chat-handler/                 # Main chat processing with integrated RAG
│   │   ├── analytics-processor/          # Async analytics processing
│   │   ├── admin-analytics/              # Admin dashboard analytics
│   │   ├── escalation-handler/           # Escalation request handling
│   │   ├── domain-discovery/             # URL discovery and prioritization
│   │   └── content-processor/            # Web scraping and KB ingestion
│   ├── scripts/                          # Deployment and utility scripts
│   │   └── trigger-web-scraper.sh        # Manual KB population trigger
│   └── package.json
├── frontend/
│   ├── app/                              # Next.js App Router
│   │   ├── components/                   # React components
│   │   ├── admin/                        # Admin dashboard pages
│   │   └── page.tsx                      # Main chat page
│   ├── lib/api/                          # API service clients
│   └── public/                           # Static assets
├── docs/                                 # Documentation
├── buildspec.yml                         # CodeBuild build specification
└── deploy.sh                             # Unified deployment script
```

---

## Frontend Modifications

### Changing the UI Theme

**Location**: `frontend/app/globals.css`

The theme uses Tailwind CSS with custom colors. The primary brand color is `#a6192e` (ADA red). To modify the theme:

1. Update color values in `globals.css`
2. Modify Tailwind config if using custom color classes
3. Update component styles that use inline styles with the brand color

### Adding New Pages

**Location**: `frontend/app/`

1. Create a new directory under `frontend/app/` (e.g., `about/`)
2. Add a `page.tsx` file with your page component
3. Use Next.js App Router conventions for routing
4. Add navigation links in the header or footer if needed

**Example**:
```typescript
// frontend/app/about/page.tsx
export default function AboutPage() {
  return <div>About ADA Clara</div>;
}
```

### Modifying Components

**Location**: `frontend/app/components/`

Key components:
- `ChatPanel.tsx` - Main chat interface
- `ChatMessage.tsx` - Individual message display
- `Header.tsx` - Application header with logo and language switcher
- `TalkToPersonForm.tsx` - Escalation form component

To modify a component, edit the corresponding file in `frontend/app/components/`. Components use React hooks and TypeScript.

---

## Backend Modifications

### Adding New Lambda Functions

**Location**: `backend/lambda/`

Lambda functions in this project are written in JavaScript (not TypeScript) for simplicity and faster cold start times.

1. Create a new directory under `backend/lambda/` (e.g., `new-handler/`)
2. Create an `index.js` file with your handler function
3. Add dependencies in a `package.json` file if needed
4. Add the Lambda to the CDK stack in [backend/lib/ada-clara-unified-stack.ts](../backend/lib/ada-clara-unified-stack.ts)
5. Add API Gateway integration if needed

**Example**:
```javascript
// backend/lambda/new-handler/index.js
/**
 * New Handler Lambda
 * Description of what this Lambda does
 */

export const handler = async (event) => {
  console.log('New handler invoked:', JSON.stringify(event));

  try {
    // Your handler logic here
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Success' })
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Modifying the CDK Stack

**Location**: `backend/lib/ada-clara-unified-stack.ts`

The unified stack defines all AWS resources. To add a new Lambda:

1. Define the Lambda function with appropriate configuration
2. Add environment variables if needed
3. Grant IAM permissions for required AWS services
4. Add API Gateway integration if exposing an endpoint
5. Add CloudWatch log group for monitoring

**Example**:
```typescript
// In ada-clara-unified-stack.ts
const newLambdaLogGroup = new logs.LogGroup(this, 'NewLambdaLogGroup', {
  logGroupName: `/aws/lambda/ada-clara-new-handler${stackSuffix}`,
  retention: logs.RetentionDays.ONE_WEEK,
  removalPolicy: RemovalPolicy.DESTROY,
});

this.newLambda = new lambda.Function(this, 'NewLambda', {
  functionName: `ada-clara-new-handler${stackSuffix}`,
  runtime: lambda.Runtime.NODEJS_24_X, // Current runtime version
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/new-handler'), // Lambda code directory
  timeout: Duration.seconds(30),
  memorySize: 512,
  logGroup: newLambdaLogGroup,
  environment: {
    DATA_TABLE: this.dataTable.tableName,
    AWS_REGION: this.region
  }
});

// Grant permissions to resources
this.dataTable.grantReadWriteData(this.newLambda);
```

### Adding New API Endpoints

The project uses HTTP API Gateway (v2), not REST API. To add new endpoints:

1. Define the Lambda function (see above)
2. Add HTTP API route using `addRoutes` method:
```typescript
// For public endpoints
this.api.addRoutes({
  path: '/new-endpoint',
  methods: [apigatewayv2.HttpMethod.GET],
  integration: new HttpLambdaIntegration('NewEndpointIntegration', this.newLambda),
});

// For protected admin endpoints (requires Cognito authentication)
this.api.addRoutes({
  path: '/admin/new-endpoint',
  methods: [apigatewayv2.HttpMethod.POST],
  integration: new HttpLambdaIntegration('AdminNewEndpointIntegration', this.newLambda),
  authorizer: cognitoAuthorizer, // Requires valid JWT token
});
```
3. Update [docs/APIDoc.md](./APIDoc.md) with the new endpoint documentation

---

## Adding New Features

### Feature: Adding a New Analytics Metric

**Files to modify**:
- [backend/lambda/admin-analytics/index.js](../backend/lambda/admin-analytics/index.js)
- [frontend/app/admin/components/MetricCards.tsx](../frontend/app/admin/components/MetricCards.tsx)

**Steps**:
1. Add the metric calculation logic in the admin-analytics Lambda
2. Query the necessary data from DynamoDB tables (data-table, escalation-requests, content-tracking)
3. Add the metric to the response payload
4. Update the frontend `MetricCards.tsx` component to display the new metric
5. Update [docs/APIDoc.md](./APIDoc.md) with the new response field

### Feature: Adding Support for a New Language

**Files to modify**:
- [backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js) - Prompts for new language
- [frontend/app/components/LanguageSwitcher.tsx](../frontend/app/components/LanguageSwitcher.tsx) - UI language selector
- [frontend/app/components/Header.tsx](../frontend/app/components/Header.tsx) - Header integration

**Steps**:
1. Add the new language option to `LanguageSwitcher.tsx` (e.g., French: `{ code: 'fr', name: 'Français' }`)
2. Update the chat-handler prompts in `processRAG` function (lines 456-490) to include the new language
3. Test with questions in the new language to verify prompt quality and response accuracy

---

## Changing AI/ML Models

### Switching Bedrock Models

**Location**: [backend/lib/ada-clara-unified-stack.ts](../backend/lib/ada-clara-unified-stack.ts) (line 678)

The default model is Claude Haiku 4.5 via inference profile (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). To change:

1. **For chat generation**: Update `GENERATION_MODEL` environment variable in `chatHandler` Lambda definition:
```typescript
// In ada-clara-unified-stack.ts (around line 678)
this.chatHandler = new lambda.Function(this, 'ChatHandler', {
  // ... other config
  environment: {
    DATA_TABLE: this.dataTable.tableName,
    KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
    GENERATION_MODEL: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', // Change to Sonnet 4.5
    CONFIDENCE_THRESHOLD: '0.75',
  },
});
```

2. **Update IAM permissions** (if switching to a different model family):
```typescript
// In ada-clara-unified-stack.ts (around line 684-698)
this.chatHandler.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['bedrock:InvokeModel'],
  resources: [
    `arn:aws:bedrock:${region}::foundation-model/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
  ],
}));
```

3. **For embeddings**: Embeddings use Titan Text Embedding V2 (`amazon.titan-embed-text-v2:0`), configured in the Knowledge Base data source (line 324). Changing embeddings requires re-ingesting all content.

**Available Models**:
- `us.anthropic.claude-haiku-4-5-20251001-v1:0` - Fast, cost-effective (current)
- `us.anthropic.claude-sonnet-4-5-20250929-v1:0` - Balanced performance
- `anthropic.claude-3-opus-20240229-v1:0` - Highest quality (expensive)

### Modifying Prompts

**Location**: [backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js) (lines 456-490)

All prompts are defined in the `processRAG` function in the chat-handler Lambda. To modify:

1. Locate the prompt construction in the `processRAG` function (lines 456-490)
2. Update the system prompt for English or Spanish:
   - **English prompt**: Lines 474-490
   - **Spanish prompt**: Lines 457-473
3. Modify escalation detection instructions, context format, or response guidance
4. Test thoroughly as prompt changes significantly affect response quality and escalation behavior

**Example modification**:
```javascript
// In backend/lambda/chat-handler/index.js (around line 474)
const prompt = language === 'es'
  ? `Eres un asistente médico especializado en diabetes.

     [Your custom Spanish prompt here]`
  : `You are a medical assistant specialized in diabetes.

     [Your custom English prompt here]

     Context from verified sources:
     ${context}

     Question: ${query}`;
```

---

## Configuring RAG and Confidence Thresholds

This section covers critical configuration parameters for tuning the chatbot's behavior, response quality, and escalation sensitivity.

---

### Configuring Confidence Threshold

**Location**: [backend/lib/ada-clara-unified-stack.ts](../backend/lib/ada-clara-unified-stack.ts) (line 679)

The confidence threshold determines when the chatbot should escalate conversations to a human. It's calculated from the relevance scores of Knowledge Base retrieval results.

**Current Configuration**:
```typescript
// In ada-clara-unified-stack.ts (chat-handler environment variables)
environment: {
  CONFIDENCE_THRESHOLD: '0.70', // 70% confidence required
}
```

**How Confidence is Calculated**:

The chat-handler uses a hybrid confidence strategy ([backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js) lines 369-422):

1. **Top Score Strategy** (if top source ≥ 0.79):
   - Uses the highest relevance score from retrieved sources
   - Rationale: Claude can form accurate answers from one excellent source

2. **Average Score Strategy** (if top source < 0.79):
   - Uses average relevance score of all quality sources (≥ 0.65)
   - **Source Count Penalty**: If fewer than 2 quality sources, applies penalty
   - **Volume Bonus**: If 4+ quality sources, applies small boost (up to +0.05)

**Tuning Guidance**:

| Threshold | Escalation Behavior | Use Case |
|-----------|---------------------|----------|
| **0.65** | Most escalations | Very conservative - maximum human oversight |
| **0.70** (default) | Balanced escalations | Production recommended - prioritizes safety |
| **0.75-0.80** | Fewer escalations | Moderate - more AI autonomy |
| **0.85+** | Minimal escalations | Aggressive - trust AI heavily |

**To Change**:
```typescript
// In ada-clara-unified-stack.ts
this.chatHandler = new lambda.Function(this, 'ChatHandler', {
  // ... other config
  environment: {
    DATA_TABLE: this.dataTable.tableName,
    KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
    GENERATION_MODEL: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    CONFIDENCE_THRESHOLD: '0.75', // Example: Change to 75% (fewer escalations)
  },
});
```

**Impact of Changes**:
- **Lower threshold** (0.65): Maximum escalations, safest for medical domain
- **Current default** (0.70): Balanced escalations, prioritizes safety
- **Higher threshold** (0.75-0.80): Fewer escalations, more AI autonomy
- **Very high** (0.85+): Minimal escalations, trust AI heavily
- **Monitoring**: Check admin dashboard escalation rate metric after changes

---

### Configuring RAG Retrieval Chunks

**Location**: [backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js) (line 40)

The `MAX_RETRIEVAL_RESULTS` parameter controls how many chunks are retrieved from the Knowledge Base for each query.

**Current Configuration**:
```javascript
// In backend/lambda/chat-handler/index.js
const MAX_RETRIEVAL_RESULTS = parseInt(process.env.MAX_RETRIEVAL_RESULTS || '5');
```

**Default**: 5 chunks per query

**How It Works**:
1. Chat-handler queries Bedrock Knowledge Base with user question
2. Knowledge Base performs vector search on S3 Vectors index
3. Returns top N chunks sorted by relevance score (cosine similarity)
4. Chunks are filtered to keep only those with relevance ≥ 0.65
5. Filtered chunks are passed to Claude for response generation

**Tuning Guidance**:

| Chunk Count | Response Time | Context Quality | Use Case |
|-------------|---------------|-----------------|----------|
| **3** | Fastest | Minimal context | Quick responses, simple questions |
| **5** (default) | Fast | Balanced | Production recommended |
| **7-10** | Slower | Comprehensive | Complex questions, research-heavy |
| **15+** | Slowest | Maximum context | Not recommended (prompt size limits) |

**Trade-offs**:
- **More chunks**: Better context coverage but slower response time and higher costs
- **Fewer chunks**: Faster responses but may miss relevant information
- **Recommended range**: 3-10 chunks

**To Change (Option 1 - Environment Variable)**:

Add environment variable to CDK stack:
```typescript
// In ada-clara-unified-stack.ts (chat-handler environment variables)
this.chatHandler = new lambda.Function(this, 'ChatHandler', {
  // ... other config
  environment: {
    DATA_TABLE: this.dataTable.tableName,
    KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
    GENERATION_MODEL: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    CONFIDENCE_THRESHOLD: '0.75',
    MAX_RETRIEVAL_RESULTS: '7', // Change to 7 chunks
  },
});
```

**To Change (Option 2 - Direct Code Modification)**:

Edit the constant directly in [backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js):
```javascript
// Line 40 in backend/lambda/chat-handler/index.js
const MAX_RETRIEVAL_RESULTS = parseInt(process.env.MAX_RETRIEVAL_RESULTS || '7'); // Change default to 7
```

**Impact of Changes**:
- **3 chunks**: Faster responses (~1-2s), may miss context for complex questions
- **5 chunks** (default): Balanced performance (~2-3s), good for most questions
- **7-10 chunks**: Comprehensive context (~3-5s), better for multi-faceted questions
- **Monitoring**: Check CloudWatch logs for retrieval timing and confidence scores

---

### Advanced Configuration: Relevance Score Filtering

**Location**: [backend/lambda/chat-handler/index.js](../backend/lambda/chat-handler/index.js) (line 37)

The `MIN_RELEVANCE_SCORE` filters out low-quality chunks before sending to Claude.

```javascript
// Line 37 in backend/lambda/chat-handler/index.js
const MIN_RELEVANCE_SCORE = 0.65;
```

**Current**: 0.65 (65% relevance minimum)

**Tuning Guidance**:
- **Lower** (0.50-0.60): More chunks pass through, better recall but noisier context
- **Higher** (0.70-0.75): Only high-quality chunks, cleaner context but may miss relevant info
- **Production recommended**: 0.65 (balanced precision/recall)

**Example**: If you retrieve 5 chunks but only 3 have relevance ≥ 0.65, only those 3 are used for generation.

---

### Testing Configuration Changes

After modifying confidence threshold or retrieval parameters:

1. **Deploy changes**:
   ```bash
   cd backend
   cdk deploy AdaClaraUnifiedStack --hotswap  # Fast Lambda-only update
   ```

2. **Test with sample questions**:
   - Simple questions (expected high confidence)
   - Complex questions (expected moderate confidence)
   - Out-of-scope questions (expected low confidence/escalation)

3. **Monitor CloudWatch Logs**:
   ```bash
   aws logs tail /aws/lambda/ada-clara-chat-handler --follow
   ```
   Look for:
   - `=== CONFIDENCE ANALYSIS ===` section
   - Final confidence scores
   - Escalation decisions

4. **Check Admin Dashboard**:
   - Monitor escalation rate metric
   - Track confidence score distribution
   - Verify out-of-scope rate remains acceptable

---

## Database Modifications

### Adding New Tables

**Location**: `backend/lib/ada-clara-unified-stack.ts`

To add a new DynamoDB table:

1. Define the table in the CDK stack:
```typescript
// In ada-clara-unified-stack.ts
this.newTable = new dynamodb.Table(this, 'NewTable', {
  tableName: `ada-clara-new-table${stackSuffix}`, // Production: no suffix, Dev: -dev
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand billing
  removalPolicy: RemovalPolicy.DESTROY, // Delete table when stack is deleted
  timeToLiveAttribute: 'ttl', // Enable TTL for automatic data expiration
});
```

2. Add Global Secondary Indexes (GSIs) if needed for efficient querying:
```typescript
// Add GSI for timestamp-based queries
this.newTable.addGlobalSecondaryIndex({
  indexName: 'TimestampIndex',
  partitionKey: { name: 'EntityType', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```

3. Grant permissions to Lambda functions that need access:
```typescript
this.newTable.grantReadWriteData(this.chatHandler);
```

4. Add table name as environment variable in Lambda functions:
```typescript
this.chatHandler.addEnvironment('NEW_TABLE', this.newTable.tableName);
```

### Modifying Schema

DynamoDB is schema-less, but follow these best practices:

1. **Document the data model**: Add JSDoc comments in Lambda handlers describing item structure
2. **Use consistent attribute names**: Follow existing patterns (PK, SK, EntityType, timestamp)
3. **Add validation**: Validate required fields before writing to tables
4. **Plan query patterns**: Design GSIs based on access patterns, not data relationships
5. **Use TTL**: Set `ttl` attribute (Unix timestamp) for automatic data expiration

**Example Item Structure**:
```javascript
{
  PK: 'USER#123',
  SK: 'PROFILE',
  EntityType: 'USER_PROFILE',
  timestamp: '2026-01-21T12:00:00Z',
  name: 'John Doe',
  email: 'john@example.com',
  ttl: 1747929600 // 30 days from creation
}
```

**Note**: Adding GSIs requires a separate deployment (DynamoDB only allows one GSI operation per update).

---

## Best Practices

1. **Test locally before deploying** - Use `cdk synth` to validate CloudFormation template changes
2. **Use environment variables** - Configure via CDK stack, never hardcode values in Lambda code
3. **Follow existing patterns** - Lambda functions are plain JavaScript with JSDoc comments, not TypeScript
4. **Update documentation** - Keep [docs/APIDoc.md](./APIDoc.md) in sync with API changes
5. **Version control** - Make small, focused commits with clear messages describing the change
6. **Error handling** - Always include try-catch blocks and descriptive error logging in Lambda functions
7. **DynamoDB design** - Use single-table design pattern with PK/SK structure and GSIs for query patterns
8. **DynamoDB GSI limits** - Deploy GSIs one at a time (DynamoDB limitation - one GSI operation per stack update)
9. **CORS configuration** - HTTP API Gateway CORS is configured in CDK stack (ada-clara-unified-stack.ts lines 603-614)
10. **Monitoring** - Check CloudWatch Logs after deployments to verify Lambda functions work correctly
11. **Hotswap deployments** - Use `cdk deploy --hotswap` for fast Lambda-only updates during development
12. **Node.js version** - All Lambda functions use Node.js 24.x runtime (NODEJS_24_X)

---

## Testing Your Changes

### Local Testing

```bash
# Frontend
cd frontend
npm run dev
# Access at http://localhost:3000

# Backend (synthesize CDK)
cd backend
npm install
cdk synth
# Review the CloudFormation template

# Test Lambda functions locally (requires SAM CLI and Docker)
# Note: Lambda functions are JavaScript, not TypeScript
sam local invoke ada-clara-chat-handler -e event.json
```

### Deployment Testing

```bash
# Option 1: Deploy backend changes only (CDK)
cd backend
npm install
cdk deploy AdaClaraUnifiedStack

# Option 2: Fast Lambda-only updates (hotswap - dev only)
cdk deploy AdaClaraUnifiedStack --hotswap

# Option 3: Full deployment (backend + frontend via CodeBuild)
cd ..
./deploy.sh
```

**Deployment Methods**:
- **CDK Deploy**: Updates all infrastructure (Lambda, DynamoDB, API Gateway, etc.)
- **Hotswap Deploy**: Fast Lambda code updates (~30s) - development only, not production-safe
- **Full Deploy**: Uses deploy.sh script with CodeBuild for complete rebuild and deployment

### Testing Checklist

- [ ] CDK synth completes without errors
- [ ] Lambda functions deploy successfully
- [ ] API Gateway endpoints are accessible
- [ ] Frontend can connect to API
- [ ] Chat functionality works end-to-end
- [ ] Admin dashboard loads and displays data
- [ ] CloudWatch logs show no errors
- [ ] DynamoDB tables are created/updated correctly

---

## Conclusion

ADA Clara is designed to be extensible. We encourage developers to modify and improve the system to better serve their needs. The architecture separates concerns (handlers, services, business logic) to make modifications easier and safer.

### Key Areas for Extension

- **Additional AI models**: Swap Bedrock models via `GENERATION_MODEL` environment variable in CDK stack
- **New analytics**: Add metrics by querying DynamoDB tables in admin-analytics Lambda
- **Additional languages**: Add language options to LanguageSwitcher and update chat-handler prompts
- **Custom knowledge sources**: Modify domain-discovery and content-processor Lambdas to scrape additional sources
- **Enhanced escalation**: Integrate with ticketing systems via escalation-handler Lambda
- **Scheduled tasks**: Add EventBridge rules to trigger Lambda functions on custom schedules
- **Custom confidence scoring**: Modify confidence calculation logic in chat-handler (lines 369-422)

### Getting Help

- Review the [Architecture Deep Dive](./architectureDeepDive.md) for system design details
- Check [API Documentation](./APIDoc.md) for endpoint details
- Review CloudWatch logs for debugging
- Check the deployment guide for infrastructure changes

