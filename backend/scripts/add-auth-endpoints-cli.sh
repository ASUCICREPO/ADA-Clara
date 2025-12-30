#!/bin/bash

# Add Authentication Endpoints to Existing API Gateway
# This script uses AWS CLI to add auth endpoints to the existing API Gateway

set -e

API_ID="gew0atxbl4"
REGION="us-east-1"
AUTH_LAMBDA_ARN="arn:aws:lambda:us-east-1:023336033519:function:ada-clara-auth-handler"
MEMBERSHIP_LAMBDA_ARN="arn:aws:lambda:us-east-1:023336033519:function:ada-clara-membership-verification"

echo "🔐 Adding authentication endpoints to API Gateway: $API_ID"

# Get the root resource ID
ROOT_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?path==`/`].id' --output text)
echo "📍 Root resource ID: $ROOT_RESOURCE_ID"

# Create /auth resource
echo "📁 Creating /auth resource..."
AUTH_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "auth" \
  --region $REGION \
  --query 'id' --output text)
echo "✅ Created /auth resource: $AUTH_RESOURCE_ID"

# Create POST /auth method (validate token)
echo "🔧 Creating POST /auth method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $AUTH_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION

# Create GET /auth method (get user context)
echo "🔧 Creating GET /auth method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $AUTH_RESOURCE_ID \
  --http-method GET \
  --authorization-type NONE \
  --region $REGION

# Create integration for POST /auth
echo "🔗 Creating POST /auth integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $AUTH_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$AUTH_LAMBDA_ARN/invocations" \
  --region $REGION

# Create integration for GET /auth
echo "🔗 Creating GET /auth integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $AUTH_RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$AUTH_LAMBDA_ARN/invocations" \
  --region $REGION

# Create /auth/health resource
echo "📁 Creating /auth/health resource..."
AUTH_HEALTH_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $AUTH_RESOURCE_ID \
  --path-part "health" \
  --region $REGION \
  --query 'id' --output text)
echo "✅ Created /auth/health resource: $AUTH_HEALTH_RESOURCE_ID"

# Create GET /auth/health method
echo "🔧 Creating GET /auth/health method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $AUTH_HEALTH_RESOURCE_ID \
  --http-method GET \
  --authorization-type NONE \
  --region $REGION

# Create integration for GET /auth/health
echo "🔗 Creating GET /auth/health integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $AUTH_HEALTH_RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$AUTH_LAMBDA_ARN/invocations" \
  --region $REGION

# Create /auth/verify-professional resource
echo "📁 Creating /auth/verify-professional resource..."
VERIFY_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $AUTH_RESOURCE_ID \
  --path-part "verify-professional" \
  --region $REGION \
  --query 'id' --output text)
echo "✅ Created /auth/verify-professional resource: $VERIFY_RESOURCE_ID"

# Create POST /auth/verify-professional method
echo "🔧 Creating POST /auth/verify-professional method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $VERIFY_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION

# Create integration for POST /auth/verify-professional
echo "🔗 Creating POST /auth/verify-professional integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $VERIFY_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$MEMBERSHIP_LAMBDA_ARN/invocations" \
  --region $REGION

# Grant API Gateway permission to invoke Lambda functions
echo "🔐 Granting API Gateway permissions to invoke Lambda functions..."

# Add permission for auth handler
aws lambda add-permission \
  --function-name ada-clara-auth-handler \
  --statement-id "allow-apigateway-auth-$(date +%s)" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:023336033519:$API_ID/*/*" \
  --region $REGION || echo "Permission may already exist"

# Add permission for membership verification
aws lambda add-permission \
  --function-name ada-clara-membership-verification \
  --statement-id "allow-apigateway-membership-$(date +%s)" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:023336033519:$API_ID/*/*" \
  --region $REGION || echo "Permission may already exist"

# Deploy the API
echo "🚀 Deploying API changes..."
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "✅ Authentication endpoints added successfully!"
echo ""
echo "📋 New endpoints available:"
echo "  POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth"
echo "  GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth"
echo "  GET  https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health"
echo "  POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/verify-professional"
echo ""
echo "🧪 Test with:"
echo "  curl https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health"