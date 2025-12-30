#!/bin/bash

# Deploy New Lambda Functions for Frontend Alignment
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🚀 Deploying new Lambda functions for frontend alignment..."
echo "🌍 Region: $REGION"
echo "🏢 Account: $ACCOUNT_ID"
echo ""

# Function to create deployment package and deploy Lambda
deploy_lambda() {
    local function_name=$1
    local handler_path=$2
    local description=$3
    local timeout=${4:-30}
    local memory=${5:-512}
    
    echo "📦 Deploying Lambda function: $function_name"
    
    # Create deployment package
    cd "lambda/$handler_path"
    echo "  📁 Creating deployment package..."
    zip -r "../${function_name}.zip" . -x "*.ts" "tsconfig.json" "node_modules/.bin/*" >/dev/null
    cd ../..
    
    # Check if function exists
    if aws lambda get-function --function-name "$function_name" --region "$REGION" >/dev/null 2>&1; then
        echo "  🔄 Updating existing function..."
        aws lambda update-function-code \
            --function-name "$function_name" \
            --zip-file "fileb://lambda/${function_name}.zip" \
            --region "$REGION" >/dev/null
        
        aws lambda update-function-configuration \
            --function-name "$function_name" \
            --timeout "$timeout" \
            --memory-size "$memory" \
            --environment "Variables={ESCALATION_REQUESTS_TABLE=ada-clara-escalation-requests-${ACCOUNT_ID},AWS_REGION=${REGION}}" \
            --region "$REGION" >/dev/null
    else
        echo "  ✨ Creating new function..."
        
        # Create execution role if it doesn't exist
        ROLE_NAME="ada-clara-lambda-execution-role"
        ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
        
        if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
            echo "  🔐 Creating Lambda execution role..."
            
            # Create trust policy
            cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

            # Create role
            aws iam create-role \
                --role-name "$ROLE_NAME" \
                --assume-role-policy-document file:///tmp/trust-policy.json >/dev/null
            
            # Attach basic execution policy
            aws iam attach-role-policy \
                --role-name "$ROLE_NAME" \
                --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            
            # Create and attach DynamoDB policy
            cat > /tmp/dynamodb-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/ada-clara-*"
      ]
    }
  ]
}
EOF

            aws iam put-role-policy \
                --role-name "$ROLE_NAME" \
                --policy-name "DynamoDBAccess" \
                --policy-document file:///tmp/dynamodb-policy.json
            
            echo "  ⏳ Waiting for role to be ready..."
            sleep 10
        fi
        
        # Create Lambda function
        aws lambda create-function \
            --function-name "$function_name" \
            --runtime "nodejs18.x" \
            --role "$ROLE_ARN" \
            --handler "index.handler" \
            --zip-file "fileb://lambda/${function_name}.zip" \
            --description "$description" \
            --timeout "$timeout" \
            --memory-size "$memory" \
            --environment "Variables={ESCALATION_REQUESTS_TABLE=ada-clara-escalation-requests-${ACCOUNT_ID},AWS_REGION=${REGION}}" \
            --region "$REGION" >/dev/null
    fi
    
    echo "  ✅ Lambda function $function_name deployed successfully"
    
    # Clean up zip file
    rm "lambda/${function_name}.zip"
}

# Create DynamoDB table for escalation requests if it doesn't exist
TABLE_NAME="ada-clara-escalation-requests-${ACCOUNT_ID}"
echo "🗄️  Checking DynamoDB table: $TABLE_NAME"

if ! aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "  📊 Creating DynamoDB table..."
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions AttributeName=escalationId,AttributeType=S \
        --key-schema AttributeName=escalationId,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$REGION" >/dev/null
    
    echo "  ⏳ Waiting for table to be active..."
    aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
    echo "  ✅ DynamoDB table created successfully"
else
    echo "  ✅ DynamoDB table already exists"
fi

# Deploy Lambda functions
echo ""
echo "📦 Deploying Lambda functions..."

deploy_lambda "ada-clara-escalation-handler" "escalation-handler" "Handles escalation requests from frontend" 15 256
deploy_lambda "ada-clara-admin-analytics" "admin-analytics" "Provides admin dashboard analytics" 15 256

echo ""
echo "🎉 All Lambda functions deployed successfully!"
echo ""
echo "📋 Deployed functions:"
echo "   📞 ada-clara-escalation-handler - Handles 'Talk to Person' form submissions"
echo "   📊 ada-clara-admin-analytics - Provides dashboard analytics data"
echo ""
echo "🔗 Next steps:"
echo "   1. Add these functions to API Gateway routes"
echo "   2. Test the new endpoints"
echo "   3. Update frontend to use real API calls"