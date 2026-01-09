# Architecture Deep Dive

This document provides a detailed explanation of the ADA Clara architecture.

---

## Architecture Diagram

![Architecture Diagram](./media/ada-clara-architecture.png)

---

## Architecture Flow

The following describes the step-by-step flow of how the system processes requests:

### 1. User Interaction
Users access the ADA Clara chatbot through the Amplify UI (Next.js web interface hosted on AWS Amplify). The interface allows users to type questions about diabetes in multiple languages via the language switcher.

### 2. Request Processing
User messages are sent via HTTPS to API Gateway, which routes POST requests to the `/chat` endpoint. API Gateway handles CORS, authentication (for admin endpoints), and request throttling before forwarding to the appropriate Lambda function.

### 3. Chat Processing
The `chatProcessor` Lambda function receives the request and performs several operations:
- Processes the user's message and determines the language from the request
- Creates or retrieves the chat session from DynamoDB
- Stores the user message in the messages table
- Forwards the request to the `ragProcessor` Lambda for response generation

### 4. RAG Query and Response Generation
The `ragProcessor` Lambda handles the RAG (Retrieval Augmented Generation) process:
- Sends RAG prompts to the Bedrock Knowledge Base
- Bedrock Knowledge Base performs vector search on the S3 Vector Bucket
- Retrieves relevant content from vector embeddings stored in S3
- Uses Amazon Bedrock with Claude Sonnet 3 to generate contextual responses
- Returns the response with source citations from diabetes.org content
- The `chatProcessor` evaluates response confidence and routes to escalation handler if confidence is low or user explicitly requests escalation

### 5. Escalation Handling (if triggered)
When low confidence is detected or user explicitly requests escalation:
- The `chatProcessor` routes the request to the `escalationHandler` Lambda
- Escalation Handler sends chat analytics data to DynamoDB Tables (Analytics, Escalations, Change Detection)
- Escalation request is stored for admin review

### 6. Response Delivery
The generated response is:
- Stored in DynamoDB (messages and conversations tables)
- Processed for analytics (question categorization, frequency tracking)
- Returned to the user through API Gateway
- Displayed in the web interface with source citations

## Admin Flow

The following describes how administrators interact with the system:

### 1. Admin Authentication
- Admin users log into the system via Amazon Cognito
- Cognito provides admin login access to both the Amplify UI and Admin Dashboard
- Secure token-based authentication ensures only authorized users can access admin features

### 2. Admin Dashboard Access
- Admin users access the Admin Dashboard through the Amplify UI
- The dashboard displays real-time analytics, metrics, and conversation insights
- All admin endpoints are protected by Cognito authorization

### 3. Analytics Retrieval
- The Admin Dashboard makes requests to the `adminAnalytics` Lambda function
- Admin Analytics queries DynamoDB Tables (Analytics, Escalations, Change Detection)
- Returns comprehensive analytics data including:
  - Conversation metrics and trends
  - Escalation requests
  - Frequently asked questions
  - Unanswered questions
  - Language distribution
  - Content change detection status

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

- **Amazon API Gateway**: Acts as the front door for all API requests
  - RESTful API with CORS support
  - Cognito authorizer for admin endpoints
  - Rate limiting and throttling configuration
  - Stage-based deployment (prod/dev)

- **AWS Lambda**: Serverless compute for backend logic
  - **chatProcessor**: Handles user chat messages, stores session details and raw chat analytics, and routes to RAG processor and escalation handler, as necessary
  - **ragProcessor**: Processes RAG queries, sends prompts to Bedrock Knowledge Base, and generates responses using Claude Sonnet 3
  - **escalationHandler**: Manages escalation requests triggered by low confidence or explicit user requests, sends analytics to DynamoDB
  - **adminAnalytics**: Provides analytics data for the admin dashboard (metrics, charts, FAQs, unanswered questions)
  - **domainDiscovery**: Automatically scrapes content from diabetes.org and processes it for knowledge base ingestion
  - **contentProcessor**: Scraper

### AI/ML Services
- **Amazon Comprehend**: Used by Chat Processor to categorize chats by language
- **Amazon Bedrock**: Foundation model service for AI capabilities
  - **Claude Sonnet 3.7**: Used by RAG Processor for generating contextual responses based on retrieved knowledge base content
  - **Titan Text Embedding V2**: Used for creating vector embeddings of scraped content from diabetes.org
  - Both models work together in the RAG pipeline: embeddings for retrieval, Claude for generation
  - **Claude Haiku**: Used by Chat Processor to categorize questions asked in chat, to be use

- **Language Support**: Multi-language interface support
  - Users can select their preferred language via the language switcher
  - Supports English and Spanish interfaces
  - Language preference is maintained throughout the session

- **Amazon Bedrock Knowledge Base**: RAG system for retrieving relevant information
  - Receives RAG prompts from the RAG Processor
  - Performs vector search on the S3 Vector Bucket to find relevant content
  - Returns relevant information with source citations for response generation
  - Enables semantic search capabilities for finding accurate answers

### Data Storage
- **Amazon S3**: Object storage for content and vector embeddings
  - **S3 Bucket (Scraped Content)**: Stores raw HTML content scraped from diabetes.org by the Content Processor (web scraper)
  - **S3 Vector Bucket**: Stores vector embeddings created by Titan Text Embedding V2 for semantic search
  - Vector embeddings are created from scraped content and stored for efficient similarity search in RAG queries

