# Deployment Guide

This guide provides step-by-step instructions for deploying ADA Clara. The deployment process is simple and can be completed entirely from AWS CloudShell with no local dependencies required.

---

## Table of Contents

- [Deployment Guide](#deployment-guide)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Detailed Deployment Steps](#detailed-deployment-steps)
  - [What the Deployment Script Does](#what-the-deployment-script-does)
  - [Post-Deployment Verification](#post-deployment-verification)
  - [Troubleshooting](#troubleshooting)
  - [Cleanup](#cleanup)

---

## Prerequisites

Before you deploy, ensure you have:

- [ ] **AWS Account** - [Create an AWS Account](https://aws.amazon.com/)
- [ ] AWS account with appropriate service quotas for Lambda, DynamoDB, API Gateway, Bedrock, Amplify, and CodeBuild
- [ ] IAM permissions for the services listed above (typically AdministratorAccess or equivalent)
- [ ] **Anthropic Model Access in AWS Bedrock** (REQUIRED) - Claude models require use case approval:
  1. Navigate to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/) → **Chat/Text Playground**
  2. Choose any Anthopic model and you will be prompted to fill out the use case form
     - **Use case**: Healthcare chatbot for diabetes education and patient support
     - **Description**: AI-powered conversational assistant providing evidence-based diabetes information from diabetes.org
  3. Wait for approval (typically **1-2 business days**)
  4. Verify access status by chatting with any Claude model in Chat/Text Playground

  > **CRITICAL**: Deployment will fail without Bedrock model access. Do not proceed until access is granted.

> **Note**: No local installation required! All deployment is done from AWS CloudShell, which comes pre-configured with AWS CLI, Git, and other necessary tools. The deployment uses AWS CodeBuild for building, so no local Node.js, npm, or CDK installation is needed.

---

## Quick Start

Deploying ADA Clara is straightforward - everything can be done from AWS CloudShell:

1. Open AWS Console and start CloudShell
2. Clone the repository
3. Make the deployment script executable
4. Run the script

That's it! The deployment script handles everything automatically.

---

## Detailed Deployment Steps

### Step 1: Open AWS CloudShell

1. Log in to your [AWS Console](https://console.aws.amazon.com/)
2. Click on the **CloudShell** icon in the top navigation bar (or search for "CloudShell" in the services search)
3. Wait for CloudShell to initialize (this may take a few moments on first use)

> **Note**: AWS CloudShell comes pre-configured with AWS CLI, Git, and other essential tools. No local installation is required.

### Step 2: Clone the Repository

In the CloudShell terminal, run:

```bash
git clone https://github.com/ASUCICREPO/ADA-Clara.git
```

This will clone the repository into your CloudShell environment.

### Step 3: Navigate to the Project Directory

```bash
cd ADA-Clara
```

### Step 4: Make the Deployment Script Executable

```bash
chmod +x deploy.sh
```

This grants execute permissions to the deployment script.

> **Note for Forked Repositories**: If you forked this repository to your own organization, you must update the `REPOSITORY_URL` in `deploy.sh` (line 23) to point to your fork instead of the original repository. This ensures CodeBuild pulls code from your fork. Example: `REPOSITORY_URL="https://github.com/YOUR-ORG/ADA-Clara.git"`

### Step 5: Run the Deployment Script

```bash
./deploy.sh
```

The deployment script will:
- Automatically detect your AWS account and region
- Create CodeBuild IAM service role with deployment permissions
- Verify AWS credentials
- Create or update the Amplify app with custom rewrite rules
- Configure CodeBuild project for unified deployment
- Trigger CodeBuild to deploy backend infrastructure (CDK stack)
- Trigger CodeBuild to build and deploy the frontend application
- Automatically trigger web scraper to populate the knowledge base (~1200 URLs from diabetes.org)
- Stream real-time build logs from CodeBuild

### Step 6: Monitor Deployment

The script will automatically stream deployment logs to your terminal. Watch for:

1. **Backend deployment phase** - CDK stack creation with all Lambda functions, DynamoDB tables, API Gateway, Cognito, S3 buckets, Bedrock KB
2. **Frontend deployment phase** - Next.js build, runtime-config.json generation, Amplify deployment
3. **Knowledge base population** - Automatic invocation of web scraper for initial content ingestion

**Total deployment time**: Approximately **30-40 minutes** depending on your AWS region:
- Backend + frontend deployment: ~10-15 minutes
- Knowledge base population: ~10-15 minutes (content processing + ingestion)
  - URL discovery: ~1-2 minutes
  - Content processing: ~5-10 minutes (~1200 URLs, 3 concurrent processors)
  - Sentinel delay: 5 minutes (allows in-flight batches to complete)
  - KB ingestion trigger: Automatic

---

## What the Deployment Script Does

The `deploy.sh` script automates the entire deployment process:

### Backend Deployment
- **CDK Stack Deployment**: Deploys all AWS resources including:
  - **Lambda functions** (6 total, Node.js 24.x runtime):
    - `chat-handler` - Main chat processing with integrated RAG (1536MB, 5min timeout)
    - `analytics-processor` - Async analytics processing and public endpoints (512MB, 60s timeout)
    - `admin-analytics` - Admin dashboard data aggregation (512MB, 30s timeout)
    - `escalation-handler` - Escalation form handling with rate limiting (512MB, 30s timeout)
    - `domain-discovery` - Weekly URL discovery from diabetes.org (1024MB, 15min timeout)
    - `content-processor` - Web scraping, quality assessment, KB ingestion (1024MB, 15min timeout)
  - **DynamoDB tables** (3 total with on-demand billing):
    - `ada-clara-data-table` - Consolidated data (Sessions, Messages, Analytics, Questions via single-table design)
    - `ada-clara-escalation-requests` - User escalation submissions and auto-escalations
    - `ada-clara-content-tracking` - Web scraping progress and content change detection
  - **API Gateway** (HTTP API v2) with all endpoints and Cognito JWT authorizer
  - **Cognito** User Pool and Identity Pool for admin authentication
  - **S3 buckets** for content storage (Markdown files) and vector embeddings (S3 Vectors)
  - **Bedrock Knowledge Base** configuration with Titan Text Embedding V2
  - **EventBridge** rules for weekly scheduled web scraping (Sundays 2 AM UTC)
  - **SQS queues** for URL batch processing with dead letter queue
- **Automatic Knowledge Base Population**: Automatically triggers comprehensive scraping of diabetes.org domain (~1200 URLs) and KB ingestion after deployment completes

### Frontend Deployment
- **Amplify App Creation**: Creates or updates the AWS Amplify app with custom rewrite rules for Next.js static export:
  - Admin route handling (`/admin` → `/admin.html`, `/admin/login` → `/admin/login.html`)
  - Static asset serving (`/_next/static/<*>`)
  - Fallback routing (`/<*>` → `/index.html`)
- **CodeBuild Configuration**: Sets up unified CodeBuild project with ARM container (BUILD_GENERAL1_LARGE compute):
  - **Image**: aws/codebuild/amazonlinux-aarch64-standard:3.0
  - **Runtime**: Node.js 22
  - **Build phases** (defined in buildspec.yml):
    - **install**: Installs AWS CDK CLI, zip, jq utilities
    - **pre_build**: Installs backend dependencies, Lambda dependencies for all 6 functions, builds TypeScript, bootstraps CDK
    - **build**: Deploys CDK stack, extracts CloudFormation outputs, updates analytics-processor Lambda with runtime config, installs frontend dependencies, generates runtime-config.json, builds Next.js application
    - **post_build**: Creates Amplify deployment, uploads build.zip to pre-signed S3 URL, starts deployment job
- **Runtime Configuration Generation**: Dynamically generates runtime-config.json with API Gateway URL, Cognito config, and frontend URL
- **Analytics Processor Post-Deployment Update**: Updates analytics-processor Lambda environment variables after CDK deployment to resolve circular dependency (requires API Gateway URL and Frontend URL from CloudFormation outputs)

### Infrastructure Management
- **IAM Service Role**: Creates CodeBuild service role (`{PROJECT_NAME}-service-role`) with comprehensive deployment policy:
  - **Trust policy**: Allows codebuild.amazonaws.com to assume role
  - **Inline policy** (DeploymentPolicy): Grants full permissions for cloudformation, iam, lambda, dynamodb, s3, bedrock, amplify, codebuild, logs, apigateway, cognito-idp, cognito-identity, ssm, events, s3vectors, ecr, sts
  - Role ARN used by CodeBuild project for all deployment operations
- **Environment Variables**: Configures all required environment variables automatically across Lambda functions and frontend
- **CORS Configuration**: Sets up CORS for API Gateway (HTTP API v2) to allow requests from Amplify frontend and localhost
- **Monitoring**: Configures CloudWatch Logs for all Lambda functions with automatic log group creation
- **Build Log Streaming**: Real-time log streaming from CodeBuild with filtering for phase transitions, CDK outputs, errors, and success messages

> **Key Advantage**: Since the deployment uses AWS CodeBuild, all building and compilation happens in the cloud. You don't need Node.js, npm, or CDK installed locally - everything runs in CloudShell and CodeBuild.

---

## Post-Deployment Verification

After the deployment script completes successfully, verify that everything is working:

### Verify Backend Deployment

In CloudShell, run these commands to verify backend resources:

1. **Check CloudFormation stack status**
   ```bash
   aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack --query "Stacks[0].StackStatus" --output text
   ```
   
   Expected output: `CREATE_COMPLETE` or `UPDATE_COMPLETE`

2. **Check Lambda functions**
   ```bash
   aws lambda list-functions --query "Functions[?contains(FunctionName, 'ada-clara')].FunctionName" --output table
   ```
   
   You should see 6 Lambda functions listed.

3. **Verify DynamoDB tables**
   ```bash
   aws dynamodb list-tables --query "TableNames[?contains(@, 'ada-clara')]" --output table
   ```

   You should see 3 DynamoDB tables created:
   - `ada-clara-data-table` (consolidated Sessions, Messages, Analytics, Questions)
   - `ada-clara-escalation-requests`
   - `ada-clara-content-tracking`

4. **Verify S3 Content Bucket**
   ```bash
   # Get account ID and region
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   REGION=$(aws configure get region)

   # List content bucket
   aws s3 ls | grep ada-clara-content
   ```

   You should see a bucket named: `ada-clara-content-${ACCOUNT_ID}-${REGION}` (without environment suffix for production)

5. **Verify S3 Vectors Bucket**
   ```bash
   # Get vectors bucket name from CloudFormation
   aws cloudformation describe-stacks \
     --stack-name AdaClaraUnifiedStack \
     --query "Stacks[0].Outputs[?OutputKey=='VectorsBucketName'].OutputValue" \
     --output text
   ```

   You should see a bucket named: `ada-clara-vectors-${ACCOUNT_ID}-${REGION}`

6. **Verify S3 Vectors Index**
   ```bash
   # Get the vectors bucket name from CloudFormation
   VECTORS_BUCKET=$(aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack --query "Stacks[0].Outputs[?OutputKey=='VectorsBucketName'].OutputValue" --output text)

   # List indexes in the vectors bucket
   aws s3vectors list-indexes --vector-bucket-name $VECTORS_BUCKET --region $(aws configure get region)
   ```

   You should see an index named: `ada-clara-index`

7. **Get API Gateway endpoint** (from deployment output or CloudFormation)
   ```bash
   aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" --output text
   ```

### Verify Frontend Deployment

1. **Get Amplify App URL**
   
   The deployment script will display the Amplify URL at the end. You can also retrieve it:
   ```bash
   aws amplify list-apps --query "apps[?name=='AdaClara'].defaultDomain" --output text
   ```
   
   The application will be available at: `https://main.[APP_ID].amplifyapp.com`

2. **Test the application**
   - Open the Amplify URL in your browser
   - [ ] Chat interface loads correctly
   - [ ] Can send a message and receive a response
   - [ ] Language switching works
   - [ ] Admin dashboard is accessible at `/admin` (requires Cognito login)

### Verify Knowledge Base

1. **Check web scraper logs**
   ```bash
   aws logs tail /aws/lambda/ada-clara-content-processor --follow --region $(aws configure get region)
   ```
   
   Look for successful completion messages.

2. **Verify content in S3**
   ```bash
   # Construct the content bucket name
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   REGION=$(aws configure get region)
   CONTENT_BUCKET="ada-clara-content-${ACCOUNT_ID}-${REGION}"

   # List scraped content files
   aws s3 ls s3://${CONTENT_BUCKET}/ --recursive | head -20
   ```

   You should see scraped content files with `.md` extensions.

3. **Verify Knowledge Base sync**

   Allow 30 minutes for the full web scraper pipeline to run, then check the logs:

   ```bash
   # Check Content Processor logs for KB ingestion
   aws logs tail /aws/lambda/ada-clara-content-processor --since 30m --region $(aws configure get region) | grep -i "ingestion"
   ```

   **Expected output should include:**
   ```
   TRIGGER_INGESTION sentinel received
   Initiating Knowledge Base ingestion...
   ✓ Knowledge Base ingestion job started successfully!
   Ingestion Job ID: INGESTION-xxxxx
   ```

   If you see these messages, your Knowledge Base has been automatically populated and is ready to use!

---

## Troubleshooting

### Common Issues

#### Issue: CloudShell Session Expired
**Symptoms**: CloudShell session times out during deployment

**Solution**:
- CloudShell sessions remain active for up to 20 minutes of inactivity
- If your session expires, simply restart CloudShell and navigate back to the project:
  ```bash
  cd ADA-Clara
  ```
- The deployment script can be safely re-run - it will detect existing resources and update them

#### Issue: Region Not Configured
**Symptoms**: Error: "AWS region must be set via CDK_DEFAULT_REGION or AWS_REGION environment variable"

**Solution**:
In CloudShell, set your region:
```bash
export AWS_REGION=us-west-2
# Or set it permanently
aws configure set region us-west-2
```

Then re-run the deployment script:
```bash
./deploy.sh
```

#### Issue: Bedrock Model Access Denied
**Symptoms**: Error during chat-handler Lambda invocation about Bedrock model access, or CDK deployment fails with Bedrock permissions error

**Solution**:
- This means you haven't completed the Anthropic model access request in Bedrock (see Prerequisites)
- Navigate to AWS Bedrock Console → Model access → Request access for Anthropic Claude models
- Wait for approval (typically 1-2 business days)
- Verify access by testing Claude in the Chat/Text Playground
- Once approved, re-run the deployment script

#### Issue: Permission Denied
**Symptoms**: Access denied errors during deployment

**Solution**:
- Verify your IAM user/role has the required permissions
- The deployment requires permissions for: CloudFormation, Lambda, API Gateway, DynamoDB, S3, Bedrock, Cognito, Amplify, CodeBuild, EventBridge, IAM, CloudWatch Logs, S3 Vectors, and SQS
- Check your IAM permissions in the AWS Console
- If using an IAM user, ensure they have AdministratorAccess or equivalent permissions

#### Issue: DynamoDB Table Already Exists
**Symptoms**: Error about table already existing in another stack

**Solution**:
The deployment script handles this automatically by using versioned table names. If you encounter conflicts, the script will provide guidance. You can also manually specify a different table version by modifying the script or using CDK context variables.

#### Issue: Deployment Script Fails Midway
**Symptoms**: Script fails partway through deployment

**Solution**:
- Check the error message in CloudShell for specific details
- Review CloudFormation stack events:
  ```bash
  aws cloudformation describe-stack-events --stack-name AdaClaraUnifiedStack --max-items 10
  ```
- The script is idempotent - you can safely re-run it:
  ```bash
  ./deploy.sh
  ```
- It will detect existing resources and update them rather than creating duplicates

#### Issue: CodeBuild Build Fails
**Symptoms**: Frontend deployment fails during CodeBuild phase

**Solution**:
- Check CodeBuild logs in the AWS Console:
  - Navigate to CodeBuild → Build projects → Find your project → View recent builds
- Common issues:
  - Missing environment variables (should be handled automatically by the script)
  - Build timeout (increase timeout in buildspec.yml if needed)
  - Dependency installation failures (check buildspec.yml configuration)

---

## Cleanup

To remove all deployed resources, you can delete them from CloudShell:

### Option 1: Delete via CloudFormation (Recommended)

1. **Delete the CloudFormation stack** (this removes most resources)
   ```bash
   aws cloudformation delete-stack --stack-name AdaClaraUnifiedStack
   ```

2. **Wait for stack deletion to complete**
   ```bash
   aws cloudformation wait stack-delete-complete --stack-name AdaClaraUnifiedStack
   ```

3. **Delete the Amplify app**
   ```bash
   # Get the Amplify App ID
   APP_ID=$(aws amplify list-apps --query "apps[?name=='AdaClara'].appId" --output text)

   # Delete the app
   aws amplify delete-app --app-id $APP_ID
   ```

4. **Delete CodeBuild project**
   ```bash
   # List CodeBuild projects to find the project name (contains ada-clara timestamp)
   aws codebuild list-projects --query "projects[?contains(@, 'ada-clara')]" --output table

   # Delete the project (replace PROJECT_NAME with actual name)
   aws codebuild delete-project --name PROJECT_NAME
   ```

5. **Delete IAM service role**
   ```bash
   # List IAM roles to find the service role (contains ada-clara timestamp)
   aws iam list-roles --query "Roles[?contains(RoleName, 'ada-clara')].RoleName" --output table

   # Delete role policies first
   aws iam delete-role-policy --role-name ROLE_NAME --policy-name DeploymentPolicy

   # Delete the role
   aws iam delete-role --role-name ROLE_NAME
   ```

6. **Manually delete S3 buckets** (if they still exist and contain data)
   ```bash
   # List buckets
   aws s3 ls | grep ada-clara

   # Delete each bucket (replace BUCKET_NAME with actual bucket name)
   aws s3 rb s3://BUCKET_NAME --force
   ```

### Option 2: Delete via AWS Console

1. Navigate to CloudFormation in AWS Console
2. Select `AdaClaraUnifiedStack`
3. Click "Delete"
4. Navigate to Amplify and delete the `AdaClara` app
5. Navigate to CodeBuild and delete the deployment project
6. Navigate to IAM and delete the CodeBuild service role
7. Navigate to S3 and manually delete any remaining buckets

> **Warning**: This will delete all resources created by this deployment, including:
> - All DynamoDB tables and data (3 tables: data-table, escalation-requests, content-tracking)
> - All Lambda functions and their logs (6 functions: chat-handler, analytics-processor, admin-analytics, escalation-handler, domain-discovery, content-processor)
> - API Gateway (HTTP API v2) endpoints
> - Cognito user pools and users
> - S3 buckets and all content (content bucket with Markdown files, vectors bucket with embeddings)
> - Bedrock Knowledge Base and data source
> - CodeBuild project and build history
> - IAM service role and policies
> - EventBridge rules (weekly web scraper schedule)
> - SQS queues (scraping queue and dead letter queue)
> - CloudWatch log groups
>
> **This action cannot be undone.** Make sure to backup any important data before proceeding.

---

## Next Steps

After successful deployment:
1. Review the [User Guide](./userGuide.md) to learn how to use the application
2. Check the [API Documentation](./APIDoc.md) for integration details
3. See the [Modification Guide](./modificationGuide.md) for customization options

