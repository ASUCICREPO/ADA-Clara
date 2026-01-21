# Architecture Deep Dive

This document provides a detailed explanation of the ADA Clara architecture.

---

## Architecture Diagram

![Architecture Diagram](./media/ada-clara-architecture.png)

---

## Architecture Flow

The following describes the step-by-step flow of how the system processes requests:

### 1. User Interaction
Users access the ADA Clara chatbot through the Amplify UI (Next.js web interface hosted on AWS Amplify). The interface allows users to type questions about diabetes in multiple languages via the language selector.

### 2. Request Processing
User messages are sent via HTTPS to HTTP API Gateway (v2), which routes POST requests to the `/chat` endpoint. API Gateway handles CORS, authentication (for admin endpoints via Cognito JWT authorizer), and request throttling before forwarding to the appropriate Lambda function.

### 3. Chat Processing & RAG
The `chat-handler` Lambda function receives the request and performs all chat processing operations:
- Retrieves the user's selected language from the request (no automatic detection)
- Creates or retrieves the chat session from the consolidated data table in DynamoDB
- Stores the user message in the data table with the session
- **Integrated RAG Processing:**
  - Preprocesses the query (expands diabetes abbreviations like T1D→Type 1 diabetes)
  - Queries the Bedrock Knowledge Base with the expanded query
  - Bedrock Knowledge Base performs vector search on the S3 Vectors index
  - Retrieves 5 most relevant content chunks with relevance scores
  - Extracts source URLs and titles from the retrieved embeddings
  - **Confidence Scoring:** Uses hybrid strategy (top score if ≥0.79, otherwise average of quality sources ≥0.65)
  - Applies source penalties (<2 sources) and volume bonuses (≥4 sources)
  - Invokes Claude Haiku 4.5 (inference profile: `us.anthropic.claude-haiku-4-5-20251001-v1:0`) to generate contextual responses
  - Returns response with source citations from diabetes.org content

### 4. Escalation Handling (if triggered)
Escalation is triggered by one of three conditions:
1. **Low confidence** (confidence ≤ 0.70)
2. **Semantic escalation detection** (Claude LLM responds with "ESCALATE_TO_HUMAN" based on prompt instructions for emergency/medical situations)
3. **User explicitly requests escalation** (regex patterns: "talk to person", "speak to doctor", etc.)

When escalation occurs:
- The `chat-handler` **directly writes an escalation record** to the `escalation-requests` DynamoDB table
- No separate Lambda invocation occurs for automatic escalations
- Escalation record includes: escalationId, sessionId, reason (semantic detection/low confidence/user request), timestamp, status (pending), source (chat_escalation), questionText, TTL (90 days)
- Returns user-friendly escalation message instead of low-confidence response

### 5. Analytics Processing (Async)
After responding to the user, `chat-handler` invokes the `analytics-processor` Lambda **asynchronously**:
- Uses direct Lambda invoke with `InvocationType: 'Event'` (fire-and-forget)
- Payload includes: sessionId, userMessage, botResponse, confidence, sources, escalation status
- Analytics-processor independently:
  - Updates session activity (lastActivity, messageCount)
  - Records question in the data table (PK: `QUESTION#{date}`, SK: `#{timestamp}#{questionId}`)
  - Records analytics events for admin dashboard metrics

### 6. Response Delivery
The generated response is:
- Stored in the consolidated data table (PK: `SESSION#{sessionId}`, SK: `MESSAGE#{timestamp}#{BOT}`)
- Returned to the user through API Gateway with: message, sessionId, sources (with relevance scores), escalated flag, confidence score
- Displayed in the web interface with source citations and relevance indicators

## Admin Flow

The following describes how administrators interact with the system:

### 1. Admin Authentication
- Admin users log into the system via Amazon Cognito User Pool
- Cognito provides JWT tokens for authenticating API requests
- HTTP API Gateway uses Cognito JWT Authorizer to protect all `/admin/*` endpoints
- Secure token-based authentication ensures only authorized users can access admin features

