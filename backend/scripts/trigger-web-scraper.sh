#!/bin/bash

# Web Scraper Trigger Script
# Triggers comprehensive diabetes.org domain discovery and automatic KB ingestion
# Can be used for initial deployment or manual refreshes between scheduled scrapes
# Compatible with AdaClaraUnifiedStack

set -e

# Configuration
STACK_NAME="AdaClaraUnifiedStack"
REGION=${AWS_REGION:-$(aws configure get region 2>/dev/null || echo "us-west-2")}

echo "[WEB SCRAPER] 🚀 Starting Knowledge Base Population"
echo "[INFO] Stack: $STACK_NAME"
echo "[INFO] Region: $REGION"
echo ""

# Verify stack exists
echo "[INFO] Verifying unified stack deployment..."
if ! aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
  echo "[ERROR] Stack '$STACK_NAME' not found in region $REGION"
  echo "[INFO] Available stacks:"
  aws cloudformation list-stacks --region $REGION --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[].StackName' --output table
  exit 1
fi

echo "[SUCCESS] Unified stack found and active"

# Get domain discovery function name from unified stack
echo "[INFO] Getting domain discovery function name from unified stack..."
DOMAIN_DISCOVERY_FUNCTION=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`DomainDiscoveryFunctionName`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$DOMAIN_DISCOVERY_FUNCTION" ] || [ "$DOMAIN_DISCOVERY_FUNCTION" = "None" ]; then
  echo "[ERROR] Could not find domain discovery function name in unified stack outputs"
  echo "[INFO] Available stack outputs:"
  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}' --output table
  exit 1
fi

echo "[SUCCESS] Domain discovery function: $DOMAIN_DISCOVERY_FUNCTION"
# Get additional stack information
echo "[INFO] Getting additional stack information..."

CONTENT_PROCESSOR_FUNCTION=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentProcessorFunctionName`].OutputValue' \
  --output text 2>/dev/null || echo "")

SQS_QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ScrapingQueueUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

API_GATEWAY_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

CONTENT_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentBucketName`].OutputValue' \
  --output text 2>/dev/null || echo "")

