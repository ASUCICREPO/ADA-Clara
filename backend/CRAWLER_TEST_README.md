# Web Crawler Testing for ADA Clara

This directory contains tools to test and compare different web crawling approaches for scraping diabetes.org content.

## Overview

We're evaluating three approaches:
1. **S3 Vectors Custom Crawler**: Custom Lambda crawler with S3 Vectors Knowledge Base (RECOMMENDED)
2. **Amazon Bedrock Web Crawler**: Managed service with OpenSearch Serverless (higher cost)
3. **Custom Playwright Crawler**: JavaScript-aware scraping with detailed extraction

## Quick Start - Local Testing (No AWS Required)

Test basic scraping capabilities locally without any AWS setup:

```bash
cd backend
npm install
npm run test-crawlers-local
```

## S3 Vectors Custom Crawler (RECOMMENDED)

This approach uses a custom Lambda crawler with S3 Vectors for cost-effective vector storage.

### Prerequisites
- AWS CLI configured with appropriate permissions
- CDK installed and bootstrapped in your account
- Bedrock service available in your region (us-east-1 recommended)

### Deploy S3 Vectors Infrastructure

```bash
cd backend
npm install
npm run deploy-s3-vectors
```

This deploys:
- Custom Lambda crawler for diabetes.org
- S3 buckets for content and vector storage
- Knowledge Base manager with S3 Vectors integration
- IAM roles with necessary Bedrock permissions

### Run S3 Vectors Test

```bash
# Full test - creates crawler, Knowledge Base, and tests retrieval
npm run test-s3-vectors-full

# Test crawler only
npm run test-s3-vectors-crawler

# Test Knowledge Base retrieval (after setup)
export KNOWLEDGE_BASE_ID=your-kb-id
npm run test-s3-vectors-kb
```

### Expected S3 Vectors Output
```
🚀 Starting S3 Vectors Crawler and Knowledge Base test...

📋 Step 1: Testing crawler with sample URLs...
✅ Crawler Test Results:
   Success Rate: 100.0%
   Average Word Count: 1247
   Successful URLs: 3

📋 Step 2: Running full setup (crawler + Knowledge Base)...

📊 S3 VECTORS KNOWLEDGE BASE RESULTS
====================================
✅ Knowledge Base ID: ABCD1234EFGH
✅ Data Source ID: WXYZ5678IJKL
📈 Content Stats - Chunks: 45, Embeddings: 45
🎯 Query Success Rate: 100.0%
📝 Average Results per Query: 3.8
🔗 Queries with Citations: 3

🏆 Recommendation: S3 Vectors Knowledge Base is working well - ready for production
```

## Amazon Bedrock Web Crawler Testing

### Prerequisites
- AWS CLI configured with appropriate permissions
- CDK installed and bootstrapped in your account
- Bedrock service available in your region (us-east-1 recommended)

### Deploy Bedrock Web Crawler Test Infrastructure

```bash
cd backend
npm install
npm run deploy-bedrock-crawler
```

This deploys:
- Amazon Bedrock Knowledge Base with vector storage
- OpenSearch Serverless collection for embeddings
- Lambda functions for managing and testing the crawler
- IAM roles with necessary Bedrock permissions

### Run Bedrock Web Crawler Test

```bash
# Full test - creates knowledge base, starts crawling, tests queries
npm run test-bedrock-full

# Test custom queries (after knowledge base is created)
export KNOWLEDGE_BASE_ID=your-kb-id
npm run test-bedrock-queries

# Compare with custom crawler approach
npm run test-bedrock-compare
```

### Expected Bedrock Test Output
```
🚀 Starting Amazon Bedrock Web Crawler test...

📋 Step 1: Running full Bedrock Web Crawler test...

📊 BEDROCK WEB CRAWLER TEST RESULTS
===================================
✅ Knowledge Base ID: ABCD1234EFGH
✅ Data Source ID: WXYZ5678IJKL
📈 Ingestion Jobs - Completed: 1, In Progress: 0, Failed: 0
🎯 Query Success Rate: 95.0%
📝 Average Results per Query: 3.2
🔗 Queries with Citations: 8

🏆 Recommendation: Bedrock Web Crawler shows good results - recommend for production
```

This will:
- Test scraping 5 key diabetes.org pages
- Generate a detailed report on content extraction quality
- Save results to `./local-crawler-results/`
- Provide recommendations for AWS implementation

## AWS Lambda Testing

### Prerequisites
- AWS CLI configured with appropriate permissions
- CDK installed and bootstrapped in your account

### Deploy Test Infrastructure

```bash
cd backend
npm install
npm run deploy-crawler-test
```

This deploys:
- Two Lambda functions (Bedrock and Custom crawlers)
- S3 bucket for storing scraped content
- IAM roles with necessary permissions
- EventBridge schedule (disabled by default)

### Run Comparison Test

```bash
npm run test-crawlers-aws
```