### 2. Admin Dashboard Access
- Admin users access the Admin Dashboard through the Amplify UI (authenticated route)
- The dashboard displays real-time analytics, metrics, and conversation insights
- All admin endpoints require valid Cognito JWT token in Authorization header

### 3. Analytics Retrieval
- The Admin Dashboard makes requests to the `admin-analytics` Lambda function via protected endpoints
- Admin Analytics queries the consolidated data table and escalation-requests table:
  - **Data Table:** Sessions, messages, questions (using EntityType filters and GSIs)
  - **Escalation-Requests Table:** User-submitted forms and auto-escalations (using SourceIndex GSI)
- Returns comprehensive analytics data including:
  - **Conversation metrics:** Total conversations, week-over-week trends
  - **Escalation rate:** Percentage of user-submitted escalation forms
  - **Out-of-scope rate:** Percentage of questions auto-escalated due to low confidence (<0.75)
  - **7-day conversation chart:** Daily conversation counts with date labels
  - **Language distribution:** English vs Spanish percentage split
  - **Escalation requests table:** Paginated list of all escalation submissions with status

### 4. Escalation Management
- Admin users view escalation requests via the `escalation-handler` Lambda (`GET /admin/escalation-requests`)
- Escalation Handler queries the escalation-requests table filtered by source type:
  - `form_submit`: User-submitted forms via `/escalation/request` endpoint
  - `chat_escalation`: Auto-escalated conversations from low confidence detection
- Returns paginated results with: requestId, name, email, question, timestamp, status, source

---

## Cloud Services / Technology Stack

### Frontend
- **AWS Amplify UI**: Hosted Next.js web application
  - App Router for page routing
  - Server-side rendering and static generation
  - Client-side components for interactive chat interface
  - Admin dashboard accessible via Cognito authentication
  - Serves both regular users and admin users

### Backend Infrastructure
- **AWS CDK**: Infrastructure as Code for deploying AWS resources
  - Defines all cloud infrastructure in TypeScript
  - Enables reproducible deployments
  - Single unified stack (AdaClaraUnifiedStack)

- **HTTP API Gateway (v2)**: Acts as the front door for all API requests
  - HTTP API with CORS support (not REST API)
  - Cognito JWT Authorizer for admin endpoints
  - Rate limiting and throttling configuration
  - No stage prefix (uses default stage)

- **AWS Lambda**: Serverless compute for backend logic
  - **chat-handler**: Main chat processing Lambda that handles user messages, performs integrated RAG processing (query preprocessing, Bedrock KB retrieval, confidence scoring, Claude Haiku 4.5 invocation), manages escalations (direct DynamoDB writes), and asynchronously invokes analytics-processor
  - **analytics-processor**: Async analytics processing (invoked by chat-handler), handles session updates, question recording, and serves public GET endpoints (`/config`, `/chat/history`, `/chat/sessions`)
  - **escalation-handler**: API Gateway endpoints for escalation form submissions (`POST /escalation/request`) and admin retrieval (`GET /admin/escalation-requests`), includes rate limiting (3 per email per hour) and PII redaction
  - **admin-analytics**: Provides analytics data for the admin dashboard (metrics with week-over-week trends, 7-day conversation chart, language distribution, escalation requests table)
  - **domain-discovery**: Weekly EventBridge-triggered Lambda that discovers URLs from diabetes.org (sitemap + seed URLs), filters and prioritizes by content type (0-100 scoring), creates batches of 15 URLs, and sends to SQS queue with sentinel messages
  - **content-processor**: SQS-triggered Lambda that processes URL batches, converts HTML to Markdown, performs quality assessment (0-100 score, min 50), detects content changes (SHA-256 hashing), stores .md files in S3, and triggers Bedrock KB ingestion on TRIGGER_INGESTION sentinel

### AI/ML Services
- **Amazon Bedrock**: Foundation model service for AI capabilities
  - **Claude Haiku 4.5** (Inference Profile): Used by chat-handler for generating contextual responses based on retrieved knowledge base content
    - Model ID: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (cross-region inference profile)
    - Selected for cost optimization and fast response times
    - Requires AWS Marketplace permissions (Subscribe, ViewSubscriptions)
  - **Titan Text Embedding V2**: Used for creating vector embeddings of scraped content from diabetes.org
    - Model: `amazon.titan-embed-text-v2:0`
    - 1024-dimensional embeddings
    - Powers semantic search in Knowledge Base

