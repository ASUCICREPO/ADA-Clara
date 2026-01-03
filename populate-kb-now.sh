#!/bin/bash
# Quick script to populate Knowledge Base manually
# This will scrape diabetes.org and sync to KB

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting KB Population${NC}"
echo ""

# Get region
AWS_REGION=${AWS_REGION:-$(aws configure get region || echo "us-east-1")}
STACK_NAME="AdaClaraUnifiedStack"

echo -e "${BLUE}Step 1: Getting deployment info...${NC}"
# Get KB ID
KB_ID=$(aws bedrock-agent list-knowledge-bases --region "$AWS_REGION" --query "knowledgeBaseSummaries[?contains(name, 'ada-clara-kb') && contains(name, 'dev-v2')].knowledgeBaseId" --output text | head -1)
if [ -z "$KB_ID" ] || [ "$KB_ID" == "None" ]; then
  echo -e "${RED}❌ Could not find Knowledge Base${NC}"
  exit 1
fi
echo "✅ KB ID: $KB_ID"

# Get Data Source ID
DS_ID=$(aws bedrock-agent list-data-sources --knowledge-base-id "$KB_ID" --region "$AWS_REGION" --query "dataSourceSummaries[0].dataSourceId" --output text)
if [ -z "$DS_ID" ] || [ "$DS_ID" == "None" ]; then
  echo -e "${RED}❌ Could not find Data Source${NC}"
  exit 1
fi
echo "✅ Data Source ID: $DS_ID"

