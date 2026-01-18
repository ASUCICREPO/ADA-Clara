#!/bin/bash
# Complete End-to-End Deployment Pipeline for ADA Clara
# Unified deployment for both backend and frontend

set -euo pipefail

# Configuration - All dynamic, no hardcoded values
TIMESTAMP=$(date +%Y%m%d%H%M%S)
PROJECT_NAME="ada-clara-${TIMESTAMP}"
STACK_NAME="AdaClaraUnifiedStack"
# Dynamically detect region - no hardcoded fallback
AWS_REGION=${AWS_REGION:-$(aws configure get region)}
if [ -z "$AWS_REGION" ]; then
  print_error "AWS region not found. Please set AWS_REGION environment variable or configure AWS CLI with 'aws configure set region <region>'"
fi
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AMPLIFY_APP_NAME="AdaClara"
CODEBUILD_PROJECT_NAME="${PROJECT_NAME}-deployment"

# IMPORTANT: If you forked this repository, update the URL below to your fork
# Example: REPOSITORY_URL="https://github.com/YOUR-ORG/ADA-Clara.git"
# This ensures CodeBuild pulls code from your fork instead of the original repository
REPOSITORY_URL="https://github.com/ASUCICREPO/ADA-Clara.git"

# Global variables
API_GATEWAY_URL=""
AMPLIFY_APP_ID=""
AMPLIFY_URL=""
ROLE_ARN=""

# Function to print output
print_status() {
    echo "[INFO] $1"
}

print_success() {
    echo "[SUCCESS] $1"
}

print_error() {
    echo "[ERROR] $1"
    exit 1
}

print_warning() {
    echo "[WARNING] $1"
}

print_codebuild() {
    echo "[CODEBUILD] $1"
}

print_amplify() {
    echo "[AMPLIFY] $1"
}

# Color codes for log output (optional - graceful fallback if terminal doesn't support)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Phase 1: Create IAM Service Role ---
print_status "Phase 1: Creating IAM Service Role..."

ROLE_NAME="${PROJECT_NAME}-service-role"
print_status "Checking for IAM role: $ROLE_NAME"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    print_success "IAM role exists"
    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
else
    print_status "Creating IAM role: $ROLE_NAME"
    TRUST_DOC='{
      "Version":"2012-10-17",
      "Statement":[{
        "Effect":"Allow",
        "Principal":{"Service":"codebuild.amazonaws.com"},
        "Action":"sts:AssumeRole"
      }]
    }'

    ROLE_ARN=$(aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy-document "$TRUST_DOC" \
      --query 'Role.Arn' --output text)

    print_status "Attaching custom deployment policy..."
    CUSTOM_POLICY='{
      "Version": "2012-10-17",
      "Statement": [
          {
              "Sid": "FullDeploymentAccess",
              "Effect": "Allow",
              "Action": [
                  "cloudformation:*",
                  "iam:*",
                  "lambda:*",
                  "dynamodb:*",
                  "s3:*",
                  "bedrock:*",
                  "amplify:*",
                  "codebuild:*",
                  "logs:*",
                  "apigateway:*",
                  "cognito-idp:*",
                  "cognito-identity:*",
                  "ssm:*",
                  "events:*",
                  "s3vectors:*",
                  "ecr:*"
              ],
              "Resource": "*"
          },
          {
              "Sid": "STSAccess",
              "Effect": "Allow",
              "Action": ["sts:GetCallerIdentity", "sts:AssumeRole"],
              "Resource": "*"
          }
      ]
    }'

    aws iam put-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-name "DeploymentPolicy" \
      --policy-document "$CUSTOM_POLICY"

    print_success "IAM role created"
    print_status "Waiting for IAM role to propagate for 10 seconds..."
    sleep 10
fi

# --- Phase 2: Create Amplify App (Static Hosting) ---
print_amplify "Phase 2: Creating Amplify Application for Static Hosting..."

# Check if app already exists
EXISTING_APP_ID=$(AWS_PAGER="" aws amplify list-apps --query "apps[?name=='$AMPLIFY_APP_NAME'].appId" --output text --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ -n "$EXISTING_APP_ID" ] && [ "$EXISTING_APP_ID" != "None" ]; then
    print_warning "Amplify app '$AMPLIFY_APP_NAME' already exists with ID: $EXISTING_APP_ID"
    AMPLIFY_APP_ID=$EXISTING_APP_ID
