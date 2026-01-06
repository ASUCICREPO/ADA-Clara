#!/bin/bash

# Trigger Web Scraper Lambda with Key Diabetes URLs
# This script invokes the web scraper Lambda function with a curated list of important diabetes.org pages

set -eo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Configuration
STACK_NAME="AdaClaraUnifiedStack"
AWS_REGION=${AWS_REGION:-$(aws configure get region)}
PAYLOAD_FILE="scraper-payload.json"

# Check if jq is available
if ! command -v jq &> /dev/null; then
    print_warning "jq is not installed. JSON parsing will be limited."
    HAS_JQ=false
else
    HAS_JQ=true
fi

if [ -z "$AWS_REGION" ]; then
  print_error "AWS region not found. Please set AWS_REGION environment variable or configure AWS CLI."
fi

print_status "🚀 Triggering Web Scraper Lambda with Key Diabetes URLs..."
print_status "Stack: $STACK_NAME"
print_status "Region: $AWS_REGION"
echo ""

# Get the web scraper function name from CloudFormation
print_status "Getting web scraper function name..."
WEB_SCRAPER_FUNCTION=$(AWS_PAGER="" aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebScraperFunctionName'].OutputValue" \
  --output text --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -z "$WEB_SCRAPER_FUNCTION" ] || [ "$WEB_SCRAPER_FUNCTION" = "None" ]; then
  print_error "Could not find web scraper function in CloudFormation outputs. Make sure the stack is deployed."
fi

print_status "Found web scraper function: $WEB_SCRAPER_FUNCTION"

# Check if payload file exists
if [ ! -f "$PAYLOAD_FILE" ]; then
    print_error "Payload file '$PAYLOAD_FILE' not found!"
fi

print_status "📄 Payload content:"
if [ "$HAS_JQ" = true ]; then
    cat "$PAYLOAD_FILE" | jq '.'
else
    cat "$PAYLOAD_FILE"
fi
echo ""

# Count URLs in payload
if [ "$HAS_JQ" = true ]; then
    URL_COUNT=$(cat "$PAYLOAD_FILE" | jq '.urls | length' 2>/dev/null || echo "unknown")
    print_status "Number of URLs to scrape: $URL_COUNT"
else
    print_status "URLs to scrape: (jq not available for counting)"
fi

# Invoke Lambda function
print_status "⏳ Invoking Lambda function asynchronously..."
SCRAPER_RESULT=$(AWS_PAGER="" aws lambda invoke \
    --function-name "$WEB_SCRAPER_FUNCTION" \
    --region "$AWS_REGION" \
    --cli-binary-format raw-in-base64-out \
    --payload "file://$PAYLOAD_FILE" \
    --invocation-type Event \
    ./scraper-response.json 2>&1)

INVOKE_EXIT_CODE=$?

print_status "Lambda invocation exit code: $INVOKE_EXIT_CODE"

if [ $INVOKE_EXIT_CODE -eq 0 ]; then
    print_status "Lambda invocation completed. Checking response..."
    
    # Check if the invocation was successful
    if [ "$HAS_JQ" = true ]; then
        STATUS_CODE=$(echo "$SCRAPER_RESULT" | jq -r '.StatusCode' 2>/dev/null || echo "unknown")
    else
        # Fallback parsing without jq
        STATUS_CODE=$(echo "$SCRAPER_RESULT" | grep -o '"StatusCode": [0-9]*' | grep -o '[0-9]*' || echo "unknown")
    fi
    
    print_status "Lambda StatusCode: $STATUS_CODE"
    
    if [ "$STATUS_CODE" = "202" ] || [ "$STATUS_CODE" = "200" ]; then
        print_success "✅ Web scraper invocation successful!"
        echo "Response: $SCRAPER_RESULT"
        
        # Show response if available
        if [ -f "./scraper-response.json" ]; then
            echo ""
            print_status "📋 Response content:"
            if [ "$HAS_JQ" = true ]; then
                cat ./scraper-response.json | jq '.' 2>/dev/null || cat ./scraper-response.json
            else
                cat ./scraper-response.json
            fi
        fi
        
        echo ""
        print_success "Knowledge base population started!"
        echo ""
        echo "What happens next:"
        echo "  - The web scraper is processing the specified diabetes.org URLs"
        echo "  - Content will be extracted and processed with intelligent chunking"
        echo "  - Vectors will be stored in S3 Vectors for the knowledge base"
        echo "  - This process may take 10-15 minutes to complete"
        echo ""
        echo "🔍 Monitor progress:"
        echo "  CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F$WEB_SCRAPER_FUNCTION"
        echo ""
        echo "📊 Check results in:"
        echo "  - S3 Content Bucket: ada-clara-content-dev-v2-023336033519-us-west-2"
        echo "  - S3 Vectors Bucket: ada-clara-vectors-dev-v2-023336033519-us-west-2"
        echo "  - Knowledge Base: AY7VCYMUTG"
        
    else
        print_error "Web scraper invocation returned unexpected status code: $STATUS_CODE"
    fi
    
else
    print_error "❌ Lambda invocation failed! AWS CLI error (exit code $INVOKE_EXIT_CODE): $SCRAPER_RESULT"
fi

# Clean up temporary files
rm -f ./scraper-response.json

print_status "Script completed."