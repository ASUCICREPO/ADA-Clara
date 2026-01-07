#!/bin/bash

# Install Lambda Dependencies Script
# Installs npm dependencies for all Lambda functions in the project

set -eo pipefail

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

# Check if we're in the right directory
if [ ! -d "backend/lambda" ]; then
    print_error "This script must be run from the project root directory (where backend/lambda exists)"
fi

print_status "🚀 Installing Lambda function dependencies..."
echo ""

# Find all Lambda directories with package.json (excluding node_modules)
LAMBDA_DIRS=$(find backend/lambda -maxdepth 2 -name "package.json" -not -path "*/node_modules/*" -exec dirname {} \;)

if [ -z "$LAMBDA_DIRS" ]; then
    print_warning "No Lambda functions with package.json found"
    exit 0
fi

TOTAL_COUNT=0
SUCCESS_COUNT=0
FAILED_FUNCTIONS=()

# Install dependencies for each Lambda function
for lambda_dir in $LAMBDA_DIRS; do
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    lambda_name=$(basename "$lambda_dir")
    
    print_status "📦 Installing dependencies for: $lambda_name"
    
    # Check if package.json has dependencies
    if ! grep -q '"dependencies"' "$lambda_dir/package.json"; then
        print_status "  No dependencies found in $lambda_name, skipping..."
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        continue
    fi
    
    # Install dependencies
    if (cd "$lambda_dir" && npm install --production --silent); then
        print_success "  ✅ $lambda_name dependencies installed"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        print_error "  ❌ Failed to install dependencies for $lambda_name"
        FAILED_FUNCTIONS+=("$lambda_name")
    fi
    
    echo ""
done

# Summary
echo "=================================================="
print_status "📊 Installation Summary:"
echo "  Total Lambda functions: $TOTAL_COUNT"
echo "  Successfully installed: $SUCCESS_COUNT"
echo "  Failed: $((TOTAL_COUNT - SUCCESS_COUNT))"

if [ ${#FAILED_FUNCTIONS[@]} -gt 0 ]; then
    echo ""
    print_warning "Failed functions:"
    for func in "${FAILED_FUNCTIONS[@]}"; do
        echo "  - $func"
    done
    echo ""
    print_error "Some Lambda functions failed to install dependencies. Please check the errors above."
else
    echo ""
    print_success "🎉 All Lambda function dependencies installed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  1. Deploy the stacks: ./deploy.sh or ./deploy-scraper.sh"
    echo "  2. Test the functionality"
fi

print_status "Installation script completed."