else
    # Create Amplify app for static hosting
    print_status "Creating Amplify app for static hosting: $AMPLIFY_APP_NAME"

    AMPLIFY_APP_ID=$(AWS_PAGER="" aws amplify create-app \
        --name "$AMPLIFY_APP_NAME" \
        --description "ADA Clara Chatbot Application" \
        --platform WEB \
        --query 'app.appId' \
        --output text \
        --region "$AWS_REGION")

    if [ -z "$AMPLIFY_APP_ID" ] || [ "$AMPLIFY_APP_ID" = "None" ]; then
        print_error "Failed to create Amplify app"
        exit 1
    fi
    print_success "Amplify app created with ID: $AMPLIFY_APP_ID"

    # Configure custom rewrite rules for Next.js static export
    print_status "Configuring Amplify custom rewrite rules for Next.js..."
    AWS_PAGER="" aws amplify update-app \
        --app-id "$AMPLIFY_APP_ID" \
        --custom-rules '[
            {
                "source": "/_next/static/<*>",
                "target": "/_next/static/<*>",
                "status": "200"
            },
            {
                "source": "/admin",
                "target": "/admin.html",
                "status": "200"
            },
            {
                "source": "/admin/",
                "target": "/admin.html",
                "status": "200"
            },
            {
                "source": "/admin/login",
                "target": "/admin/login.html",
                "status": "200"
            },
            {
                "source": "/admin/login/",
                "target": "/admin/login.html",
                "status": "200"
            },
            {
                "source": "/<*>",
                "target": "/index.html",
                "status": "404-200"
            }
        ]' \
        --region "$AWS_REGION" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        print_success "Amplify custom rewrite rules configured"
    else
        print_warning "Failed to configure custom rewrite rules - frontend routing may not work correctly"
    fi
fi

# Check if main branch exists
EXISTING_BRANCH=$(AWS_PAGER="" aws amplify get-branch \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name main \
    --query 'branch.branchName' \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$EXISTING_BRANCH" = "main" ]; then
    print_warning "main branch already exists"
else
    # Create main branch
    print_status "Creating main branch..."

    AWS_PAGER="" aws amplify create-branch \
        --app-id "$AMPLIFY_APP_ID" \
        --branch-name main \
        --description "Main production branch" \
        --stage PRODUCTION \
        --no-enable-auto-build \
        --region "$AWS_REGION" || print_error "Failed to create Amplify branch."
    print_success "main branch created"
fi

# --- Phase 3: Create Unified CodeBuild Project ---
print_codebuild "Phase 3: Creating Unified CodeBuild Project..."

# Get current git branch before building environment variables
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    print_warning "Failed to determine current git branch, defaulting to 'main'"
    SOURCE_BRANCH="main"
else
    SOURCE_BRANCH="$CURRENT_BRANCH"
    print_status "Using source branch: $SOURCE_BRANCH"
fi

# Amplify branch is always main for production frontend hosting
AMPLIFY_BRANCH="main"
print_status "Deploying to Amplify branch: $AMPLIFY_BRANCH"

# Build environment variables for unified deployment
ENV_VARS_ARRAY='{
    "name": "AMPLIFY_APP_ID",
    "value": "'"$AMPLIFY_APP_ID"'",
    "type": "PLAINTEXT"
  },{
    "name": "SOURCE_BRANCH",
    "value": "'"$SOURCE_BRANCH"'",
    "type": "PLAINTEXT"
  },{
    "name": "AMPLIFY_BRANCH",
    "value": "'"$AMPLIFY_BRANCH"'",
    "type": "PLAINTEXT"
  },{
    "name": "AWS_DEFAULT_REGION",
    "value": "'"$AWS_REGION"'",
    "type": "PLAINTEXT"
  },{
    "name": "CDK_DEFAULT_REGION",
    "value": "'"$AWS_REGION"'",
    "type": "PLAINTEXT"
  },{
    "name": "CDK_DEFAULT_ACCOUNT",
    "value": "'"$AWS_ACCOUNT_ID"'",
    "type": "PLAINTEXT"
  }'

ENVIRONMENT=$(cat <<EOF
{
  "type": "ARM_CONTAINER",
  "image": "aws/codebuild/amazonlinux-aarch64-standard:3.0",
  "computeType": "BUILD_GENERAL1_LARGE",
  "privilegedMode": true,
  "environmentVariables": [$ENV_VARS_ARRAY]
}
EOF
)

SOURCE='{
  "type":"GITHUB",
  "location":"'$REPOSITORY_URL'",
  "buildspec":"buildspec.yml"
}'

ARTIFACTS='{"type":"NO_ARTIFACTS"}'
SOURCE_VERSION="$SOURCE_BRANCH"

print_status "Creating unified CodeBuild project '$CODEBUILD_PROJECT_NAME'..."
AWS_PAGER="" aws codebuild create-project \
  --name "$CODEBUILD_PROJECT_NAME" \
  --source "$SOURCE" \
  --source-version "$SOURCE_VERSION" \
  --artifacts "$ARTIFACTS" \
  --environment "$ENVIRONMENT" \
  --service-role "$ROLE_ARN" \
  --output json > /dev/null || print_error "Failed to create CodeBuild project."

