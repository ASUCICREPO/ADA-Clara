#!/bin/bash

# ADA Clara Infrastructure Cleanup Script
# Tears down all AWS resources created by the deployment pipeline
# Safe to run - will not fail if resources don't exist

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="AdaClaraUnifiedStack"
CODEBUILD_PROJECT_NAME="ada-clara-unified-deployment"
AMPLIFY_APP_NAME="ada-clara-frontend"
REGION=${AWS_REGION:-$(aws configure get region 2>/dev/null || echo "us-west-2")}

echo -e "${PURPLE}[CLEANUP]${NC} 🧹 Starting ADA Clara Infrastructure Cleanup"
echo -e "${BLUE}[INFO]${NC} Region: $REGION"
echo ""

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo -e "${RED}[ERROR]${NC} Failed to get AWS Account ID. Check AWS credentials."
  exit 1
fi

echo -e "${BLUE}[INFO]${NC} AWS Account: $AWS_ACCOUNT_ID"
echo ""

# --- Phase 1: Delete CodeBuild Project ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 1: Deleting CodeBuild Project..."

if aws codebuild batch-get-projects --names "$CODEBUILD_PROJECT_NAME" --region $REGION 2>/dev/null | grep -q "$CODEBUILD_PROJECT_NAME"; then
  echo -e "${BLUE}[INFO]${NC} Deleting CodeBuild project: $CODEBUILD_PROJECT_NAME"
  AWS_PAGER="" aws codebuild delete-project \
    --name "$CODEBUILD_PROJECT_NAME" \
    --region $REGION 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} CodeBuild project already deleted or doesn't exist"
  echo -e "${GREEN}[SUCCESS]${NC} CodeBuild project deleted"
else
  echo -e "${YELLOW}[INFO]${NC} CodeBuild project not found - skipping"
fi

echo ""

# --- Phase 2: Delete CloudWatch Log Groups for CodeBuild ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 2: Deleting CodeBuild Log Groups..."

LOG_GROUP="/aws/codebuild/$CODEBUILD_PROJECT_NAME"
if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region $REGION 2>/dev/null | grep -q "$LOG_GROUP"; then
  echo -e "${BLUE}[INFO]${NC} Deleting log group: $LOG_GROUP"
  AWS_PAGER="" aws logs delete-log-group \
    --log-group-name "$LOG_GROUP" \
    --region $REGION 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} Log group already deleted or doesn't exist"
  echo -e "${GREEN}[SUCCESS]${NC} CodeBuild log group deleted"
else
  echo -e "${YELLOW}[INFO]${NC} CodeBuild log group not found - skipping"
fi

echo ""

# --- Phase 3: Destroy CDK Stack ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 3: Destroying CDK Stack..."

if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
  echo -e "${BLUE}[INFO]${NC} Destroying CDK stack: $STACK_NAME"
  echo -e "${YELLOW}[INFO]${NC} This may take 5-10 minutes..."

  cd backend
  npx cdk destroy --all --force --region $REGION 2>&1 | while IFS= read -r line; do
    # Filter out verbose output, show important messages
    if [[ "$line" =~ "Destroy complete" ]] || \
       [[ "$line" =~ "✅" ]] || \
       [[ "$line" =~ "DELETE_COMPLETE" ]] || \
       [[ "$line" =~ "failed" ]] || \
       [[ "$line" =~ "error" ]] || \
       [[ "$line" =~ "Error" ]]; then
      echo "$line"
    fi
  done
  cd ..

  echo -e "${GREEN}[SUCCESS]${NC} CDK stack destroyed"
else
  echo -e "${YELLOW}[INFO]${NC} CDK stack not found - skipping"
fi

echo ""

# --- Phase 4: Delete Amplify App ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 4: Deleting Amplify App..."

AMPLIFY_APP_ID=$(aws amplify list-apps --region $REGION --query "apps[?name=='$AMPLIFY_APP_NAME'].appId" --output text 2>/dev/null || echo "")

if [ -n "$AMPLIFY_APP_ID" ] && [ "$AMPLIFY_APP_ID" != "None" ]; then
  echo -e "${BLUE}[INFO]${NC} Deleting Amplify app: $AMPLIFY_APP_NAME (ID: $AMPLIFY_APP_ID)"
  AWS_PAGER="" aws amplify delete-app \
    --app-id "$AMPLIFY_APP_ID" \
    --region $REGION 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} Amplify app already deleted or doesn't exist"
  echo -e "${GREEN}[SUCCESS]${NC} Amplify app deleted"
else
  echo -e "${YELLOW}[INFO]${NC} Amplify app not found - skipping"
fi

echo ""

# --- Phase 5: Clean up Lambda Log Groups ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 5: Cleaning up Lambda Log Groups..."

