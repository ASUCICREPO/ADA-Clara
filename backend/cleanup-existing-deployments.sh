#!/bin/bash

echo "🧹 Starting cleanup of all existing ADA Clara deployments..."

# List of known ADA Clara stacks to delete
STACKS=(
    "AdaClaraEnhancedWebScraper--dev"
    "AdaClaraFrontendAlignedApi"
    "AdaClaraCognitoAuth"
    "AdaClaraBedrockKnowledgeBase"
    "AdaClaraS3Vectors"
    "AdaClaraEnhancedDynamoDB"
)

# Function to delete a stack and wait for completion
delete_stack() {
    local stack_name=$1
    echo "🗑️  Deleting stack: $stack_name"
    
    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name "$stack_name" >/dev/null 2>&1; then
        echo "   Stack exists, initiating deletion..."
        aws cloudformation delete-stack --stack-name "$stack_name"
        
        echo "   Waiting for deletion to complete..."
        aws cloudformation wait stack-delete-complete --stack-name "$stack_name"
        
        if [ $? -eq 0 ]; then
            echo "   ✅ Stack $stack_name deleted successfully"
        else
            echo "   ❌ Failed to delete stack $stack_name"
            return 1
        fi
    else
        echo "   Stack $stack_name does not exist, skipping..."
    fi
}

# Delete stacks in reverse dependency order
echo "📋 Deleting stacks in reverse dependency order..."

for stack in "${STACKS[@]}"; do
    delete_stack "$stack"
    echo ""
done

echo "🧹 Cleanup completed!"

# Verify no ADA Clara stacks remain
echo "📊 Verifying cleanup..."
remaining_stacks=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED --query "StackSummaries[?contains(StackName, 'AdaClara')].StackName" --output text)

if [ -z "$remaining_stacks" ]; then
    echo "✅ All ADA Clara stacks have been cleaned up successfully!"
else
    echo "⚠️  Some stacks may still exist:"
    echo "$remaining_stacks"
fi

echo ""
echo "🚀 Ready for clean deployment!"