- **Amazon DynamoDB**: NoSQL database for application data
  - **Analytics Table**: Stores aggregated analytics data for the admin dashboard
  - **Escalations Table**: Tracks user escalation requests and form submissions (populated by Escalation Handler)
  - **Change Detection Table**: Tracks web scraping progress and detects changes in diabetes.org content
  - **chat-sessions**: Stores chat session metadata and user information
  - **messages**: Stores individual chat messages with conversation tracking
  - **conversations**: Tracks conversation-level analytics and metrics
  - **questions**: Stores processed questions with categorization and frequency

### Additional Services
- **Amazon Cognito**: User authentication and authorization
  - Provides admin login authentication for both Amplify UI and Admin Dashboard
  - User pool for admin dashboard authentication
  - Identity pool for frontend authentication
  - Secure token-based access control

- **AWS Amplify**: Frontend hosting and deployment
  - Hosts the Amplify UI (Next.js application)
  - Automatic builds and deployments from Git
  - CDN distribution for global performance
  - Environment-based configuration
  - Integrates with Cognito for admin authentication

- **Amazon EventBridge**: Scheduled automation
  - Weekly trigger (Sundays at 2 AM UTC) that activates the web scraping pipeline
  - Ensures Knowledge Base stays up-to-date with latest diabetes.org content
  - Triggers the complete knowledge base ingestion pipeline

### Knowledge Base Ingestion Flow

The system includes an automated pipeline for keeping the knowledge base current:

1. **EventBridge Weekly Trigger**: Schedules weekly execution of the web scraper
2. **Domain Discovery Lambda**: Searches through diabetes.org for properly-formed sources, makes list of URLS to be scraped
3. **SQS**: Invokes Content Processor lambda with batched URL payloads (15 URLs per invocation)
4. **Content Processor Lambda**: Scrapes discovered URLs in parallel, logs and checks content hash w/DynamoDB, formats changed and new content into cleaned .mds, and stores these in the content bucket
5. **S3 Bucket (Scraped Content)**: Stores the raw scraped HTML content
6. **Bedrock (Titan Text Embedding V2)**: Processes scraped content to create vector embeddings
7. **Bedrock Knowledge Base**: Ingests the embeddings and makes them searchable via vector search
8. **Change Detection**: DynamoDB tables track content changes to optimize scraping and detect updates

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
└── src/
    ├── handlers/                     # Lambda function handlers
    ├── business/                     # Business logic
    ├── services/                     # Infrastructure services
    └── types/                        # Type definitions
```

### Key CDK Constructs

The unified stack (`AdaClaraUnifiedStack`) defines all AWS resources in a single stack:

1. **DynamoDB Tables**: Six tables for chat sessions, messages, analytics, questions, escalation requests, and content tracking. All use on-demand billing and include GSIs for efficient querying.

2. **Lambda Functions**: Five Lambda functions with appropriate IAM roles, environment variables, and log groups. Functions are configured with timeouts, memory allocation, and VPC settings as needed.

3. **API Gateway**: RESTful API with CORS configuration, Cognito authorizer for admin endpoints, and integration with all Lambda functions.

4. **Bedrock Knowledge Base**: Configured with S3 data source, vector store, and embedding model for RAG functionality.

5. **Cognito Resources**: User pool, user pool client, user pool domain, and identity pool for authentication.

6. **S3 Buckets**: Content bucket for scraped HTML and vectors bucket with index for semantic search.

7. **EventBridge Rule**: Scheduled rule for weekly web scraping automation.

### Deployment Automation

The project uses a unified deployment script (`deploy.sh`) that:
- Deploys the CDK stack with all backend resources
- Creates or updates the Amplify app for frontend hosting
- Configures CodeBuild for CI/CD pipeline
- Sets up the buildspec.yml for automated builds
- Optionally triggers web scraper to populate knowledge base
- Provides status updates and error handling throughout the process

---

## Security Considerations

ADA Clara implements multiple layers of security to protect user data and ensure secure access:

- **Authentication**: Amazon Cognito provides secure user authentication for the admin dashboard. Users must sign in with valid credentials to access analytics and management features. The frontend uses Cognito tokens for authenticated API requests.

- **Authorization**: API Gateway uses Cognito User Pool Authorizer to protect admin endpoints. Only authenticated users with valid tokens can access `/admin/*` endpoints. Public chat endpoints are accessible without authentication but are rate-limited.

- **Data Encryption**: All data in DynamoDB is encrypted at rest using AWS managed keys. S3 buckets use server-side encryption. Data in transit is protected via HTTPS/TLS for all API Gateway endpoints.

- **Network Security**: API Gateway enforces CORS policies to restrict cross-origin requests to approved domains. Rate limiting prevents abuse and DDoS attacks. Lambda functions run in isolated execution environments with minimal IAM permissions following the principle of least privilege.

---

## Scalability

The serverless architecture of ADA Clara automatically scales to handle varying loads:

- **Auto-scaling**: Lambda functions automatically scale from zero to thousands of concurrent executions based on incoming requests. DynamoDB on-demand billing mode scales read and write capacity automatically without manual provisioning. API Gateway handles millions of requests per second.

- **Load Balancing**: API Gateway distributes incoming requests across multiple Lambda function instances. Amplify CDN distributes frontend assets globally for low-latency access.

- **Caching**: DynamoDB query results can be cached at the application level. API Gateway response caching can be enabled for frequently accessed endpoints. Amplify CDN caches static assets and pages for improved performance.

