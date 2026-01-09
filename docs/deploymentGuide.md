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

### Step 5: Run the Deployment Script

```bash
./deploy.sh
```

The deployment script will:
- Automatically detect your AWS account and region
- Verify AWS credentials
- Deploy all backend infrastructure (CDK stack)
- Create or update the Amplify app
- Configure CodeBuild for CI/CD
- Deploy the frontend application
- Optionally trigger the web scraper to populate the knowledge base

### Step 6: Follow the Prompts

During deployment, you'll be prompted to:

1. **Confirm deployment** - Review the deployment details and type `y` to proceed
2. **Populate knowledge base** - After successful deployment, you'll be asked if you want to populate the knowledge base with the web scraper
   - Type `y` to trigger the scraper (recommended for first-time deployment)
   - Type `n` to skip (you can run it later)

The deployment process typically takes 15-30 minutes depending on your AWS region and account configuration.

---

## What the Deployment Script Does

The `deploy.sh` script automates the entire deployment process:

### Backend Deployment
- **CDK Stack Deployment**: Deploys all AWS resources including:
  - Lambda functions (Chat Processor, RAG Processor, Admin Analytics, Escalation Handler, Domain Discovery, Content Processor)
  - DynamoDB tables (Chat Sessions, Messages, Analytics, Questions, Escalation Requests, Content Tracking)
  - API Gateway with all endpoints
  - Cognito User Pool for admin authentication
  - S3 buckets for content and vector storage
  - Bedrock Knowledge Base configuration
  - EventBridge rules for scheduled web scraping
- **Initial Web Scraping**: Triggers initial scrape of the diabetes.org domain and KB ingestion of scraped content

### Frontend Deployment
- **Amplify App Creation**: Creates or updates the AWS Amplify app
- **CodeBuild Configuration**: Sets up CodeBuild project for automated builds
- **Buildspec Setup**: Configures the build specification for frontend deployment
- **Automatic Deployment**: Triggers the frontend build and deployment

### Infrastructure Management
- **IAM Roles**: Creates necessary IAM roles and policies
- **Environment Variables**: Configures all required environment variables automatically
- **CORS Configuration**: Sets up CORS for API Gateway
- **Monitoring**: Configures CloudWatch Logs for all Lambda functions

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
   
   You should see 6 DynamoDB tables created.

4. **Verify S3 Content Bucket**
   ```bash
   # List S3 buckets to find the content bucket
   aws s3 ls | grep ada-clara-content
   ```

   You should see a bucket named: `ada-clara-content-{accountId}-{region}`

5. **Verify S3 Vectors Bucket**
   ```bash
   # List S3 Vectors buckets using the S3 Vectors API
   aws s3vectors list-vector-buckets --region $(aws configure get region)
   ```

   You should see a bucket named: `ada-clara-vectors-{accountId}-{region}`

   Alternatively, retrieve from CloudFormation outputs:
   ```bash
   aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack --query "Stacks[0].Outputs[?OutputKey=='VectorsBucketName'].OutputValue" --output text
   ```

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

#### Issue: Permission Denied
**Symptoms**: Access denied errors during deployment

**Solution**:
- Verify your IAM user/role has the required permissions
- The deployment requires permissions for: CloudFormation, Lambda, API Gateway, DynamoDB, S3, Bedrock, Cognito, Amplify, CodeBuild, EventBridge, IAM, and CloudWatch Logs
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

4. **Manually delete S3 buckets** (if they still exist and contain data)
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
5. Navigate to S3 and manually delete any remaining buckets

> **Warning**: This will delete all resources created by this deployment, including:
> - All DynamoDB tables and data
> - All Lambda functions and their logs
> - API Gateway endpoints
> - Cognito user pools and users
> - S3 buckets and all content (scraped content, vectors)
> - Bedrock Knowledge Base
> - CodeBuild projects
> - EventBridge rules
> 
> **This action cannot be undone.** Make sure to backup any important data before proceeding.

---

## Next Steps

After successful deployment:
1. Review the [User Guide](./userGuide.md) to learn how to use the application
2. Check the [API Documentation](./APIDoc.md) for integration details
3. See the [Modification Guide](./modificationGuide.md) for customization options