# Get content bucket from data source
CONTENT_BUCKET=$(aws bedrock-agent get-data-source --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" --region "$AWS_REGION" --query 'dataSource.dataSourceConfiguration.s3Configuration.bucketArn' --output text | sed 's|arn:aws:s3:::||')
echo "✅ Content Bucket: $CONTENT_BUCKET"

# Get Enhanced Scraper Lambda
SCRAPER_FUNCTION="AdaClaraEnhancedScraper-us-east-1-dev"
echo "✅ Scraper Function: $SCRAPER_FUNCTION"

echo ""
echo -e "${BLUE}Step 2: Updating Lambda environment variables to use new buckets...${NC}"
# Get vector index name (try to get from stack, fallback to default pattern)
VECTOR_INDEX=$(aws cloudformation describe-stack-resources --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'StackResources[?ResourceType==`Custom::S3VectorsIndex`].PhysicalResourceId' --output text 2>/dev/null | head -1)
if [ -z "$VECTOR_INDEX" ] || [ "$VECTOR_INDEX" == "None" ]; then
  VECTOR_INDEX="ada-clara-index-dev-v2"
fi
echo "✅ Vector Index: $VECTOR_INDEX"

# Get current environment variables and update only what we need
echo "   Updating CONTENT_BUCKET, VECTORS_BUCKET, and VECTOR_INDEX..."
# Get current env vars to a temp file
TEMP_CURRENT=$(mktemp)
aws lambda get-function-configuration --function-name "$SCRAPER_FUNCTION" --region "$AWS_REGION" --query 'Environment.Variables' --output json > "$TEMP_CURRENT" 2>/dev/null

# Update the JSON file with new values
TEMP_UPDATED=$(mktemp)
python3 <<PYTHON_EOF
import json
import sys

try:
    with open('$TEMP_CURRENT', 'r') as f:
        content = f.read().strip()
        if content and content != 'null':
            env = json.loads(content)
        else:
            env = {}
except:
    env = {}

if not isinstance(env, dict):
    env = {}

# Update the three variables we need
env['CONTENT_BUCKET'] = '$CONTENT_BUCKET'
env['VECTORS_BUCKET'] = 'ada-clara-vectors-dev-v2-023336033519-us-east-1'
env['VECTOR_INDEX'] = '$VECTOR_INDEX'

# Write updated JSON
with open('$TEMP_UPDATED', 'w') as f:
    json.dump(env, f)
PYTHON_EOF

# Update Lambda using cli-input-json format
aws lambda update-function-configuration \
  --function-name "$SCRAPER_FUNCTION" \
  --region "$AWS_REGION" \
  --cli-input-json "{\"Environment\":{\"Variables\":$(cat $TEMP_UPDATED)}}" \
  --output text > /dev/null

rm -f "$TEMP_CURRENT" "$TEMP_UPDATED"
echo "✅ Lambda environment updated (preserved existing vars, updated buckets)"

echo ""
echo -e "${BLUE}Step 3: Invoking web scraper to scrape diabetes.org...${NC}"
# Create payload
PAYLOAD=$(cat <<EOF
{
  "action": "enhanced-discover-scrape",
  "domain": "diabetes.org",
  "maxUrls": 50,
  "enableContentEnhancement": true,
  "enableIntelligentChunking": true,
  "enableStructuredExtraction": true
}
EOF
)

# Invoke Lambda
echo "⏳ Scraping diabetes.org (this may take 5-10 minutes)..."
INVOKE_RESPONSE=$(aws lambda invoke \
  --function-name "$SCRAPER_FUNCTION" \
  --region "$AWS_REGION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  /tmp/scraper-response.json 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ Scraper invoked successfully"
  cat /tmp/scraper-response.json | python3 -m json.tool | head -30
else
  echo -e "${RED}❌ Failed to invoke scraper${NC}"
  echo "$INVOKE_RESPONSE"
  exit 1
fi

echo ""
echo -e "${YELLOW}⏳ Waiting 30 seconds for scraping to start...${NC}"
sleep 30

echo ""
echo -e "${BLUE}Step 4: Checking if content was stored in S3...${NC}"
CONTENT_COUNT=$(aws s3 ls "s3://$CONTENT_BUCKET/" --region "$AWS_REGION" --recursive 2>/dev/null | wc -l | tr -d ' ')
if [ "$CONTENT_COUNT" -gt 0 ]; then
  echo "✅ Found $CONTENT_COUNT objects in content bucket"
else
  echo -e "${YELLOW}⚠️  No content found yet. Scraping may still be in progress.${NC}"
  echo "   You may need to wait a few more minutes and check again."
fi

echo ""
echo -e "${BLUE}Step 5: Triggering Knowledge Base ingestion job...${NC}"
INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$KB_ID" \
  --data-source-id "$DS_ID" \
  --region "$AWS_REGION" \
  --description "Initial population from diabetes.org scraping" \
  --output json 2>&1)

if [ $? -eq 0 ]; then
  JOB_ID=$(echo "$INGESTION_JOB" | python3 -c "import sys, json; print(json.load(sys.stdin)['ingestionJob']['ingestionJobId'])" 2>/dev/null)
  echo "✅ Ingestion job started: $JOB_ID"
  echo ""
  echo -e "${YELLOW}⏳ Monitoring ingestion job (this may take 3-5 minutes)...${NC}"
  
  # Monitor job
  MAX_WAIT=600  # 10 minutes
  ELAPSED=0
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(aws bedrock-agent get-ingestion-job \
      --knowledge-base-id "$KB_ID" \
      --data-source-id "$DS_ID" \
      --ingestion-job-id "$JOB_ID" \
      --region "$AWS_REGION" \
      --query 'ingestionJob.status' \
      --output text 2>/dev/null)
    
    if [ "$STATUS" == "COMPLETE" ]; then
      echo -e "${GREEN}✅ Ingestion job completed successfully!${NC}"
      break
    elif [ "$STATUS" == "FAILED" ]; then
      echo -e "${RED}❌ Ingestion job failed${NC}"
      aws bedrock-agent get-ingestion-job \
        --knowledge-base-id "$KB_ID" \
        --data-source-id "$DS_ID" \
        --ingestion-job-id "$JOB_ID" \
        --region "$AWS_REGION" \
        --query 'ingestionJob.failureReasons' \
        --output json
      exit 1
    else
      echo "   Status: $STATUS (waiting...)"
      sleep 30
      ELAPSED=$((ELAPSED + 30))
    fi
  done
  
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}⚠️  Timeout waiting for ingestion. Check status manually.${NC}"
  fi
else
  echo -e "${RED}❌ Failed to start ingestion job${NC}"
  echo "$INGESTION_JOB"
  exit 1
fi

echo ""
echo -e "${GREEN}🎉 KB Population Complete!${NC}"
echo "   Knowledge Base ID: $KB_ID"
echo "   You can now test the chatbot."
