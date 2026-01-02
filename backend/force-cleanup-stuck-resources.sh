#!/bin/bash

echo "🧹 Force cleanup of stuck ADA Clara resources..."

# Function to force empty S3 bucket
force_empty_bucket() {
    local bucket_name=$1
    echo "🗑️  Force emptying S3 bucket: $bucket_name"
    
    if aws s3 ls "s3://$bucket_name" >/dev/null 2>&1; then
        echo "   Bucket exists, emptying..."
        
        # Delete all object versions
        aws s3api list-object-versions --bucket "$bucket_name" --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text | while read key version_id; do
            if [ ! -z "$key" ] && [ ! -z "$version_id" ]; then
                aws s3api delete-object --bucket "$bucket_name" --key "$key" --version-id "$version_id" >/dev/null 2>&1 || true
            fi
        done
        
        # Delete all delete markers
        aws s3api list-object-versions --bucket "$bucket_name" --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text | while read key version_id; do
            if [ ! -z "$key" ] && [ ! -z "$version_id" ]; then
                aws s3api delete-object --bucket "$bucket_name" --key "$key" --version-id "$version_id" >/dev/null 2>&1 || true
            fi
        done
        
        echo "   ✅ Bucket $bucket_name emptied"
    else
        echo "   Bucket $bucket_name does not exist, skipping..."
    fi
}

# Get account ID for bucket names
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")

echo "Account: $ACCOUNT"
echo "Region: $REGION"

# Known bucket names that might be stuck
BUCKETS=(
    "ada-clara-content-ga-${ACCOUNT}-${REGION}"
    "ada-clara-vectors-ga-${ACCOUNT}-${REGION}"
)

# Empty all known buckets
for bucket in "${BUCKETS[@]}"; do
    force_empty_bucket "$bucket"
done

# Try to delete the stuck stacks again
STUCK_STACKS=(
    "AdaClaraS3Vectors"
    "AdaClaraEnhancedDynamoDB"
    "AdaClaraS3VectorsMinimalTest"
    "AdaClaraEnhancedWebScraper-dev"
)

for stack in "${STUCK_STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
        echo "🗑️  Retrying deletion of stack: $stack"
        aws cloudformation delete-stack --stack-name "$stack"
        echo "   Waiting for deletion..."
        aws cloudformation wait stack-delete-complete --stack-name "$stack" && echo "   ✅ $stack deleted" || echo "   ❌ $stack still failed"
    else
        echo "✅ Stack $stack already deleted"
    fi
done

echo ""
echo "🔍 Final verification..."
remaining=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED --query "StackSummaries[?contains(StackName, 'AdaClara')].StackName" --output text)

if [ -z "$remaining" ]; then
    echo "✅ All ADA Clara stacks cleaned up successfully!"
else
    echo "⚠️  Some stacks may still exist:"
    echo "$remaining"
fi

echo ""
echo "🚀 Ready for clean deployment!"