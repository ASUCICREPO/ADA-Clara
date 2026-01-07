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
- [Database Modifications](#database-modifications)
- [Best Practices](#best-practices)

---

## Project Structure Overview

```
├── backend/
│   ├── bin/backend.ts                    # CDK app entry point
│   ├── lib/ada-clara-unified-stack.ts    # Infrastructure definitions (unified stack)
│   ├── src/
│   │   ├── handlers/                     # Lambda function handlers
│   │   │   ├── chat-processor/           # Chat message processing
│   │   │   ├── admin-analytics/          # Admin dashboard analytics
│   │   │   ├── escalation-handler/       # Escalation request handling
│   │   │   ├── rag-processor/            # RAG query processing
│   │   │   └── web-scraper/              # Web scraping automation
│   │   ├── business/                     # Business logic
│   │   │   ├── chat/                     # Chat service
│   │   │   └── analytics/                # Analytics service
│   │   ├── services/                     # Infrastructure services
│   │   │   ├── bedrock.service.ts        # Bedrock AI service
│   │   │   ├── dynamodb-service.ts       # DynamoDB operations
│   │   │   ├── [service files]
│   │   │   └── question-processing.service.ts  # Question processing
│   │   └── types/                        # TypeScript definitions
│   └── package.json
├── frontend/
│   ├── app/                              # Next.js App Router
│   │   ├── components/                   # React components
│   │   ├── admin/                        # Admin dashboard pages
│   │   └── page.tsx                      # Main chat page
│   ├── lib/api/                          # API service clients
│   └── public/                           # Static assets
├── docs/                                 # Documentation
└── deploy.sh                             # Deployment script
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

**Location**: `backend/src/handlers/`

1. Create a new directory under `backend/src/handlers/` (e.g., `new-handler/`)
2. Create an `index.ts` file with your handler function
3. Create a controller file (e.g., `new-handler.controller.ts`) for request handling
4. Add the Lambda to the CDK stack in `backend/lib/ada-clara-unified-stack.ts`
5. Add API Gateway integration if needed

**Example**:
```typescript
// backend/src/handlers/new-handler/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NewHandlerController } from './new-handler.controller';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const controller = new NewHandlerController();
  return await controller.handleRequest(event);
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
this.newLambda = new lambda.Function(this, 'NewLambda', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('dist/new-handler'),
  timeout: Duration.seconds(30),
  environment: {
    TABLE_NAME: this.someTable.tableName
  }
});

this.someTable.grantReadWriteData(this.newLambda);
```

### Adding New API Endpoints

1. Define the Lambda function (see above)
2. Add API Gateway resource and method in the stack:
```typescript
const newResource = this.api.root.addResource('new-endpoint');
newResource.addMethod('GET', new apigateway.LambdaIntegration(this.newLambda));
```
3. Update `docs/APIDoc.md` with the new endpoint documentation

---

## Adding New Features

### Feature: Adding a New Analytics Metric

**Files to modify**:
- `backend/src/business/analytics/analytics.service.ts`
- `backend/src/handlers/admin-analytics/admin-analytics.controller.ts`
- `frontend/app/admin/components/MetricCards.tsx`

**Steps**:
1. Add the metric calculation logic in `analytics.service.ts`
2. Add a new endpoint in `admin-analytics.controller.ts` to expose the metric
3. Update the frontend `MetricCards.tsx` component to display the new metric
4. Update the API documentation

### Feature: Adding Support for a New Language

**Files to modify**:
- `backend/src/business/chat/chat.service.ts` (language detection already supports multiple languages)
- `frontend/app/components/LanguageSwitcher.tsx`
- `frontend/app/components/Header.tsx`

**Steps**:
1. Add the new language option to `LanguageSwitcher.tsx`
2. Add the new language option to the language switcher component
3. Test with questions in the new language

---

## Changing AI/ML Models

### Switching Bedrock Models

**Location**: `backend/src/services/bedrock.service.ts` and Lambda environment variables

The default model is Claude 3.7 Sonnet (`anthropic.claude-3-7-sonnet-20250219-v1:0`). To change:

1. **For RAG generation**: Update `GENERATION_MODEL` environment variable in `ragProcessor` Lambda (in `ada-clara-unified-stack.ts`)
2. **For content enhancement**: Update the model in `backend/src/services/content-enhancement.service.ts`
3. **For embeddings**: Update `EMBEDDING_MODEL` environment variable (default: `amazon.titan-embed-text-v2:0`)

**Example**:
```typescript
// In ada-clara-unified-stack.ts
this.ragProcessor.addEnvironment('GENERATION_MODEL', 'anthropic.claude-3-opus-20240229-v1:0');
```

### Modifying Prompts

**Location**: `backend/src/business/chat/chat.service.ts` and `backend/src/handlers/rag-processor/rag.controller.ts`

Prompts are constructed in the chat service and RAG processor. To modify:

1. Find the prompt construction in `chat.service.ts` (around the `generateResponse` method)
2. Update the system prompt or user prompt template
3. For RAG queries, modify prompts in `rag-processor/rag.controller.ts`
4. Test thoroughly as prompt changes significantly affect response quality

---

## Database Modifications

### Adding New Tables

**Location**: `backend/lib/ada-clara-unified-stack.ts`

To add a new DynamoDB table:

1. Define the table in the CDK stack:
```typescript
this.newTable = new dynamodb.Table(this, 'NewTable', {
  tableName: `ada-clara-new-table${stackSuffix}`,
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

2. Add Global Secondary Indexes (GSIs) if needed for querying
3. Grant permissions to Lambda functions that need access
4. Update environment variables in Lambda functions

### Modifying Schema

DynamoDB is schema-less, but you should:

1. Document the data model in `backend/src/types/index.ts`
2. Update TypeScript interfaces when adding new attributes
3. Add validation in services that write to tables
4. Consider adding GSIs for new query patterns

**Note**: Adding GSIs requires a separate deployment (DynamoDB only allows one GSI operation per update).

---

## Best Practices

1. **Test locally before deploying** - Use `cdk synth` to validate changes, test Lambda functions locally with SAM or Lambda runtime interface emulator
2. **Use environment variables** - Don't hardcode sensitive values, use CDK environment variables and Lambda environment configuration
3. **Follow existing patterns** - Maintain consistency with the codebase structure (handlers, services, business logic separation)
4. **Update documentation** - Keep docs in sync with code changes, especially API documentation
5. **Version control** - Make small, focused commits with clear messages
6. **Error handling** - Always include proper error handling and logging in Lambda functions
7. **Type safety** - Use TypeScript types from `backend/src/types/index.ts` for data models
8. **DynamoDB GSI limits** - Deploy GSIs one at a time (DynamoDB limitation)
9. **CORS configuration** - Update CORS origins in API Gateway when adding new frontend domains
10. **Monitoring** - Check CloudWatch logs after deployments to ensure functions are working correctly

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

# Test Lambda functions locally (if using SAM)
sam local invoke ChatProcessorFunction -e event.json
```

### Deployment Testing

```bash
# Deploy backend changes
cd backend
cdk deploy AdaClaraUnifiedStack

# For faster Lambda-only updates (hotswap)
cdk deploy AdaClaraUnifiedStack --hotswap

# Deploy frontend (if using unified script)
cd ..
./deploy.sh
```

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

- **Additional AI models**: Easy to swap Bedrock models via environment variables
- **New analytics**: Add metrics by extending the analytics service
- **Additional languages**: Add new language options to the language switcher component
- **Custom knowledge sources**: Extend the web scraper to include additional sources
- **Enhanced escalation**: Add integrations with ticketing systems or CRM platforms

### Getting Help

- Review the [Architecture Deep Dive](./architectureDeepDive.md) for system design details
- Check [API Documentation](./APIDoc.md) for endpoint details
- Review CloudWatch logs for debugging
- Check the deployment guide for infrastructure changes