- **Language Support**: Multi-language interface support
  - Users can select their preferred language via the language switcher
  - Supports English and Spanish interfaces
  - Language preference is passed explicitly in API requests (no automatic detection)
  - Language preference is maintained throughout the session

- **Amazon Bedrock Knowledge Base**: RAG system for retrieving relevant information
  - Integrated directly into chat-handler (no separate Lambda)
  - Performs vector search on the S3 Vectors index to find relevant content
  - Retrieves up to 5 most relevant chunks (configurable via MAX_RETRIEVAL_RESULTS)
  - Returns content with relevance scores and source URLs
  - Enables semantic search capabilities for finding accurate answers
  - Chunking strategy: 512 tokens with 30% overlap

### Data Storage
- **Amazon S3**: Object storage for content and vector embeddings
  - **S3 Content Bucket** (`ada-clara-content-{env}-{account}-{region}`): Stores cleaned Markdown files (.md) converted from diabetes.org HTML by content-processor
    - Path structure: `web_content/{sanitized-url}.md`
    - Includes metadata: url, title, scraped date, domain, contentHash, qualityScore
    - Only stores content with quality score ≥50
    - Versioning enabled for change tracking
  - **S3 Vectors Bucket** (`ada-clara-vectors-{env}-{account}-{region}`): Stores vector embeddings created by Titan Text Embedding V2 for semantic search
    - Managed by AWS S3 Vectors service
    - Vector index: `ada-clara-index-{env}` (1024-dimensional, cosine distance)
    - Populated automatically by Bedrock KB ingestion jobs

- **Amazon DynamoDB**: NoSQL database for application data (3 tables with on-demand billing)
  - **Consolidated Data Table** (`ada-clara-data-table`): Single-table design storing multiple entity types
    - **Sessions**: PK: `SESSION#{sessionId}`, SK: `METADATA` - chat session metadata (startTime, language, messageCount, escalated)
    - **Messages**: PK: `SESSION#{sessionId}`, SK: `MESSAGE#{timestamp}#{USER|BOT}` - individual chat messages
    - **Questions**: PK: `QUESTION#{date}`, SK: `#{timestamp}#{questionId}` - processed questions with confidence scores
    - **Analytics**: PK: `ANALYTICS#{category}`, SK: `#{action}#{timestamp}` - analytics events
    - GSIs: TimestampIndex (EntityType + timestamp), SessionIndex (sessionId + timestamp)
    - TTL: 30 days for automatic data expiration
  - **Escalation Requests Table** (`ada-clara-escalation-requests`): Tracks user escalation submissions and auto-escalations
    - PK: escalationId (UUID)
    - Fields: name, email, phoneNumber, questionText, timestamp, status, source (form_submit or chat_escalation)
    - GSI: SourceIndex (source + timestamp) for filtering by escalation type
    - TTL: 90 days
  - **Content Tracking Table** (`ada-clara-content-tracking`): Tracks web scraping progress and content changes
    - PK: url, SK: crawlTimestamp
    - Fields: contentHash (SHA-256), contentLength, title, status (success or quality_rejected), s3Key, qualityScore
    - Used for change detection and preventing duplicate processing
    - TTL: 90 days

### Additional Services
- **Amazon Cognito**: User authentication and authorization
  - **User Pool**: Admin authentication with self-signup enabled, email verification
  - **User Pool Client**: OAuth2 Authorization Code Grant, SRP authentication
  - **Identity Pool**: Unauthenticated access allowed for public chat endpoints
  - **Cognito Domain**: `ada-clara-{account-suffix}.auth.{region}.amazoncognito.com`
  - JWT tokens validated by HTTP API Gateway Cognito Authorizer on `/admin/*` routes

