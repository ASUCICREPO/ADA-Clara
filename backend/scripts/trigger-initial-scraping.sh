#!/bin/bash
# Manual trigger for initial diabetes.org scraping
# Use this script if you need to populate the knowledge base manually

set -eo pipefail  # Removed 'u' flag to allow unset variables

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

# Create a temporary payload file with the correct action name
PAYLOAD_FILE="./scraper-payload.json"
cat > "$PAYLOAD_FILE" << 'EOF'
{
  "action": "discover-scrape",
  "domain": "diabetes.org",
  "maxUrls": 50,
  "enableContentEnhancement": true,
  "enableIntelligentChunking": true,
  "enableStructuredExtraction": true,
  "chunkingStrategy": "hybrid",
  "forceRefresh": true
}
EOF

print_status "Triggering comprehensive diabetes.org scraping..."
print_status "This will discover and scrape up to 50 pages from diabetes.org"
print_status "Payload file created: $PAYLOAD_FILE"

# Show the payload for debugging
print_status "Payload content:"
cat "$PAYLOAD_FILE"

# Invoke the web scraper Lambda function asynchronously
print_status "Invoking Lambda function asynchronously..."
SCRAPER_RESULT=$(AWS_PAGER="" aws lambda invoke \
  --function-name "$WEB_SCRAPER_FUNCTION" \
  --cli-binary-format raw-in-base64-out \
  --invocation-type Event \
  --payload "file://$PAYLOAD_FILE" \
  --region "$AWS_REGION" \
  ./scraper-response.json 2>&1)

INVOKE_EXIT_CODE=$?

print_status "Lambda invocation exit code: $INVOKE_EXIT_CODE"
print_status "AWS CLI output: $SCRAPER_RESULT"

if [ $INVOKE_EXIT_CODE -eq 0 ]; then
  print_status "Lambda invocation completed. Checking response..."
  
  # Check if the invocation was successful
  if [ "$HAS_JQ" = true ]; then
    STATUS_CODE=$(echo "$SCRAPER_RESULT" | jq -r '.StatusCode' 2>/dev/null || echo "unknown")
  else
    # Fallback parsing without jq - look for StatusCode in the output
    STATUS_CODE=$(echo "$SCRAPER_RESULT" | grep -o '"StatusCode": [0-9]*' | grep -o '[0-9]*' || echo "unknown")
  fi
  
  print_status "Lambda StatusCode: $STATUS_CODE"
  
  if [ "$STATUS_CODE" = "202" ]; then
    print_success "Initial scraping triggered successfully (asynchronous)!"
    
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
    echo "To check the results later, you can:"
    echo "  1. Check CloudWatch logs for completion status"
    echo "  2. Query the S3 Vectors bucket for stored vectors"
    echo "  3. Test the Knowledge Base with a query"
    echo ""
    
  elif [ "$STATUS_CODE" = "200" ]; then
    print_success "Initial scraping triggered successfully!"
    
    # Try to extract some basic info from the response
    if [ -f "./scraper-response.json" ]; then
      print_status "Processing response file..."
      
      # Debug: Show response file content
      print_status "Response file content:"
      if [ "$HAS_JQ" = true ]; then
        cat ./scraper-response.json | jq . 2>/dev/null || cat ./scraper-response.json
      else
        cat ./scraper-response.json
      fi
      
      if [ "$HAS_JQ" = true ]; then
        RESPONSE_BODY=$(cat ./scraper-response.json | jq -r '.body' 2>/dev/null || echo "")
      else
        # Fallback parsing without jq - just show the file content
        print_status "Response file (jq not available for parsing):"
        cat ./scraper-response.json
        RESPONSE_BODY=""
      fi
      
      if [ -n "$RESPONSE_BODY" ] && [ "$RESPONSE_BODY" != "null" ] && [ "$HAS_JQ" = true ]; then
        print_status "Response body found, parsing..."
        
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
      elif [ "$HAS_JQ" = false ]; then
        print_status "jq not available - response shown above"
      else
        print_warning "No response body found or body is null"
      fi
    else
      print_warning "Response file not found: ./scraper-response.json"
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
  print_error "Failed to trigger initial scraping. AWS CLI error (exit code $INVOKE_EXIT_CODE): $SCRAPER_RESULT"
fi

# Clean up temporary files
rm -f ./scraper-response.json
rm -f "$PAYLOAD_FILE"

print_status "Script completed."