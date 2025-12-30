#!/bin/bash

# Add Frontend-Aligned Endpoints to Existing API Gateway
# This script adds the missing endpoints that the frontend expects

set -e

API_ID="gew0atxbl4"
REGION="us-east-1"
STAGE="prod"

echo "🚀 Adding frontend-aligned endpoints to existing API Gateway..."
echo "📋 API ID: $API_ID"
echo "🌍 Region: $REGION"
echo ""

# Function to create Lambda function if it doesn't exist
create_lambda_if_not_exists() {
    local function_name=$1
    local handler_path=$2
    local description=$3
    
    echo "🔍 Checking if Lambda function $function_name exists..."
    
    if aws lambda get-function --function-name "$function_name" --region "$REGION" >/dev/null 2>&1; then
        echo "✅ Lambda function $function_name already exists"
    else
        echo "📦 Creating Lambda function $function_name..."
        
        # Create deployment package
        cd "lambda/$handler_path"
        zip -r "../${function_name}.zip" . -x "*.ts" "tsconfig.json" "node_modules/.bin/*"
        cd ../..
        
        # Create Lambda function
        aws lambda create-function \
            --function-name "$function_name" \
            --runtime "nodejs18.x" \
            --role "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/lambda-execution-role" \
            --handler "index.handler" \
            --zip-file "fileb://lambda/${function_name}.zip" \
            --description "$description" \
            --timeout 30 \
            --memory-size 512 \
            --region "$REGION"
        
        echo "✅ Created Lambda function $function_name"
        
        # Clean up zip file
        rm "lambda/${function_name}.zip"
    fi
}

# Function to add API Gateway resource and method
add_api_resource() {
    local parent_id=$1
    local path_part=$2
    local method=$3
    local lambda_function=$4
    local description=$5
    
    echo "🔗 Adding $method /$path_part -> $lambda_function"
    
    # Get or create resource
    resource_id=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" \
        --query "items[?pathPart=='$path_part' && parentId=='$parent_id'].id" --output text)
    
    if [ -z "$resource_id" ] || [ "$resource_id" == "None" ]; then
        echo "📁 Creating resource /$path_part"
        resource_id=$(aws apigateway create-resource \
            --rest-api-id "$API_ID" \
            --parent-id "$parent_id" \
            --path-part "$path_part" \
            --region "$REGION" \
            --query 'id' --output text)
    fi
    
    # Check if method exists
    if aws apigateway get-method --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method "$method" --region "$REGION" >/dev/null 2>&1; then
        echo "✅ Method $method already exists for /$path_part"
    else
        # Create method
        aws apigateway put-method \
            --rest-api-id "$API_ID" \
            --resource-id "$resource_id" \
            --http-method "$method" \
            --authorization-type "NONE" \
            --region "$REGION" >/dev/null
        
        # Create integration
        lambda_arn="arn:aws:lambda:$REGION:$(aws sts get-caller-identity --query Account --output text):function:$lambda_function"
        
        aws apigateway put-integration \
            --rest-api-id "$API_ID" \
            --resource-id "$resource_id" \
            --http-method "$method" \
            --type "AWS_PROXY" \
            --integration-http-method "POST" \
            --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$lambda_arn/invocations" \
            --region "$REGION" >/dev/null
        
        # Add Lambda permission for API Gateway
        aws lambda add-permission \
            --function-name "$lambda_function" \
            --statement-id "apigateway-$(date +%s)" \
            --action "lambda:InvokeFunction" \
            --principal "apigateway.amazonaws.com" \
            --source-arn "arn:aws:execute-api:$REGION:$(aws sts get-caller-identity --query Account --output text):$API_ID/*/*" \
            --region "$REGION" >/dev/null 2>&1 || echo "⚠️  Permission may already exist"
        
        echo "✅ Added $method /$path_part"
    fi
    
    echo "$resource_id"
}

# Get root resource ID
root_id=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" \
    --query "items[?path=='/'].id" --output text)