KNOWLEDGE_BASE_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseId`].OutputValue' \
  --output text 2>/dev/null || echo "")

echo "[SUCCESS] Stack information retrieved"
echo "[INFO] Content Processor: ${CONTENT_PROCESSOR_FUNCTION:-'Not found'}"
echo "[INFO] SQS Queue: ${SQS_QUEUE_URL:-'Not found'}"
echo "[INFO] API Gateway: ${API_GATEWAY_URL:-'Not found'}"
echo "[INFO] Content Bucket: ${CONTENT_BUCKET:-'Not found'}"
echo "[INFO] Knowledge Base: ${KNOWLEDGE_BASE_ID:-'Not found'}"
echo ""

# Wait for Lambda functions to be ready
echo "[INFO] ⏳ Waiting for Lambda functions to be ready..."
sleep 10

# Create comprehensive discovery payload
DISCOVERY_PAYLOAD=$(cat << 'EOF'
{
  "action": "discover-domain",
  "comprehensive": true,
  "sources": ["sitemap", "seed-urls"],
  "maxUrls": 1200,
  "priorityFilter": 50,
  "forceRefresh": true,
  "initialScraping": true,
  "description": "Knowledge base population triggered by web scraper script"
}
EOF
)

echo "[INFO] 📄 Web scraper payload:"
echo "$DISCOVERY_PAYLOAD" | jq '.' 2>/dev/null || echo "$DISCOVERY_PAYLOAD"
echo ""

echo "[WEB SCRAPER] 🔍 Starting comprehensive domain discovery..."
echo "[INFO] This will discover ~1200 high-quality URLs from diabetes.org"
echo "[INFO] Processing will take approximately 15-20 minutes"
echo ""
# Invoke Domain Discovery Lambda function
RESPONSE=$(aws lambda invoke \
  --function-name "$DOMAIN_DISCOVERY_FUNCTION" \
  --payload "$DISCOVERY_PAYLOAD" \
  --region $REGION \
  --cli-binary-format raw-in-base64-out \
  response.json 2>&1)

# Check if invocation was successful
LAMBDA_EXIT_CODE=$?
LAMBDA_STATUS_CODE=$(echo "$RESPONSE" | jq -r '.StatusCode' 2>/dev/null || echo "unknown")

echo "[INFO] Lambda invocation exit code: $LAMBDA_EXIT_CODE"
echo "[INFO] Lambda StatusCode: $LAMBDA_STATUS_CODE"

# Check both AWS CLI exit code and Lambda StatusCode (if available)
if [ $LAMBDA_EXIT_CODE -eq 0 ]; then
  if [ "$LAMBDA_STATUS_CODE" = "200" ] || [ "$LAMBDA_STATUS_CODE" = "unknown" ]; then
    echo "[SUCCESS] ✅ Domain discovery invocation successful!"
  else
    echo "[ERROR] ❌ Lambda returned non-200 status: $LAMBDA_STATUS_CODE"
    exit 1
  fi
else
  echo "[ERROR] ❌ AWS CLI invocation failed with exit code: $LAMBDA_EXIT_CODE"
  echo "[INFO] Response: $RESPONSE"
  if [ -f "response.json" ]; then
    echo "[INFO] Response content:"
    cat response.json
  fi
  exit 1
fi

# Show response content
if [ -f "response.json" ]; then
  echo "[INFO] 📋 Discovery response:"
  if command -v jq >/dev/null 2>&1; then
    RESPONSE_BODY=$(cat response.json | jq -r '.body' 2>/dev/null || echo "")
    if [ -n "$RESPONSE_BODY" ] && [ "$RESPONSE_BODY" != "null" ]; then
      echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
    else
      cat response.json | jq '.' 2>/dev/null || cat response.json
    fi
  else
    cat response.json
  fi
  echo ""
fi

echo "[SUCCESS] ✅ Initial knowledge base population started!"
echo ""
echo "What happens next:"
echo "  1. 🔍 Domain Discovery Lambda parses diabetes.org sitemaps"
echo "  2. 🎯 URLs are filtered and prioritized (Spanish + advocacy content prioritized)"
echo "  3. 📦 High-priority URLs are batched (15 URLs per batch)"
echo "  4. 📨 URL batches are sent to SQS queue for processing"
echo "  5. 🔔 Two sentinel messages queued (prepare + trigger with 5-min delay)"
echo "  6. ⚡ Content Processor Lambda instances process batches concurrently"
echo "  7. 🧹 Content is enhanced, quality-assessed, and change-detected"
echo "  8. 💾 High-quality content is stored in S3 as Markdown files"
echo "  9. 🤖 After 5 minutes, KB ingestion triggers AUTOMATICALLY"
echo "  10. 🧠 Knowledge Base ingests all processed content"
echo ""
echo "Expected Results:"
echo "  - ~1200 URLs discovered from sitemap"
echo "  - ~80 batches created (15 URLs each)"
echo "  - ~1000+ high-quality pages processed and stored"
echo "  - Content stored in web_content/ folder in S3"
echo "  - Content processing completes in 15-20 minutes"
echo "  - KB ingestion triggers automatically 5 minutes after queuing completes"
echo "  - Total time: ~20-25 minutes for complete KB population"
echo ""
# Monitoring information
echo "Monitor progress:"

if [ ! -z "$DOMAIN_DISCOVERY_FUNCTION" ]; then
  echo "  Domain Discovery Logs:"
  echo "    https://console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F$DOMAIN_DISCOVERY_FUNCTION"
fi

if [ ! -z "$CONTENT_PROCESSOR_FUNCTION" ]; then
  echo "  Content Processor Logs:"
  echo "    https://console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F$CONTENT_PROCESSOR_FUNCTION"
fi

if [ ! -z "$SQS_QUEUE_URL" ]; then
  echo "  SQS Queue Processing:"
  echo "    https://console.aws.amazon.com/sqs/v2/home?region=$REGION#/queues"
fi

if [ ! -z "$API_GATEWAY_URL" ]; then
  echo "  API Health Checks:"
  echo "    ${API_GATEWAY_URL}health"
  echo "    ${API_GATEWAY_URL}scraper/status"
fi

echo ""
echo "Check results in:"

if [ ! -z "$CONTENT_BUCKET" ]; then
  echo "  S3 Content Bucket: $CONTENT_BUCKET"
  echo "    Check web_content/ folder for processed Markdown files"
fi

if [ ! -z "$KNOWLEDGE_BASE_ID" ]; then
  echo "  Bedrock Knowledge Base: $KNOWLEDGE_BASE_ID"
  echo "    Ready for content ingestion after processing completes"
fi

echo "  DynamoDB Content Tracking:"
echo "    Check ada-clara-content-tracking table for processing progress"

echo ""
echo "Useful commands:"
echo "  # Check S3 content count:"
if [ ! -z "$CONTENT_BUCKET" ]; then
  echo "  aws s3 ls s3://$CONTENT_BUCKET/web_content/ --recursive | wc -l"
fi

echo ""
echo "  # Check SQS queue status:"
if [ ! -z "$SQS_QUEUE_URL" ]; then
  echo "  aws sqs get-queue-attributes --queue-url '$SQS_QUEUE_URL' --attribute-names ApproximateNumberOfMessages"
fi

echo ""
echo "  # Check KB ingestion status (triggers automatically after processing):"
if [ ! -z "$CONTENT_BUCKET" ]; then
  echo "  aws logs tail /aws/lambda/$CONTENT_PROCESSOR_FUNCTION --follow --region $REGION | grep -i 'ingestion'"
fi

echo ""
echo "[SUCCESS] 🎉 Initial scraping trigger completed!"
echo "[INFO] The knowledge base population is now running in the background."
echo "[INFO] Monitor the CloudWatch logs above to track progress."
echo ""
echo "[AUTOMATIC KB INGESTION]"
echo "[INFO] Knowledge Base ingestion will trigger automatically!"
echo "[INFO] Timeline:"
echo "  - Content processing: 15-20 minutes"
echo "  - Sentinel delay: 5 minutes (allows in-flight batches to complete)"
echo "  - KB ingestion trigger: Automatic"
echo "  - No manual intervention required!"

# Clean up response file
rm -f response.json

echo "[INFO] Script completed."

