# Deployment Guide

This guide provides step-by-step instructions for deploying ADA Clara.

---

## Table of Contents

- [Deployment Guide](#deployment-guide)
  - [Requirements](#requirements)
  - [Pre-Deployment](#pre-deployment)
    - [AWS Account Setup](#aws-account-setup)
    - [CLI Tools Installation](#cli-tools-installation)
    - [Environment Configuration](#environment-configuration)
  - [Deployment](#deployment)
    - [Backend Deployment](#backend-deployment)
    - [Frontend Deployment](#frontend-deployment)
  - [Post-Deployment Verification](#post-deployment-verification)
  - [Troubleshooting](#troubleshooting)

---

## Requirements

Before you deploy, you must have the following:

### Accounts
- [ ] **AWS Account** - [Create an AWS Account](https://aws.amazon.com/)
- [ ] AWS account with appropriate service quotas for Lambda, DynamoDB, API Gateway, and Bedrock

### CLI Tools
- [ ] **AWS CLI** (v2.x) - [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [ ] **Node.js** (v18.x or later) - [Install Node.js](https://nodejs.org/)
- [ ] **npm** (v9.x or later) - Included with Node.js
- [ ] **AWS CDK** (v2.x) - Install via `npm install -g aws-cdk`
- [ ] **Git** - [Install Git](https://git-scm.com/downloads)

### Access Permissions
- [ ] AWS IAM user/role with permissions for:
  - CloudFormation (full access)
  - Lambda (create, update, invoke)
  - API Gateway (full access)
  - DynamoDB (create tables, read/write)
  - S3 (create buckets, read/write)
  - Bedrock (invoke models, manage knowledge bases)
  - Cognito (create user pools, manage users)
  - Amplify (create apps, manage deployments)
  - CodeBuild (create projects, start builds)
  - EventBridge (create rules)
  - IAM (create roles and policies)
  - CloudWatch Logs (create log groups)

### Software Dependencies
- [ ] Git - [Install Git](https://git-scm.com/downloads)
- [ ] Bash shell (for running deployment script)

---

## Pre-Deployment

### AWS Account Setup

1. **Configure AWS CLI**
   ```bash
   aws configure
   ```
   Enter your:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region: `us-west-2` (or your preferred region)
   - Default output format: `json`

2. **Verify AWS credentials**
   ```bash
   aws sts get-caller-identity
   ```
   This should display your AWS account ID and user ARN.

3. **Bootstrap CDK** (first-time CDK users only)
   ```bash
   cd backend
   cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$(aws configure get region)
   ```
   This bootstraps CDK in your account and region.

### CLI Tools Installation

1. **Install Node.js dependencies for backend**
   ```bash
   cd backend
   npm install
   ```

2. **Install Node.js dependencies for frontend**
   ```bash
   cd frontend
   npm install
   ```

3. **Install AWS CDK globally** (if not already installed)
   ```bash
   npm install -g aws-cdk
   ```

### Environment Configuration

The deployment script automatically handles environment configuration. No manual environment variable setup is required for basic deployment.

**Note**: The deployment script uses dynamic values from:
- AWS CLI configuration (region, account ID)
- CDK context variables (environment, tableVersion)
- AWS service outputs (API Gateway URL, Amplify App ID)

If you need to customize the deployment, you can modify the `deploy.sh` script or pass context variables to CDK:

```bash
cdk deploy --context environment=dev --context tableVersion=v2
```

---

## Deployment

ADA Clara uses a unified deployment script that handles both backend and frontend deployment automatically.

### Unified Deployment

1. **Navigate to the project root**
   ```bash
   cd /path/to/ADA-Clara
   ```

2. **Make the deployment script executable** (if needed)
   ```bash
   chmod +x deploy.sh
   ```

3. **Run the deployment script**
   ```bash
   ./deploy.sh
   ```

   The script will:
   - Verify AWS credentials and region configuration
   - Install backend dependencies
   - Deploy the CDK stack (all backend resources)
   - Create or update the Amplify app
   - Configure CodeBuild for CI/CD
   - Set up the buildspec.yml for automated builds
   - Deploy the frontend to Amplify
   - Optionally trigger the web scraper to populate the knowledge base

4. **Follow the prompts**
   - The script will ask for confirmation before deploying
   - After successful deployment, you'll be prompted whether to populate the knowledge base with the web scraper
   - Answer `y` to trigger the scraper, or `n` to skip

### Manual Backend Deployment (Alternative)

If you prefer to deploy manually:

1. **Navigate to the backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Synthesize the CloudFormation template** (optional, for review)
   ```bash
   cdk synth
   ```

4. **Deploy the backend stack**
   ```bash
   cdk deploy AdaClaraUnifiedStack
   ```
   
   When prompted:
   - Review the IAM changes
   - Type `y` to confirm deployment

5. **Note the outputs**
   
   After deployment, note down the following outputs:
   - **API Endpoint**: The API Gateway URL
   - **User Pool ID**: For admin authentication
   - **Amplify App ID**: If Amplify app was created
   
   > **Important**: Save these values as they will be needed for frontend configuration

### Manual Frontend Deployment (Alternative)

The frontend is automatically deployed via Amplify when using the unified script. For manual deployment:

1. **The frontend is configured to deploy via AWS Amplify**
   - Connect your GitHub repository to Amplify
   - Amplify will automatically build and deploy on git push
   - Or use the Amplify CLI to deploy manually

---

## Post-Deployment Verification

### Verify Backend Deployment

1. **Check CloudFormation stack status**
   ```bash
   aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack
   ```
   
   Expected status: `CREATE_COMPLETE` or `UPDATE_COMPLETE`

2. **Test API health endpoint**
   ```bash
   curl -X GET https://[API_ID].execute-api.[REGION].amazonaws.com/prod/health
   ```
   
   Expected response: `{"status": "healthy"}`

3. **Check Lambda functions**
   ```bash
   aws lambda list-functions --query "Functions[?contains(FunctionName, 'ada-clara')]"
   ```
   
   You should see 5 Lambda functions:
   - `ada-clara-chat-processor-[env]`
   - `ada-clara-admin-analytics-[env]`
   - `ada-clara-escalation-handler-[env]`
   - `ada-clara-rag-processor-[env]`
   - `ada-clara-web-scraper-[env]`

4. **Verify DynamoDB tables**
   ```bash
   aws dynamodb list-tables --query "TableNames[?contains(@, 'ada-clara')]"
   ```

### Verify Frontend Deployment

1. **Access the application**
   
   Navigate to the Amplify URL provided after deployment, or check:
   ```bash
   aws amplify list-apps --query "apps[?name=='AdaClara']"
   ```

2. **Test basic functionality**
   - [ ] Chat interface loads correctly
   - [ ] Can send a message and receive a response
   - [ ] Language switching works
   - [ ] Admin dashboard is accessible (requires login)

---

## Troubleshooting

### Common Issues

#### Issue: CDK Bootstrap Required
**Symptoms**: Error message: "This stack uses assets, so the toolkit stack must be deployed to the environment"

**Solution**:
```bash
cd backend
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$(aws configure get region)
```

#### Issue: Region Not Configured
**Symptoms**: Error: "AWS region must be set via CDK_DEFAULT_REGION or AWS_REGION environment variable"

**Solution**:
```bash
export AWS_REGION=us-west-2
# Or configure via AWS CLI
aws configure set region us-west-2
```

#### Issue: DynamoDB Table Already Exists
**Symptoms**: Error about table already existing in another stack

**Solution**:
The deployment uses a `tableVersion` context variable to create new tables. If you encounter conflicts:
```bash
cdk deploy --context tableVersion=v3
```
This will create tables with a `v3` suffix to avoid conflicts.

#### Issue: CDK Bootstrap Error
**Symptoms**: Error message about CDK not being bootstrapped

**Solution**:
```bash
cdk bootstrap aws://[ACCOUNT_ID]/[REGION]
```

#### Issue: Permission Denied
**Symptoms**: Access denied errors during deployment

**Solution**:
- Verify your AWS credentials are configured correctly
- Ensure your IAM user/role has the required permissions
- Check if you're deploying to the correct region

---

## Cleanup

To remove all deployed resources:

1. **Delete the CloudFormation stack**
   ```bash
   cd backend
   cdk destroy AdaClaraUnifiedStack
   ```
   
   When prompted, type `y` to confirm.

2. **Delete the Amplify app** (if created separately)
   ```bash
   aws amplify delete-app --app-id [AMPLIFY_APP_ID]
   ```

3. **Manually delete S3 buckets** (if they contain data)
   ```bash
   aws s3 rb s3://[BUCKET_NAME] --force
   ```

> **Warning**: This will delete all resources created by this stack, including:
> - All DynamoDB tables and data
> - All Lambda functions
> - API Gateway endpoints
> - Cognito user pools
> - S3 buckets and content
> - Bedrock Knowledge Base
> 
> Make sure to backup any important data before proceeding.

---

## Next Steps

After successful deployment:
1. Review the [User Guide](./userGuide.md) to learn how to use the application
2. Check the [API Documentation](./APIDoc.md) for integration details
3. See the [Modification Guide](./modificationGuide.md) for customization options

