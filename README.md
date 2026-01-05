# ADA Clara

ADA Clara is an AI-powered diabetes chatbot assistant that provides accurate, evidence-based information about diabetes using trusted American Diabetes Association (ADA) resources. Built with AWS Bedrock and Retrieval Augmented Generation (RAG), the platform enables users to ask questions about diabetes in multiple languages and receive reliable answers sourced from diabetes.org. The system includes an admin dashboard for monitoring conversations, tracking analytics, and managing escalations, making it ideal for healthcare organizations and support teams.

---

## Visual Demo

![User Interface Demo](./docs/media/user-interface.gif)

> **[PLACEHOLDER]** Please provide a GIF or screenshot of the application interface and save it as `docs/media/user-interface.gif`

---

## Table of Contents

| Index                                               | Description                                              |
| :-------------------------------------------------- | :------------------------------------------------------- |
| [High Level Architecture](#high-level-architecture) | High level overview illustrating component interactions  |
| [Deployment Guide](#deployment-guide)               | How to deploy the project                                |
| [User Guide](#user-guide)                           | End-user instructions and walkthrough                    |
| [API Documentation](#api-documentation)             | Documentation on the APIs the project uses               |
| [Directories](#directories)                         | General project directory structure                      |
| [Modification Guide](#modification-guide)           | Guide for developers extending the project               |
| [Credits](#credits)                                 | Contributors and acknowledgments                         |
| [License](#license)                                 | License information                                      |

---

## High Level Architecture

ADA Clara implements a serverless, event-driven architecture built on AWS. The system uses Amazon Bedrock with Claude 3 Sonnet for AI-powered responses, combined with a RAG (Retrieval Augmented Generation) system that queries a knowledge base populated from diabetes.org content. User interactions flow through API Gateway to Lambda functions that process chat messages, detect language using Amazon Comprehend, and retrieve relevant information from vector embeddings stored in S3. The architecture includes automated web scraping to keep the knowledge base up-to-date, comprehensive analytics tracking, and an admin dashboard for monitoring and management.

![Architecture Diagram](./docs/media/ada-clara-architecture.png)

> **[PLACEHOLDER]** Please create and provide an architecture diagram showing:
> - All major components/services
> - Data flow between components
> - User interaction points
> - External services/APIs
> 
> Save the diagram as `docs/media/architecture.png` (or .jpeg/.jpg)

For a detailed explanation of the architecture, see the [Architecture Deep Dive](./docs/architectureDeepDive.md).

---

## Deployment Guide

For complete deployment instructions, see the [Deployment Guide](./docs/deploymentGuide.md).

**Quick Start:**
1. Configure AWS CLI with your credentials and set the deployment region
2. Run the deployment script: `./deploy.sh` from the project root
3. The script will deploy both backend and frontend infrastructure automatically

---

## User Guide

For detailed usage instructions with screenshots, see the [User Guide](./docs/userGuide.md).

---

## API Documentation

For complete API reference, see the [API Documentation](./docs/APIDoc.md).

---

## Modification Guide

For developers looking to extend or modify this project, see the [Modification Guide](./docs/modificationGuide.md).

---

## Directories

```
├── backend/
│   ├── bin/
│   │   └── backend.ts
│   ├── src/
│   │   ├── handlers/          # Lambda function handlers
│   │   │   ├── chat-processor/
│   │   │   ├── admin-analytics/
│   │   │   ├── escalation-handler/
│   │   │   ├── rag-processor/
│   │   │   └── web-scraper/
│   │   ├── business/           # Business logic services
│   │   │   ├── chat/
│   │   │   └── analytics/
│   │   ├── services/           # Infrastructure services
│   │   │   ├── bedrock.service.ts
│   │   │   ├── dynamodb-service.ts
│   │   │   ├── comprehend.service.ts
│   │   │   └── question-processing.service.ts
│   │   └── types/              # TypeScript type definitions
│   ├── lib/
│   │   └── ada-clara-unified-stack.ts
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── public/
│   └── package.json
├── docs/
│   ├── architectureDeepDive.md
│   ├── deploymentGuide.md
│   ├── userGuide.md
│   ├── APIDoc.md
│   ├── modificationGuide.md
│   └── media/
│       ├── architecture.png
│       └── user-interface.gif
├── LICENSE
└── README.md
```

### Directory Explanations:

1. **backend/** - Contains all backend infrastructure and serverless functions
   - `bin/` - CDK app entry point
   - `src/handlers/` - AWS Lambda function handlers (chat processor, admin analytics, escalation handler, RAG processor, web scraper)
   - `src/business/` - Core business logic (chat service, analytics service)
   - `src/services/` - Infrastructure services (Bedrock, DynamoDB, Comprehend, question processing)
   - `src/types/` - TypeScript type definitions and data models
   - `lib/` - CDK stack definitions (unified stack for all AWS resources)

2. **frontend/** - Next.js frontend application
   - `app/` - Next.js App Router pages and layouts
   - `public/` - Static assets

3. **docs/** - Project documentation
   - `media/` - Images, diagrams, and GIFs for documentation

---

## Credits

This application was developed by the ASU Cloud Innovation Center team.

Thanks to the ASU Cloud Innovation Center Technical and Project Management teams for their guidance and support.

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

