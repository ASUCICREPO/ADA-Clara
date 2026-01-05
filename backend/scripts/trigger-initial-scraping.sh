#!/bin/bash
# Manual trigger for initial diabetes.org scraping
# Use this script if you need to populate the knowledge base manually

set -euo pipefail

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

if [ -z "$AWS_REGION" ]; then
  print_error "AWS region not found. Please set AWS_REGION environment variable or configure AWS CLI."
fi

print_status "🧠 Triggering initial diabetes.org scraping..."
print_status "Stack: $STACK_NAME"
print_status "Region: $AWS_REGION"

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

# Prepare the scraping payload
SCRAPER_PAYLOAD='{
  "action": "discover-scrape",
  "domain": "diabetes.org",
  "maxUrls": 50,
  "enableContentEnhancement": true,
  "enableIntelligentChunking": true,
  "enableStructuredExtraction": true,
  "chunkingStrategy": "hybrid",
  "forceRefresh": true
}'

print_status "Triggering comprehensive diabetes.org scraping..."
print_status "This will discover and scrape up to 50 pages from diabetes.org"

# Invoke the web scraper Lambda function
SCRAPER_RESULT=$(AWS_PAGER="" aws lambda invoke \
  --function-name "$WEB_SCRAPER_FUNCTION" \
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
      print_status "Processing response..."
      
      RESPONSE_BODY=$(cat /tmp/scraper-response.json | jq -r '.body' 2>/dev/null || echo "")
      if [ -n "$RESPONSE_BODY" ] && [ "$RESPONSE_BODY" != "null" ]; then
        # Try to parse the response body
        PARSED_BODY=$(echo "$RESPONSE_BODY" | jq -r '.result.summary' 2>/dev/null || echo "")
        if [ -n "$PARSED_BODY" ] && [ "$PARSED_BODY" != "null" ]; then
          print_status "Scraping summary:"
          echo "$PARSED_BODY" | jq . 2>/dev/null || echo "$PARSED_BODY"
        fi
        
        # Try to get domain discovery info
        DOMAIN_INFO=$(echo "$RESPONSE_BODY" | jq -r '.result.domainDiscovery' 2>/dev/null || echo "")
        if [ -n "$DOMAIN_INFO" ] && [ "$DOMAIN_INFO" != "null" ]; then
          print_status "Domain discovery info:"
          echo "$DOMAIN_INFO" | jq . 2>/dev/null || echo "$DOMAIN_INFO"
        fi
      fi
    fi
    
    print_success "Knowledge base population started!"
    echo ""
    echo "What happens next:"
    echo "  - The web scraper is now running in the background"
    echo "  - It will discover relevant pages on diabetes.org"
    echo "  - Content will be processed with AI enhancement"
    echo "  - Vectors will be stored in S3 Vectors for the knowledge base"
    echo "  - This process may take 10-15 minutes to complete"
    echo ""
    echo "You can monitor progress in CloudWatch logs:"
    echo "  Log Group: /aws/lambda/$WEB_SCRAPER_FUNCTION"
    echo ""
    
  else
    print_error "Web scraper invocation returned status code: $STATUS_CODE"
  fi
else
  print_error "Failed to trigger initial scraping: $SCRAPER_RESULT"
fi

# Clean up temporary file
rm -f /tmp/scraper-response.json

print_status "Script completed."