print_success "Unified CodeBuild project '$CODEBUILD_PROJECT_NAME' created."

# --- Phase 4: Start Unified Build ---
print_codebuild "Phase 4: Starting Unified Deployment (Backend + Frontend)..."

print_status "Starting deployment build for project '$CODEBUILD_PROJECT_NAME'..."
BUILD_ID=$(AWS_PAGER="" aws codebuild start-build \
  --project-name "$CODEBUILD_PROJECT_NAME" \
  --query 'build.id' \
  --output text)

if [ $? -ne 0 ]; then
  print_error "Failed to start the deployment build"
fi

print_success "Deployment build started successfully. Build ID: $BUILD_ID"

# Stream logs
print_status "Streaming deployment logs..."
print_status "Build ID: $BUILD_ID"
echo ""

# Extract log group and stream from build ID
LOG_GROUP="/aws/codebuild/$CODEBUILD_PROJECT_NAME"
LOG_STREAM=$(echo "$BUILD_ID" | cut -d':' -f2)

# Wait a few seconds for logs to start
sleep 5

# Stream logs with filtering for important outputs
BUILD_STATUS="IN_PROGRESS"
LAST_TOKEN=""

print_status "Monitoring build progress..."
echo ""

while [ "$BUILD_STATUS" = "IN_PROGRESS" ]; do
  # Get logs (allow failures - log streaming is optional)
  if [ -z "$LAST_TOKEN" ]; then
    LOG_OUTPUT=$(AWS_PAGER="" aws logs get-log-events \
      --log-group-name "$LOG_GROUP" \
      --log-stream-name "$LOG_STREAM" \
      --start-from-head \
      --output json 2>/dev/null || echo "")
  else
    LOG_OUTPUT=$(AWS_PAGER="" aws logs get-log-events \
      --log-group-name "$LOG_GROUP" \
      --log-stream-name "$LOG_STREAM" \
      --next-token "$LAST_TOKEN" \
      --output json 2>/dev/null || echo "")
  fi

  # Filter logs to show important milestones (wrapped in subshell to prevent pipeline failures from exiting script)
  if [ -n "$LOG_OUTPUT" ]; then
    (echo "$LOG_OUTPUT" | jq -r '.events[]?.message' 2>/dev/null || true) | while IFS= read -r line; do
      # Skip container metadata and empty lines
      if [[ "$line" =~ ^\[Container\] ]] || [[ -z "$line" ]]; then
        continue
      fi
      
      # Show phase transitions
      if [[ "$line" =~ "BACKEND DEPLOYMENT" ]] || \
         [[ "$line" =~ "FRONTEND DEPLOYMENT" ]] || \
         [[ "$line" =~ "Deploying CDK stack" ]] || \
         [[ "$line" =~ "Building Next.js" ]] || \
         [[ "$line" =~ "Deploying frontend to Amplify" ]]; then
        echo -e "${BLUE}[PHASE]${NC} $line"
        continue
      fi
      
      # Show CDK outputs (including Stack ARN value which appears after "Stack ARN:")
      if [[ "$line" =~ "Outputs:" ]] || [[ "$line" =~ "Stack ARN:" ]] || \
         [[ "$line" =~ ^[[:space:]]*arn:aws:cloudformation ]] || \
         [[ "$line" =~ ^AdaClaraUnifiedStack\. ]]; then
        echo -e "${GREEN}[CDK OUTPUT]${NC} $line"
        continue
      fi
      
      # Show errors with precise filtering - only show actual runtime errors, not script source code
      if [[ "$line" =~ "ERROR" ]] || [[ "$line" =~ "Error" ]] || [[ "$line" =~ "Failed" ]]; then
        should_skip=false

        # Skip lines that are bash script source code being echoed (not actual errors)
        # These patterns match buildspec.yml script content being logged
        if [[ "$line" =~ ^[[:space:]]*(if[[:space:]]+\[\[|echo[[:space:]]|grep[[:space:]]|\|[[:space:]]*grep) ]] || \
           [[ "$line" =~ ^[[:space:]]*[A-Z_]+=.*ERROR ]] || \
           [[ "$line" =~ ^[[:space:]]*[A-Z_]+=\$\(cat ]] || \
           [[ "$line" =~ DEPLOYMENT_ERROR ]] || \
           [[ "$line" =~ "Warning: Failed to install" ]] || \
           [[ "$line" =~ "\|\| echo" ]] || \
           [[ "$line" =~ "2>&1" ]] || \
           [[ "$line" =~ SyntaxError.*deployment_response\.json ]]; then
          should_skip=true
        fi

        if [ "$should_skip" = false ]; then
          echo -e "${RED}[ERROR]${NC} $line"
        fi
      fi
      
      # Show success messages
      if [[ "$line" =~ "successfully" ]] || [[ "$line" =~ "Complete deployment finished" ]]; then
        echo -e "${GREEN}[SUCCESS]${NC} $line"
      fi
    done

    LAST_TOKEN=$(echo "$LOG_OUTPUT" | jq -r '.nextForwardToken' 2>/dev/null || echo "")
  fi
  
  # Check build status
  BUILD_STATUS=$(AWS_PAGER="" aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].buildStatus' --output text)
  
  sleep 3
done

echo ""
print_status "Deployment build status: $BUILD_STATUS"

if [ "$BUILD_STATUS" != "SUCCEEDED" ]; then
  print_error "Deployment build failed with status: $BUILD_STATUS"
  print_status "Check CodeBuild logs for details: https://console.aws.amazon.com/codesuite/codebuild/projects/$CODEBUILD_PROJECT_NAME/build/$BUILD_ID/"
  exit 1
fi

print_success "Complete deployment finished successfully!"

# Extract API Gateway URL from CloudFormation
print_status "Extracting deployment information..."
API_GATEWAY_URL=$(AWS_PAGER="" aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey==\`ApiGatewayUrl\`].OutputValue" \
  --output text --region "$AWS_REGION")

if [ -z "$API_GATEWAY_URL" ] || [ "$API_GATEWAY_URL" = "None" ]; then
  print_warning "Could not extract API Gateway URL from CDK outputs"
  API_GATEWAY_URL="Check CloudFormation console"
fi

# Get Amplify URL
AMPLIFY_URL=$(AWS_PAGER="" aws amplify get-app \
    --app-id "$AMPLIFY_APP_ID" \
    --query 'app.defaultDomain' \
    --output text \
    --region "$AWS_REGION")

if [ -z "$AMPLIFY_URL" ] || [ "$AMPLIFY_URL" = "None" ]; then
    AMPLIFY_URL="main.$AMPLIFY_APP_ID.amplifyapp.com"
fi

# --- Final Summary ---
print_success "COMPLETE DEPLOYMENT SUCCESSFUL!"
echo ""
echo "Deployment Summary:"
echo "   API Gateway URL: $API_GATEWAY_URL"
echo "   Amplify App ID: $AMPLIFY_APP_ID"
echo "   Frontend URL: https://main.$AMPLIFY_URL"
echo "   CDK Stack: $STACK_NAME"
echo "   AWS Region: $AWS_REGION"
echo ""
echo "What was deployed:"
echo "   - DynamoDB tables for chat sessions, messages, analytics"
echo "   - Cognito User Pool and Identity Pool for authentication"
echo "   - API Gateway with Lambda functions (chat, escalation, admin)"
echo "   - S3 Vectors infrastructure for knowledge base"
echo "   - Bedrock Knowledge Base"
echo "   - Frontend built and deployed to Amplify"
echo ""
echo "Frontend URL: https://main.$AMPLIFY_URL"
echo ""

# --- Automatic Knowledge Base Population ---
echo ""
print_status "Automatically populating knowledge base..."
echo ""
echo "Starting web scraper pipeline:"
echo "   - Discovering up to 1200 high-quality pages from diabetes.org"
echo "   - Processing content with quality assessment and change detection"
echo "   - Triggering automatic Knowledge Base ingestion after processing"
echo "   - Total time: ~20-25 minutes for complete KB population"
echo ""

# Determine the script directory (where deploy.sh is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRAPING_SCRIPT="$SCRIPT_DIR/backend/scripts/trigger-web-scraper.sh"

# Check if the scraping script exists
if [ -f "$SCRAPING_SCRIPT" ]; then
  print_status "Running web scraper trigger script: $SCRAPING_SCRIPT"
  echo ""

  # Execute the scraping script (use source for Windows/MSYS2 compatibility)
  source "$SCRAPING_SCRIPT"
  SCRAPE_EXIT_CODE=$?

  if [ $SCRAPE_EXIT_CODE -eq 0 ]; then
    print_success "Knowledge base population started successfully!"
    echo ""
    print_status "The scraping pipeline is running in the background."
    print_status "KB ingestion will trigger automatically after content processing completes."
  else
    print_warning "Initial scraping script exited with code: $SCRAPE_EXIT_CODE"
    print_status "You can manually run the script later: $SCRAPING_SCRIPT"
  fi
else
  print_warning "Scraping script not found at: $SCRAPING_SCRIPT"
  print_status "You can manually trigger knowledge base population by running:"
  print_status "  ./backend/scripts/trigger-web-scraper.sh"
fi

echo ""
print_success "Deployment complete!"
