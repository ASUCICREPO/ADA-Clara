#!/bin/bash

# Script to automatically extract environment variables from CloudFormation stack
# and create frontend/.env.local file for local development

set -e

STACK_NAME="${1:-AdaClaraUnifiedStack}"
REGION="${2:-us-east-1}"
FRONTEND_DIR="frontend"
ENV_FILE="$FRONTEND_DIR/.env.local"

echo "Extracting environment variables from CloudFormation stack: $STACK_NAME"
echo "Region: $REGION"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &> /dev/null; then
    echo "Stack '$STACK_NAME' not found in region '$REGION'"
    echo "   Please make sure the stack is deployed and the name is correct."
    exit 1
fi

echo "Stack found. Extracting outputs..."
echo ""

# Extract outputs from CloudFormation stack
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs" \
    --output json)

# Function to get output value by key
get_output() {
    echo "$OUTPUTS" | jq -r ".[] | select(.OutputKey == \"$1\") | .OutputValue"
}

# Extract values
API_GATEWAY_URL=$(get_output "ApiGatewayUrl")
USER_POOL_ID=$(get_output "UserPoolId")
USER_POOL_CLIENT_ID=$(get_output "UserPoolClientId")
IDENTITY_POOL_ID=$(get_output "IdentityPoolId")
COGNITO_DOMAIN=$(get_output "CognitoDomain")
STACK_REGION=$(get_output "Region" || echo "$REGION")

# Validate that we got all required values
if [ -z "$API_GATEWAY_URL" ] || [ "$API_GATEWAY_URL" == "null" ]; then
    echo "Failed to extract ApiGatewayUrl from stack outputs"
    exit 1
fi

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" == "null" ]; then
    echo "Failed to extract UserPoolId from stack outputs"
    exit 1
fi

if [ -z "$USER_POOL_CLIENT_ID" ] || [ "$USER_POOL_CLIENT_ID" == "null" ]; then
    echo "Failed to extract UserPoolClientId from stack outputs"
    exit 1
fi

if [ -z "$IDENTITY_POOL_ID" ] || [ "$IDENTITY_POOL_ID" == "null" ]; then
    echo "Failed to extract IdentityPoolId from stack outputs"
    exit 1
fi

if [ -z "$COGNITO_DOMAIN" ] || [ "$COGNITO_DOMAIN" == "null" ]; then
    echo "Failed to extract CognitoDomain from stack outputs"
    exit 1
fi

# Create .env.local file
cat > "$ENV_FILE" << EOF
# ADA Clara Frontend Environment Variables
# Auto-generated from CloudFormation stack: $STACK_NAME
# Generated on: $(date)

# API Gateway URL
NEXT_PUBLIC_API_BASE_URL=$API_GATEWAY_URL

# AWS Region
NEXT_PUBLIC_AWS_REGION=$STACK_REGION

# Cognito User Pool ID
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID

# Cognito User Pool Client ID
NEXT_PUBLIC_COGNITO_CLIENT_ID=$USER_POOL_CLIENT_ID

# Cognito Identity Pool ID
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=$IDENTITY_POOL_ID

# Cognito Domain
NEXT_PUBLIC_COGNITO_DOMAIN=$COGNITO_DOMAIN

# Cognito Redirect URLs (for localhost)
NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_IN=http://localhost:3000/auth/callback
NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_OUT=http://localhost:3000/admin/login
EOF

echo "Environment variables extracted successfully!"
echo ""
echo "Created: $ENV_FILE"
echo ""
echo "Extracted values:"
echo "   API Gateway URL: $API_GATEWAY_URL"
echo "   User Pool ID: $USER_POOL_ID"
echo "   Client ID: $USER_POOL_CLIENT_ID"
echo "   Identity Pool ID: $IDENTITY_POOL_ID"
echo "   Cognito Domain: $COGNITO_DOMAIN"
echo ""
echo "You can now run the frontend locally:"
echo "   cd frontend"
echo "   npm run dev"
echo ""

