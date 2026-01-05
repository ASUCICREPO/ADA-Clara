# Architecture Deep Dive

This document provides a detailed explanation of the ADA Clara architecture.

---

## Architecture Diagram

![Architecture Diagram](./media/ada-clara-architecture.png)

---

## Architecture Flow

The following describes the step-by-step flow of how the system processes requests:

### 1. User Interaction
Users access the ADA Clara chatbot through a Next.js web interface hosted on AWS Amplify. The interface allows users to type questions about diabetes in multiple languages, with automatic language detection.

### 2. Request Processing
User messages are sent via HTTPS to API Gateway, which routes POST requests to the `/chat` endpoint. API Gateway handles CORS, authentication (for admin endpoints), and request throttling before forwarding to the appropriate Lambda function.

### 3. Chat Processing
The `chatProcessor` Lambda function receives the request and performs several operations:
- Processes the user's message and determines the language from the request
- Creates or retrieves the chat session from DynamoDB
- Stores the user message in the messages table
- Determines if the question requires escalation based on content analysis

### 4. RAG Query and Response Generation
For non-escalated questions, the system:
- Queries the Bedrock Knowledge Base using the RAG processor Lambda
- Retrieves relevant content from vector embeddings stored in S3
- Uses Amazon Bedrock with Claude 3 Sonnet to generate contextual responses
- Includes source citations from diabetes.org content
- Evaluates response confidence and suggests escalation if confidence is low

### 5. Response Delivery
The generated response is:
- Stored in DynamoDB (messages and conversations tables)
- Processed for analytics (question categorization, frequency tracking)
- Returned to the user through API Gateway
- Displayed in the web interface with source citations

---

## Cloud Services / Technology Stack

### Frontend
- **Next.js**: React framework for the web application interface
  - App Router for page routing
  - Server-side rendering and static generation
  - Client-side components for interactive chat interface
  - Admin dashboard with protected routes using Cognito authentication

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
  - **chatProcessor**: Handles user chat messages, language detection, session management, and response generation
  - **ragProcessor**: Processes RAG queries against the Bedrock Knowledge Base
  - **adminAnalytics**: Provides analytics data for the admin dashboard (metrics, charts, FAQs, unanswered questions)
  - **escalationHandler**: Manages escalation requests and form submissions
  - **webScraperProcessor**: Automatically scrapes and processes content from diabetes.org to populate the knowledge base

### AI/ML Services
- **Amazon Bedrock**: Foundation model service for AI capabilities
  - Model: Claude 3 Sonnet (anthropic.claude-3-sonnet-20240229-v1:0) for text generation
  - Amazon Titan Embeddings (amazon.titan-embed-text-v2:0) for vector embeddings
  - Used for generating contextual responses based on retrieved knowledge base content
  - Content enhancement for web-scraped content using Claude models

- **Language Support**: Multi-language interface support
  - Users can select their preferred language via the language switcher
  - Supports English and Spanish interfaces
  - Language preference is maintained throughout the session

- **Amazon Bedrock Knowledge Base**: RAG system for retrieving relevant information
  - Stores vector embeddings of diabetes.org content in S3
  - Semantic search capabilities for finding relevant answers
  - Source citation and relevance scoring

### Data Storage
- **Amazon S3**: Object storage for content and vector embeddings
  - Content bucket: Stores raw HTML content scraped from diabetes.org
  - Vectors bucket: Stores vector embeddings for semantic search (using cdk-s3-vectors)
  - Vector index: Enables efficient similarity search for RAG queries

- **Amazon DynamoDB**: NoSQL database for application data
  - **chat-sessions**: Stores chat session metadata and user information
  - **messages**: Stores individual chat messages with conversation tracking
  - **conversations**: Tracks conversation-level analytics and metrics
  - **analytics**: Aggregated analytics data for dashboard
  - **questions**: Stores processed questions with categorization and frequency
  - **escalation-requests**: Tracks user escalation requests and form submissions
  - **content-tracking**: Tracks web scraping progress and content changes

### Additional Services
- **Amazon Cognito**: User authentication and authorization
  - User pool for admin dashboard authentication
  - Identity pool for frontend authentication
  - Secure token-based access control

- **AWS Amplify**: Frontend hosting and deployment
  - Automatic builds and deployments from Git
  - CDN distribution for global performance
  - Environment-based configuration

- **Amazon EventBridge**: Scheduled automation
  - Weekly cron job (Sundays at 2 AM UTC) to trigger web scraper
  - Ensures knowledge base stays up-to-date with latest diabetes.org content

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

1. **DynamoDB Tables**: Seven tables for chat sessions, messages, conversations, analytics, questions, escalation requests, and content tracking. All use on-demand billing and include GSIs for efficient querying.

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

