#!/bin/bash

# ADA Clara Clean Deployment Script
# Handles both development (auto-cleanup) and production (manual cleanup) scenarios

set -e  # Exit on any error

ENVIRONMENT=${1:-development}
FORCE_CLEANUP=${2:-false}

echo "🚀 ADA Clara Clean Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Force Cleanup: $FORCE_CLEANUP"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if stack exists
stack_exists() {
    aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1
}

# Function to force delete S3 bucket contents
force_empty_bucket() {
    local bucket_name=$1
    print_status "Force emptying S3 bucket: $bucket_name"
    
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
    
    print_success "Bucket $bucket_name emptied"
}

# Function to handle stuck stack deletion
handle_stuck_deletion() {
    local stack_name=$1
    print_warning "Stack $stack_name deletion failed, attempting manual resource cleanup..."
    
    # Get failed resources
    failed_resources=$(aws cloudformation describe-stack-events --stack-name "$stack_name" --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].LogicalResourceId" --output text)
    
    for resource in $failed_resources; do
        print_status "Handling failed resource: $resource"
        
        # Check if it's an S3 bucket
        if [[ $resource == *"Bucket"* ]]; then
            # Get the physical resource ID (actual bucket name)
            bucket_name=$(aws cloudformation describe-stack-resource --stack-name "$stack_name" --logical-resource-id "$resource" --query "StackResourceDetail.PhysicalResourceId" --output text 2>/dev/null || echo "")
            
            if [ ! -z "$bucket_name" ] && [ "$bucket_name" != "None" ]; then
                print_status "Found S3 bucket: $bucket_name"
                if aws s3 ls "s3://$bucket_name" >/dev/null 2>&1; then
                    force_empty_bucket "$bucket_name"
                fi
            fi
        fi
    done
    
    # Retry stack deletion
    print_status "Retrying stack deletion: $stack_name"
    aws cloudformation delete-stack --stack-name "$stack_name"
    aws cloudformation wait stack-delete-complete --stack-name "$stack_name" || {
        print_error "Stack $stack_name still failed to delete. Manual intervention required."
        return 1
    }
    
    print_success "Stack $stack_name deleted successfully after manual cleanup"
}

# Function to delete stack with retry logic
delete_stack_with_retry() {
    local stack_name=$1
    
    if ! stack_exists "$stack_name"; then
        print_status "Stack $stack_name does not exist, skipping..."
        return 0
    fi
    
    print_status "Deleting stack: $stack_name"
    aws cloudformation delete-stack --stack-name "$stack_name"
    
    print_status "Waiting for deletion to complete..."
    if aws cloudformation wait stack-delete-complete --stack-name "$stack_name"; then
        print_success "Stack $stack_name deleted successfully"
    else
        print_warning "Stack $stack_name deletion failed, attempting manual cleanup..."
        handle_stuck_deletion "$stack_name"
    fi
}

# Main cleanup function
cleanup_existing_stacks() {
    print_status "🧹 Cleaning up existing ADA Clara deployments..."
    
    # List of stacks in reverse dependency order
    local stacks=(
        "AdaClaraEnhancedWebScraper-dev"
        "AdaClaraEnhancedWebScraper--dev"
        "AdaClaraFrontendAlignedApi"
        "AdaClaraBedrockKnowledgeBase"
        "AdaClaraS3Vectors"
        "AdaClaraS3VectorsMinimalTest"
        "AdaClaraCognitoAuth"
        "AdaClaraEnhancedDynamoDB"
    )
    
    for stack in "${stacks[@]}"; do
        delete_stack_with_retry "$stack"
    done
    
    print_success "Cleanup completed!"
}

# Function to deploy stacks
deploy_stacks() {
    print_status "🚀 Starting clean deployment..."
    
    # Set CDK context for environment
    export CDK_CONTEXT_environment="$ENVIRONMENT"
    
    # Build Lambda functions first
    print_status "Building Lambda functions..."
    npm run build:new
    print_success "Lambda functions built successfully"
    
    # Deploy stacks in dependency order
    local stacks=(
        "AdaClaraEnhancedDynamoDB"
        "AdaClaraCognitoAuth"
        "AdaClaraS3Vectors"
        "AdaClaraBedrockKnowledgeBase"
        "AdaClaraFrontendAlignedApi"
    )
    
    for stack in "${stacks[@]}"; do
        print_status "Deploying stack: $stack"
        if cdk deploy "$stack" --require-approval never --context environment="$ENVIRONMENT"; then
            print_success "Stack $stack deployed successfully"
        else
            print_error "Failed to deploy stack $stack"
            exit 1
        fi
    done
    
    print_success "🎉 All stacks deployed successfully!"
}

# Function to verify deployment
verify_deployment() {
    print_status "🔍 Verifying deployment..."
    
    # Check all stacks are in good state
    local stacks=(
        "AdaClaraEnhancedDynamoDB"
        "AdaClaraCognitoAuth"
        "AdaClaraS3Vectors"
        "AdaClaraBedrockKnowledgeBase"
        "AdaClaraFrontendAlignedApi"
    )
    
    for stack in "${stacks[@]}"; do
        if stack_exists "$stack"; then
            local status=$(aws cloudformation describe-stacks --stack-name "$stack" --query "Stacks[0].StackStatus" --output text)
            if [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]; then
                print_success "Stack $stack: $status"
            else
                print_warning "Stack $stack: $status"
            fi
        else
            print_error "Stack $stack: NOT FOUND"
        fi
    done
}

# Main execution
main() {
    print_status "Starting ADA Clara deployment process..."
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    # Show current AWS account
    local account=$(aws sts get-caller-identity --query Account --output text)
    local region=$(aws configure get region || echo "us-east-1")
    print_status "AWS Account: $account"
    print_status "AWS Region: $region"
    
    # Cleanup existing deployments
    if [ "$FORCE_CLEANUP" = "true" ] || [ "$ENVIRONMENT" = "development" ]; then
        cleanup_existing_stacks
    else
        print_warning "Skipping cleanup for production environment. Use FORCE_CLEANUP=true to override."
    fi
    
    # Deploy new stacks
    deploy_stacks
    
    # Verify deployment
    verify_deployment
    
    print_success "🎉 ADA Clara deployment completed successfully!"
    print_status "Environment: $ENVIRONMENT"
    print_status "Next steps:"
    print_status "1. Test the API endpoints"
    print_status "2. Verify S3 Vectors integration"
    print_status "3. Test Cognito authentication"
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [environment] [force_cleanup]"
    echo ""
    echo "Arguments:"
    echo "  environment    development|production (default: development)"
    echo "  force_cleanup  true|false (default: false for production, true for development)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Development deployment with auto-cleanup"
    echo "  $0 development true          # Development deployment with forced cleanup"
    echo "  $0 production false          # Production deployment without cleanup"
    echo "  $0 production true           # Production deployment with forced cleanup"
    echo ""
    echo "Environment differences:"
    echo "  development: RemovalPolicy.DESTROY, autoDeleteObjects=true"
    echo "  production:  RemovalPolicy.RETAIN, autoDeleteObjects=false"
    exit 0
fi

# Run main function
main