This will:
- Invoke both Lambda functions with the same test URLs
- Compare their performance and results
- Generate a detailed comparison report
- Provide recommendations on which approach to use

## Test Results Analysis

### Local Test Output
```
📊 LOCAL CRAWLER TEST RESULTS
==============================
Success Rate: 100.0%
Average Word Count: 1247
Total Links Found: 23
Content Types: {"article":4,"resource":1}

🔍 CONTENT QUALITY ANALYSIS
============================
📄 What is Diabetes?
   URL: https://diabetes.org/about-diabetes/what-is-diabetes
   Word Count: 1456
   Links Found: 8
   Content Type: article
   Content Preview: Diabetes is a chronic health condition that affects how your body turns food into energy...
```

### AWS Comparison Output
```
📊 CRAWLER COMPARISON RESULTS
================================
Bedrock Crawler Success Rate: 100.0%
Custom Crawler Success Rate: 100.0%

Bedrock Avg Word Count: 1247
Custom Avg Word Count: 1189

Bedrock Enhanced Pages: 5
Custom Avg Load Time: 2341ms

🏆 Recommended Approach: Use Bedrock-enhanced crawler
📝 Reasoning: Bedrock provides superior content processing and AI enhancement capabilities
```

## Key Evaluation Criteria

### Content Quality
- **Word Count**: Higher is generally better for comprehensive content
- **Content Structure**: Clean, well-formatted text without navigation/ads
- **Medical Accuracy**: Preservation of important medical information
- **Vector Quality**: Semantic search relevance and accuracy

### Technical Performance
- **Success Rate**: Percentage of URLs successfully scraped
- **Load Time**: Time to extract content (Custom crawler only)
- **JavaScript Handling**: Ability to process dynamic content
- **Error Handling**: Graceful failure and recovery
- **Scalability**: Ability to handle large-scale crawling

### AI Enhancement
- **Bedrock Web Crawler**: Built-in AI processing, automatic chunking, vector generation
- **Custom + Bedrock**: Manual content cleaning with AI enhancement
- **Content Categorization**: Automatic classification (article/FAQ/resource/event)
- **Medical Fact Extraction**: Identification of key medical information

### Cost and Maintenance
- **Infrastructure Costs**: Lambda vs managed service pricing
- **Operational Overhead**: Maintenance and monitoring requirements
- **Scalability Costs**: Cost implications of scaling up

## File Structure

```
backend/
├── lib/
│   └── web-crawler-test.ts          # CDK stack for test infrastructure
├── lambda/
│   ├── bedrock-crawler/
│   │   ├── bedrock-crawler.ts       # Bedrock-enhanced crawler
│   │   └── package.json
│   └── custom-crawler/
│       ├── custom-crawler.ts        # Playwright-based crawler
│       └── package.json
├── scripts/
│   ├── local-crawler-test.ts        # Local testing (no AWS)
│   ├── test-crawlers.ts             # AWS Lambda comparison
│   └── deploy-crawler-test.ts       # CDK deployment
└── CRAWLER_TEST_README.md           # This file
```

## Expected Outcomes

### If S3 Vectors Custom Crawler Wins (RECOMMENDED)
- Use custom Lambda crawler with S3 Vectors storage
- Cost-effective vector storage compared to OpenSearch
- Full control over content extraction and processing
- Meets original S3 Vectors requirement from design
- Lower operational costs with good performance

### If Bedrock Web Crawler Wins
- Use Amazon Bedrock Web Crawler as managed service
- Minimal infrastructure to maintain
- Built-in AI processing and vector generation
- Automatic scheduling and error handling
- Higher operational costs but lower development overhead
- Requires OpenSearch Serverless (not S3 Vectors)

### If Custom + Bedrock Enhancement Wins
- Use Amazon Bedrock for content enhancement
- Implement custom HTTP scraping with Cheerio
- Focus on prompt engineering for medical content
- Lower Lambda costs due to simpler scraping
- More control over content processing

### Hybrid Approach
- Use S3 Vectors Custom Crawler for primary content
- Use Bedrock Web Crawler for specialized content (if needed)
- Combine results in unified knowledge base
- Best of both worlds but more complex architecture

## Troubleshooting

### Local Test Fails
- Check internet connectivity
- Verify diabetes.org is accessible
- Check for rate limiting (add delays between requests)

### AWS Test Fails
- Verify AWS credentials and permissions
- Check Lambda function logs in CloudWatch
- Ensure Bedrock is available in your region
- Verify S3 bucket permissions

### Low Content Quality
- diabetes.org may have changed their HTML structure
- Update CSS selectors in the crawler code
- Consider adding more content extraction strategies

## Next Steps

Based on test results:
1. Choose the winning approach or hybrid solution
2. Implement the selected crawler in the main ADA Clara system
3. Add vector embedding generation for semantic search
4. Implement weekly scheduling for content updates
5. Add monitoring and alerting for crawler health