#!/bin/bash
# Complete End-to-End Deployment Pipeline for ADA Clara
# Unified deployment for both backend and frontend

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

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
REPOSITORY_URL="https://github.com/ASUCICREPO/ADA-Clara.git"

# Global variables
API_GATEWAY_URL=""
AMPLIFY_APP_ID=""
AMPLIFY_URL=""
ROLE_ARN=""

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_codebuild() {
    echo -e "${PURPLE}[CODEBUILD]${NC} $1"
}

print_amplify() {
    echo -e "${PURPLE}[AMPLIFY]${NC} $1"
}

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
                  "s3vectors:*"
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

# Build environment variables for unified deployment
ENV_VARS_ARRAY='{
    "name": "AMPLIFY_APP_ID",
    "value": "'"$AMPLIFY_APP_ID"'",
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
SOURCE_VERSION="simple-scraper"  # TODO: Change back to "main" after testing

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
  # Get logs
  if [ -z "$LAST_TOKEN" ]; then
    LOG_OUTPUT=$(AWS_PAGER="" aws logs get-log-events \
      --log-group-name "$LOG_GROUP" \
      --log-stream-name "$LOG_STREAM" \
      --start-from-head \
      --output json 2>/dev/null)
  else
    LOG_OUTPUT=$(AWS_PAGER="" aws logs get-log-events \
      --log-group-name "$LOG_GROUP" \
      --log-stream-name "$LOG_STREAM" \
      --next-token "$LAST_TOKEN" \
      --output json 2>/dev/null)
  fi
  
  # Filter logs to show important milestones
  if [ -n "$LOG_OUTPUT" ]; then
    echo "$LOG_OUTPUT" | jq -r '.events[]?.message' 2>/dev/null | while IFS= read -r line; do
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
      
      # Show errors with precise filtering
      if [[ "$line" =~ "ERROR" ]] || [[ "$line" =~ "Error" ]] || [[ "$line" =~ "Failed" ]]; then
        should_skip=false

        # Skip only if line looks like bash script source code (not execution output)
        # Check for: variable assignments, command syntax with pipes/redirects, or 'if [['
        if [[ "$line" =~ ^[[:space:]]*(if[[:space:]]+\[\[|echo[[:space:]]|grep[[:space:]]|\|[[:space:]]*grep) ]] || \
           [[ "$line" =~ ^[[:space:]]*[A-Z_]+=.*ERROR ]] || \
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
    
    LAST_TOKEN=$(echo "$LOG_OUTPUT" | jq -r '.nextForwardToken' 2>/dev/null)
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

# --- Interactive Web Scraper Prompt ---
echo ""
print_status "Knowledge Base Population"
echo ""
echo "Would you like to populate the knowledge base by scraping diabetes.org content?"
echo "This will:"
echo "   - Discover up to 1200 high-quality pages from diabetes.org using intelligent prioritization"
echo "   - Process content with enhanced HTML-to-Markdown conversion and quality assessment"
echo "   - Store content in S3 with proper structure for knowledge base ingestion"
echo "   - Take approximately 15-20 minutes to complete"
echo ""
read -p "Populate knowledge base now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  print_status "Allowing AWS resources to stabilize..."
  sleep 10

  # Get the domain discovery function name from CloudFormation
  DOMAIN_DISCOVERY_FUNCTION=$(AWS_PAGER="" aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='DomainDiscoveryFunctionName'].OutputValue" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")

  # If not found in outputs, construct the function name based on the pattern used in the stack
  if [ -z "$DOMAIN_DISCOVERY_FUNCTION" ] || [ "$DOMAIN_DISCOVERY_FUNCTION" = "None" ]; then
    # Use the same naming pattern as in the CDK stack
    ENVIRONMENT=$(echo "$STACK_NAME" | grep -o '\-dev\-v[0-9]*' || echo "")
    DOMAIN_DISCOVERY_FUNCTION="ada-clara-domain-discovery${ENVIRONMENT}"
    print_status "Using constructed function name: $DOMAIN_DISCOVERY_FUNCTION"
  else
    print_status "Found domain discovery function: $DOMAIN_DISCOVERY_FUNCTION"
  fi

  # Trigger initial domain discovery and scraping
  print_status "Triggering comprehensive diabetes.org domain discovery..."

  SCRAPER_PAYLOAD='{
    "action": "discover-domain"
  }'

  # Invoke the domain discovery Lambda function
  SCRAPER_RESULT=$(AWS_PAGER="" aws lambda invoke \
    --function-name "$DOMAIN_DISCOVERY_FUNCTION" \
    --payload "$SCRAPER_PAYLOAD" \
    --region "$AWS_REGION" \
    /tmp/scraper-response.json 2>&1)

  if [ $? -eq 0 ]; then
    # Check if the invocation was successful
    STATUS_CODE=$(echo "$SCRAPER_RESULT" | jq -r '.StatusCode' 2>/dev/null || echo "200")
    
    if [ "$STATUS_CODE" = "200" ]; then
      print_success "Initial scraping triggered successfully!"
      
      # Try to extract some basic info from the response
      if [ -f "/tmp/scraper-response.json" ]; then
        RESPONSE_BODY=$(cat /tmp/scraper-response.json | jq -r '.body' 2>/dev/null || echo "")
        if [ -n "$RESPONSE_BODY" ] && [ "$RESPONSE_BODY" != "null" ]; then
          PARSED_BODY=$(echo "$RESPONSE_BODY" | jq -r '.result.summary' 2>/dev/null || echo "")
          if [ -n "$PARSED_BODY" ] && [ "$PARSED_BODY" != "null" ]; then
            print_status "Scraping summary: $PARSED_BODY"
          fi
        fi
      fi
      
      print_status "The domain discovery function is now scraping diabetes.org content to S3."
      print_status "This process runs in the background and may take 15-20 minutes to complete."
      echo ""
      print_status "You can monitor scraping progress in CloudWatch logs:"
      print_status "  Domain Discovery: /aws/lambda/$DOMAIN_DISCOVERY_FUNCTION"
      print_status "  Content Processor: Check SQS queue processing in CloudWatch"
      echo ""

      # Get Knowledge Base and Data Source IDs from CloudFormation
      print_status "Preparing to sync Knowledge Base after scraping completes..."
      KNOWLEDGE_BASE_ID=$(AWS_PAGER="" aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseId'].OutputValue" \
        --output text --region "$AWS_REGION" 2>/dev/null || echo "")

      DATA_SOURCE_ID=$(AWS_PAGER="" aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='DataSourceId'].OutputValue" \
        --output text --region "$AWS_REGION" 2>/dev/null || echo "")

      if [ -z "$KNOWLEDGE_BASE_ID" ] || [ "$KNOWLEDGE_BASE_ID" = "None" ] || \
         [ -z "$DATA_SOURCE_ID" ] || [ "$DATA_SOURCE_ID" = "None" ]; then
        print_warning "Could not find Knowledge Base or Data Source IDs from stack outputs"
        print_warning "You will need to manually sync the Knowledge Base after scraping completes"
        print_status "Manual sync: AWS Console -> Bedrock -> Knowledge Bases -> ada-clara-kb -> Sync"
      else
        print_status "Knowledge Base ID: $KNOWLEDGE_BASE_ID"
        print_status "Data Source ID: $DATA_SOURCE_ID"
        echo ""
        print_status "Waiting for scraping to complete before syncing Knowledge Base..."
        print_status "This may take 15-20 minutes. Checking every 60 seconds..."

        # Wait for scraping to complete by checking SQS queue
        SCRAPING_COMPLETE=false
        WAIT_COUNT=0
        MAX_WAIT=25  # 25 minutes max wait

        while [ $WAIT_COUNT -lt $MAX_WAIT ] && [ "$SCRAPING_COMPLETE" = false ]; do
          sleep 60
          WAIT_COUNT=$((WAIT_COUNT + 1))

          # Check if SQS queue is empty (scraping done)
          QUEUE_URL=$(AWS_PAGER="" aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --query "Stacks[0].Outputs[?OutputKey=='ScrapingQueueUrl'].OutputValue" \
            --output text --region "$AWS_REGION" 2>/dev/null || echo "")

          if [ -n "$QUEUE_URL" ] && [ "$QUEUE_URL" != "None" ]; then
            QUEUE_DEPTH=$(AWS_PAGER="" aws sqs get-queue-attributes \
              --queue-url "$QUEUE_URL" \
              --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
              --query 'Attributes.{visible:ApproximateNumberOfMessages,inflight:ApproximateNumberOfMessagesNotVisible}' \
              --output json --region "$AWS_REGION" 2>/dev/null || echo '{"visible":"0","inflight":"0"}')

            VISIBLE=$(echo "$QUEUE_DEPTH" | jq -r '.visible' 2>/dev/null || echo "0")
            INFLIGHT=$(echo "$QUEUE_DEPTH" | jq -r '.inflight' 2>/dev/null || echo "0")

            if [ "$VISIBLE" = "0" ] && [ "$INFLIGHT" = "0" ]; then
              print_success "Scraping completed! Queue is empty."
              SCRAPING_COMPLETE=true
            else
              print_status "Scraping in progress... (${WAIT_COUNT} min elapsed, ~$((VISIBLE + INFLIGHT)) URLs remaining)"
            fi
          fi
        done

        if [ "$SCRAPING_COMPLETE" = true ]; then
          # Start Knowledge Base ingestion job
          print_status "Starting Knowledge Base sync to ingest scraped content..."

          INGESTION_JOB_ID=$(AWS_PAGER="" aws bedrock-agent start-ingestion-job \
            --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
            --data-source-id "$DATA_SOURCE_ID" \
            --region "$AWS_REGION" \
            --query 'ingestionJob.ingestionJobId' \
            --output text 2>&1)

          if [ $? -eq 0 ] && [ -n "$INGESTION_JOB_ID" ] && [ "$INGESTION_JOB_ID" != "None" ]; then
            print_success "Knowledge Base sync started! Job ID: $INGESTION_JOB_ID"
            print_status "Monitoring sync progress..."

            # Poll ingestion job status
            SYNC_COMPLETE=false
            SYNC_WAIT=0
            MAX_SYNC_WAIT=15  # 15 minutes max for sync

            while [ $SYNC_WAIT -lt $MAX_SYNC_WAIT ] && [ "$SYNC_COMPLETE" = false ]; do
              sleep 30
              SYNC_WAIT=$((SYNC_WAIT + 1))

              JOB_STATUS=$(AWS_PAGER="" aws bedrock-agent get-ingestion-job \
                --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
                --data-source-id "$DATA_SOURCE_ID" \
                --ingestion-job-id "$INGESTION_JOB_ID" \
                --region "$AWS_REGION" \
                --query 'ingestionJob.status' \
                --output text 2>/dev/null || echo "UNKNOWN")

              case "$JOB_STATUS" in
                "COMPLETE")
                  print_success "Knowledge Base sync completed successfully!"
                  SYNC_COMPLETE=true
                  ;;
                "FAILED")
                  print_warning "Knowledge Base sync failed. Check AWS Console for details."
                  SYNC_COMPLETE=true
                  ;;
                "IN_PROGRESS"|"STARTING")
                  print_status "Sync in progress... (${SYNC_WAIT}/2 min elapsed)"
                  ;;
                *)
                  print_status "Sync status: $JOB_STATUS (${SYNC_WAIT}/2 min elapsed)"
                  ;;
              esac
            done

            if [ "$SYNC_COMPLETE" = false ]; then
              print_warning "Sync is taking longer than expected. Continuing in background."
              print_status "Check status: AWS Console -> Bedrock -> Knowledge Bases -> ada-clara-kb"
            fi
          else
            print_warning "Failed to start Knowledge Base sync: $INGESTION_JOB_ID"
            print_status "You can manually sync via: AWS Console -> Bedrock -> Knowledge Bases -> ada-clara-kb -> Sync"
          fi
        else
          print_warning "Scraping did not complete within 25 minutes"
          print_status "Scraping will continue in background. Sync Knowledge Base manually after completion."
          print_status "Manual sync: AWS Console -> Bedrock -> Knowledge Bases -> ada-clara-kb -> Sync"
        fi
      fi
    else
      print_warning "Web scraper invocation returned status code: $STATUS_CODE"
      print_warning "Initial scraping may not have started successfully."
      print_warning "You can manually trigger scraping later using the domain discovery function."
    fi
  else
    print_warning "Failed to trigger initial scraping: $SCRAPER_RESULT"
    print_warning "You can manually trigger scraping later via the API or admin interface."
  fi

  # Clean up temporary file
  rm -f /tmp/scraper-response.json
else
  print_status "Skipping knowledge base population."
  echo ""
  print_status "You can trigger knowledge base population later by manually invoking the domain discovery Lambda function."
fi

echo ""
print_success "Deployment complete!"