- **AWS Amplify**: Frontend hosting and deployment
  - Hosts the Next.js 16.1 application with React 19
  - Automatic builds and deployments from Git
  - CDN distribution for global performance
  - Environment-based configuration (API URL, Cognito IDs fetched from `/config` endpoint)
  - Integrates with Cognito for admin authentication

- **Amazon EventBridge**: Scheduled automation
  - **Rule**: `ada-clara-web-scraper-schedule-{env}` - Weekly trigger (Sundays at 2 AM UTC)
  - **Target**: domain-discovery Lambda
  - Initiates web scraping pipeline: URL discovery → SQS batching → content processing → KB ingestion
  - Ensures Knowledge Base stays up-to-date with latest diabetes.org content

- **Amazon SQS**: Message queuing for decoupled processing
  - **Scraping Queue** (`ada-clara-scraping-queue`): URL batch processing
    - Receives batches of 15 URLs from domain-discovery
    - Triggers content-processor Lambda (concurrency: 3)
    - Visibility timeout: 15 minutes (matches Lambda timeout)
    - Long polling: 20 seconds
  - **Dead Letter Queue** (`ada-clara-scraping-dlq`): Failed batch handling
    - Max receive count: 3 (retry failed batches up to 3 times)
    - Retention: 14 days

### Knowledge Base Ingestion Flow

The system includes an automated pipeline for keeping the knowledge base current:

1. **EventBridge Weekly Trigger**: Schedules weekly execution (Sundays 2 AM UTC) of domain-discovery Lambda
2. **Domain Discovery Lambda**: Fetches diabetes.org sitemap and seed URLs, prioritizes by content type (0-100 scoring), filters URLs with priority ≥50, creates batches of 15 URLs, sends to SQS queue
3. **SQS Queue**: Decouples URL discovery from processing, triggers content-processor Lambda for each batch
4. **Content Processor Lambda**: Fetches HTML, converts to Markdown, performs quality assessment (0-100 score, min 50), detects content changes via SHA-256 hashing, stores .md files in S3 content bucket, triggers Bedrock KB ingestion on TRIGGER_INGESTION sentinel
5. **S3 Content Bucket**: Stores cleaned Markdown files with metadata (url, title, quality score, content hash)
6. **Bedrock Knowledge Base**: Automatically generates embeddings using Titan V2, stores in S3 Vectors index, updates Knowledge Base for RAG queries
7. **Change Detection**: Content-tracking table tracks content hashes to prevent duplicate processing and optimize scraping

### Monitoring and Logging

- **CloudWatch Logs**: All components within the system are connected to CloudWatch Logs for centralized logging and monitoring
  - Lambda function execution logs
  - API Gateway access logs
  - Error tracking and debugging
  - Performance monitoring

---

## Infrastructure as Code

This project uses **AWS CDK (Cloud Development Kit)** to define and deploy infrastructure.

### CDK Stack Structure

```
backend/
├── bin/
│   └── backend.ts                    # CDK app entry point
├── lib/
│   └── ada-clara-unified-stack.ts    # Unified stack definition (all resources)
└── lambda/
    ├── chat-handler/                 # Main chat processing Lambda
    ├── analytics-processor/          # Async analytics processing
    ├── admin-analytics/              # Admin dashboard data
    ├── escalation-handler/           # Escalation form handling
    ├── domain-discovery/             # URL discovery and prioritization
    └── content-processor/            # Web scraping and KB ingestion
```

### Key CDK Constructs

The unified stack (`AdaClaraUnifiedStack`) defines all AWS resources in a single stack:

1. **DynamoDB Tables**: Three tables with single-table design pattern for consolidated data, escalation requests, and content tracking. All use on-demand billing with GSIs (TimestampIndex, SessionIndex, SourceIndex) for efficient querying and TTL for automatic expiration.

2. **Lambda Functions**: Six Lambda functions with appropriate IAM roles, environment variables, and log groups. Functions configured with timeouts (30s-15min), memory allocation (512MB-1536MB), and runtime (Node.js 24.x).

3. **HTTP API Gateway (v2)**: HTTP API with CORS configuration, Cognito JWT Authorizer for admin endpoints, and integration with all Lambda functions. No stage prefix (uses default stage).