echo "📁 Root resource ID: $root_id"

# Create Lambda functions
echo ""
echo "📦 Setting up Lambda functions..."
create_lambda_if_not_exists "ada-clara-escalation-handler" "escalation-handler" "Handles escalation requests from frontend"
create_lambda_if_not_exists "ada-clara-admin-analytics" "admin-analytics" "Provides admin dashboard analytics"

# Add escalation endpoints
echo ""
echo "📞 Adding escalation endpoints..."

# Get or create /escalation resource
escalation_id=$(add_api_resource "$root_id" "escalation" "GET" "ada-clara-escalation-handler" "Escalation health check")

# Add /escalation/request resource
request_id=$(add_api_resource "$escalation_id" "request" "POST" "ada-clara-escalation-handler" "Submit escalation request")

# Add admin analytics endpoints
echo ""
echo "📊 Adding admin analytics endpoints..."

# Get existing /admin resource
admin_id=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" \
    --query "items[?pathPart=='admin' && parentId=='$root_id'].id" --output text)

if [ -z "$admin_id" ] || [ "$admin_id" == "None" ]; then
    admin_id=$(add_api_resource "$root_id" "admin" "GET" "ada-clara-admin-analytics" "Admin health check")
fi

# Add admin dashboard endpoints
dashboard_id=$(add_api_resource "$admin_id" "dashboard" "GET" "ada-clara-admin-analytics" "Admin dashboard data")
metrics_id=$(add_api_resource "$admin_id" "metrics" "GET" "ada-clara-admin-analytics" "Admin metrics data")
escalation_requests_id=$(add_api_resource "$admin_id" "escalation-requests" "GET" "ada-clara-escalation-handler" "Admin escalation requests")

# Add admin analytics sub-endpoints
conversations_id=$(add_api_resource "$admin_id" "conversations" "GET" "ada-clara-admin-analytics" "Conversations data")
chart_id=$(add_api_resource "$conversations_id" "chart" "GET" "ada-clara-admin-analytics" "Conversations chart data")

language_split_id=$(add_api_resource "$admin_id" "language-split" "GET" "ada-clara-admin-analytics" "Language distribution")
faq_id=$(add_api_resource "$admin_id" "frequently-asked-questions" "GET" "ada-clara-admin-analytics" "FAQ data")
unanswered_id=$(add_api_resource "$admin_id" "unanswered-questions" "GET" "ada-clara-admin-analytics" "Unanswered questions")

# Deploy API changes
echo ""
echo "🚀 Deploying API changes..."
aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name "$STAGE" \
    --description "Added frontend-aligned endpoints" \
    --region "$REGION" >/dev/null

echo "✅ API deployment complete!"

# Test the new endpoints
echo ""
echo "🧪 Testing new endpoints..."
API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/$STAGE"

echo "📞 Testing escalation health: $API_URL/escalation"
curl -s "$API_URL/escalation" | jq '.' || echo "❌ Failed"

echo ""
echo "📊 Testing admin dashboard: $API_URL/admin/dashboard"
curl -s "$API_URL/admin/dashboard" | jq '.' || echo "❌ Failed (expected - needs auth)"

echo ""
echo "🎉 Frontend-aligned endpoints added successfully!"
echo ""
echo "📋 New endpoints available:"
echo "   POST /escalation/request - Submit 'Talk to Person' form"
echo "   GET /escalation - Escalation service health"
echo "   GET /admin/dashboard - Complete dashboard data"
echo "   GET /admin/metrics - Metrics cards data"
echo "   GET /admin/conversations/chart - Conversations over time"
echo "   GET /admin/language-split - Language distribution"
echo "   GET /admin/escalation-requests - Escalation requests table"
echo "   GET /admin/frequently-asked-questions - FAQ data"
echo "   GET /admin/unanswered-questions - Unanswered questions"
echo ""
echo "🔗 API Base URL: $API_URL"