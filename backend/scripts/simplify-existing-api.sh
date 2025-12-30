#!/bin/bash

# Simplify Existing API - Remove Professional Verification
# This script removes the professional verification endpoint and simplifies the user model

set -e

API_ID="gew0atxbl4"
REGION="us-east-1"

echo "🔧 Simplifying existing API Gateway: $API_ID"

# Get all resources
echo "📋 Getting current API resources..."
VERIFY_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?pathPart==`verify-professional`].id' --output text)

# Check if verify-professional resource exists
if [ ! -z "$VERIFY_RESOURCE_ID" ] && [ "$VERIFY_RESOURCE_ID" != "None" ]; then
    echo "🗑️  Found verify-professional resource: $VERIFY_RESOURCE_ID"
    
    # Delete the verify-professional resource
    echo "🗑️  Deleting verify-professional resource..."
    aws apigateway delete-resource \
      --rest-api-id $API_ID \
      --resource-id $VERIFY_RESOURCE_ID \
      --region $REGION || echo "Resource may not exist or already deleted"
    
    echo "✅ Removed professional verification endpoint"
else
    echo "ℹ️  No verify-professional resource found"
fi

# Deploy the API changes
echo "🚀 Deploying API changes..."
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "✅ API simplified successfully!"
echo ""
echo "📋 Simplified API endpoints:"
echo "  🌐 Public endpoints (no auth required):"
echo "    GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/health"
echo "    POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat"
echo "    GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat/history"
echo "    GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat/sessions"
echo ""
echo "  🔐 Admin endpoints (auth required):"
echo "    POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth"
echo "    GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth"
echo "    GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health"
echo ""
echo "🎯 Simplified User Model:"
echo "  👤 Public Users: Can use chat without authentication"
echo "  👨‍💼 Admin Users: Need Cognito authentication for admin features"

# Clean up temp files
echo "🧪 Testing simplified endpoints..."