4. **Bedrock Knowledge Base**: Configured with S3 content bucket data source, S3 Vectors storage, Titan Text Embedding V2 model, and chunking strategy (512 tokens, 30% overlap).

5. **Cognito Resources**: User pool with self-signup enabled, user pool client with OAuth2 support, user pool domain (unique suffix using account ID), and identity pool for unauthenticated access.

6. **S3 Buckets**: Content bucket for scraped Markdown files (.md) with versioning enabled, and vectors bucket with S3 Vectors index (1024-dim, cosine distance) for semantic search.

7. **EventBridge Rule**: Scheduled rule (Sundays 2 AM UTC) for weekly web scraping automation targeting domain-discovery Lambda.

8. **SQS Queues**: Scraping queue for URL batch processing (15-min visibility, 14-day retention) and dead letter queue for failed batches (max receive count: 3).

### Deployment Automation

The project uses a unified deployment script (`deploy.sh`) that:
- Deploys the CDK stack with all backend resources
- Creates or updates the Amplify app for frontend hosting
- Configures CodeBuild for CI/CD pipeline
- Sets up the buildspec.yml for automated builds
- Provides status updates and error handling throughout the process

---

## Security Considerations

ADA Clara implements multiple layers of security to protect user data and ensure secure access:

- **Authentication**: Amazon Cognito provides JWT-based authentication for the admin dashboard. Users must sign in with valid credentials to access analytics and management features. HTTP API Gateway uses Cognito JWT Authorizer to validate tokens on all `/admin/*` and `/scraper/*` endpoints.

- **Authorization**: HTTP API Gateway uses Cognito User Pool Authorizer to protect admin endpoints. Only authenticated users with valid JWT tokens can access `/admin/*` endpoints. Public chat endpoints (`/chat`, `/escalation/request`, `/config`) are accessible without authentication but are rate-limited.

- **Data Encryption**: All data in DynamoDB is encrypted at rest using AWS managed keys. S3 buckets use server-side encryption (S3-managed). Data in transit is protected via HTTPS/TLS for all HTTP API Gateway endpoints.

- **Network Security**: HTTP API Gateway enforces CORS policies to restrict cross-origin requests to approved domains (Amplify frontend + localhost for dev). Rate limiting prevents abuse (1000 requests/second default). Lambda functions run in isolated execution environments with minimal IAM permissions following the principle of least privilege.

- **Input Validation & Sanitization**: Escalation-handler performs strict input validation (email RFC format, message length limits), HTML tag removal (XSS prevention), and control character removal (injection prevention). Rate limiting enforces 3 submissions per email per 60 minutes.

- **PII Protection**: Escalation-handler redacts PII (email, phone, names) in CloudWatch logs to prevent sensitive data exposure. TTL configured on DynamoDB tables (30-90 days) for automatic data expiration.

---

## Scalability

The serverless architecture of ADA Clara automatically scales to handle varying loads:

- **Auto-scaling**: Lambda functions automatically scale from zero to thousands of concurrent executions based on incoming requests. DynamoDB on-demand billing mode scales read and write capacity automatically without manual provisioning. HTTP API Gateway handles millions of requests per second.

- **Load Balancing**: HTTP API Gateway distributes incoming requests across multiple Lambda function instances. Amplify CDN distributes frontend assets globally for low-latency access. SQS queues decouple URL discovery from content processing, enabling parallel processing with controlled concurrency (3 URLs simultaneously).

- **Caching**: Admin-analytics implements in-memory Lambda container caching (2-minute TTL) to reduce DynamoDB scans. Amplify CDN caches static assets and pages for improved performance. Knowledge Base query results are returned with relevance scores for efficient retrieval.

- **Performance Optimizations**: RAG retrieval limited to 5 most relevant chunks (MAX_RETRIEVAL_RESULTS=5) to reduce prompt size and improve Claude response time. Content processor performs quality assessment (min score 50) to prevent low-quality content from entering Knowledge Base. Change detection via SHA-256 hashing prevents duplicate processing and unnecessary S3 writes.