# Get all Lambda log groups for this stack
LAMBDA_LOG_GROUPS=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/AdaClaraUnifiedStack" \
  --region $REGION \
  --query 'logGroups[].logGroupName' \
  --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_LOG_GROUPS" ]; then
  echo -e "${BLUE}[INFO]${NC} Found Lambda log groups to delete"
  for LOG_GROUP_NAME in $LAMBDA_LOG_GROUPS; do
    echo -e "${BLUE}[INFO]${NC} Deleting log group: $LOG_GROUP_NAME"
    AWS_PAGER="" aws logs delete-log-group \
      --log-group-name "$LOG_GROUP_NAME" \
      --region $REGION 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} Failed to delete $LOG_GROUP_NAME"
  done
  echo -e "${GREEN}[SUCCESS]${NC} Lambda log groups deleted"
else
  echo -e "${YELLOW}[INFO]${NC} No Lambda log groups found - skipping"
fi

echo ""

# --- Phase 6: Clean up S3 Buckets (if any remain) ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 6: Cleaning up S3 Buckets..."

# Look for buckets with ada-clara prefix
ADA_CLARA_BUCKETS=$(aws s3api list-buckets \
  --query "Buckets[?contains(Name, 'adaclaraunifiedstack')].Name" \
  --output text 2>/dev/null || echo "")

if [ -n "$ADA_CLARA_BUCKETS" ]; then
  echo -e "${BLUE}[INFO]${NC} Found S3 buckets to delete"
  for BUCKET_NAME in $ADA_CLARA_BUCKETS; do
    echo -e "${BLUE}[INFO]${NC} Emptying and deleting bucket: $BUCKET_NAME"

    # Empty bucket first
    AWS_PAGER="" aws s3 rm "s3://$BUCKET_NAME" --recursive 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} Failed to empty $BUCKET_NAME"

    # Delete bucket
    AWS_PAGER="" aws s3api delete-bucket \
      --bucket "$BUCKET_NAME" \
      --region $REGION 2>/dev/null || echo -e "${YELLOW}[WARNING]${NC} Failed to delete $BUCKET_NAME"
  done
  echo -e "${GREEN}[SUCCESS]${NC} S3 buckets cleaned up"
else
  echo -e "${YELLOW}[INFO]${NC} No S3 buckets found - skipping"
fi

echo ""

# --- Phase 7: Verify Cleanup ---
echo -e "${PURPLE}[CLEANUP]${NC} Phase 7: Verifying Cleanup..."

REMAINING_RESOURCES=0

# Check CodeBuild
if aws codebuild batch-get-projects --names "$CODEBUILD_PROJECT_NAME" --region $REGION 2>/dev/null | grep -q "$CODEBUILD_PROJECT_NAME"; then
  echo -e "${YELLOW}[WARNING]${NC} CodeBuild project still exists"
  REMAINING_RESOURCES=$((REMAINING_RESOURCES + 1))
fi

# Check CDK Stack
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
  STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "")
  if [ "$STACK_STATUS" != "DELETE_COMPLETE" ] && [ "$STACK_STATUS" != "DELETE_IN_PROGRESS" ]; then
    echo -e "${YELLOW}[WARNING]${NC} CDK stack still exists (Status: $STACK_STATUS)"
    REMAINING_RESOURCES=$((REMAINING_RESOURCES + 1))
  fi
fi

# Check Amplify
AMPLIFY_APP_ID=$(aws amplify list-apps --region $REGION --query "apps[?name=='$AMPLIFY_APP_NAME'].appId" --output text 2>/dev/null || echo "")
if [ -n "$AMPLIFY_APP_ID" ] && [ "$AMPLIFY_APP_ID" != "None" ]; then
  echo -e "${YELLOW}[WARNING]${NC} Amplify app still exists"
  REMAINING_RESOURCES=$((REMAINING_RESOURCES + 1))
fi

echo ""

if [ $REMAINING_RESOURCES -eq 0 ]; then
  echo -e "${GREEN}[SUCCESS]${NC} ✅ Cleanup completed successfully!"
  echo -e "${GREEN}[SUCCESS]${NC} All ADA Clara resources have been removed"
else
  echo -e "${YELLOW}[WARNING]${NC} ⚠️  Cleanup completed with warnings"
  echo -e "${YELLOW}[WARNING]${NC} Some resources may still exist. Check AWS Console."
  echo -e "${BLUE}[INFO]${NC} Resources may be in DELETE_IN_PROGRESS state - check again in a few minutes"
fi

echo ""
echo -e "${BLUE}[INFO]${NC} Cleanup script completed"
echo ""
echo -e "${PURPLE}Next steps:${NC}"
echo "  1. Verify all resources are deleted in AWS Console"
echo "  2. Run ./deploy.sh to redeploy with latest changes"
echo "  3. Monitor deployment to verify web scraper trigger works"
echo ""
