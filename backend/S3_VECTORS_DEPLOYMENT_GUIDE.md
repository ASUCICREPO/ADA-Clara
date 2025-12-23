# S3 Vectors Deployment Guide

## Overview

This guide covers deploying the ADA Clara S3 Vectors crawler system to AWS. The system includes:

- **S3 Vectors Bucket**: Native vector storage with automatic indexing
- **Content Bucket**: Raw scraped content and processed chunks  
- **Crawler Lambda**: Web scraping and vector generation
- **Knowledge Base Manager**: Bedrock Knowledge Base integration
- **EventBridge Schedule**: Weekly automated scraping

## Prerequisites

### 1. AWS CLI Configuration
```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, Region (us-east-1), and output format (json)
```

### 2. CDK Bootstrap (if not done)
```bash
cd backend
npx cdk bootstrap
```

### 3. Required AWS Services
- Amazon Bedrock (with Titan Embed Text v1 model access)
- Amazon S3 Vectors (available in us-east-1, us-west-2, eu-west-1)
- AWS Lambda
- Amazon EventBridge

## Deployment Steps

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Build TypeScript
```bash
npm run build
```

### Step 3: Deploy S3 Vectors Stack
```bash
npm run deploy-s3-vectors
```

This will create:
- S3 Vectors bucket with vector indexing enabled
- Content bucket for raw scraped data
- Lambda functions for crawling and KB management
- IAM roles with necessary permissions
- EventBridge schedule (disabled by default)

### Step 4: Verify Deployment
```bash
# Check if buckets were created
aws s3 ls | grep ada-clara

# Check if Lambda functions were deployed
aws lambda list-functions --query 'Functions[?contains(FunctionName, `S3VectorsCrawler`)].FunctionName'
```

## Testing the Deployment

### Test 1: Local Simulation (Already Done)
```bash
npm run simulate-workflow
```

### Test 2: AWS Crawler Test
```bash
npm run test-workflow
```

### Test 3: Full S3 Vectors Test
```bash
npm run test-s3-vectors-full
```

## Expected Results

### Successful Deployment Output
```
✅ S3VectorsCrawlerStack

Outputs:
S3VectorsCrawlerStack.ContentBucketName = ada-clara-content-123456789012-us-east-1
S3VectorsCrawlerStack.VectorsBucketName = ada-clara-vectors-123456789012-us-east-1
S3VectorsCrawlerStack.CrawlerFunctionName = S3VectorsCrawlerStack-S3VectorsCrawler
S3VectorsCrawlerStack.KBManagerFunctionName = S3VectorsCrawlerStack-KnowledgeBaseManager

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/S3VectorsCrawlerStack/...
```

### Test Workflow Results
```
📊 WORKFLOW TEST SUMMARY
========================
✅ Scraping: 100.0% success rate
✅ Raw Storage: 3 files
✅ Chunking: 4 chunks  
✅ Embeddings: 4 vectors

🎯 PIPELINE HEALTH: HEALTHY
```

## Configuration

### S3 Vectors Configuration
The deployment automatically configures:
- **Vector Index**: `ada-clara-vector-index`
- **Dimensions**: 1536 (Titan Embed Text v1)
- **Similarity Metric**: COSINE
- **Vector Field**: `vector`
- **Metadata Fields**: `url`, `title`, `section`, `contentType`, `sourceUrl`, `sourcePage`

### Lambda Environment Variables
- `CONTENT_BUCKET`: Raw content storage bucket
- `VECTORS_BUCKET`: S3 Vectors bucket  
- `TARGET_DOMAIN`: diabetes.org
- `EMBEDDING_MODEL`: amazon.titan-embed-text-v1

## Post-Deployment Setup

### 1. Create Bedrock Knowledge Base Role
The Knowledge Base requires an IAM role. Create it manually or via CDK:

```typescript
const kbRole = new iam.Role(this, 'BedrockKnowledgeBaseRole', {
  assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
  inlinePolicies: {
    S3VectorsAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:ListBucket',
            's3:SearchVectors'
          ],
          resources: [
            vectorsBucket.bucketArn,
            `${vectorsBucket.bucketArn}/*`
          ]
        })
      ]
    })
  }
});
```

### 2. Enable Weekly Scraping (Optional)
```bash
# Enable the EventBridge rule for weekly scraping
aws events put-rule \
  --name "S3VectorsCrawlerStack-WeeklySchedule" \
  --state ENABLED
```

### 3. Test Knowledge Base Creation
```bash
npm run test-s3-vectors-kb
```

## Monitoring

### CloudWatch Logs
- `/aws/lambda/S3VectorsCrawlerStack-S3VectorsCrawler`
- `/aws/lambda/S3VectorsCrawlerStack-KnowledgeBaseManager`

### CloudWatch Metrics
- Lambda invocations and errors
- S3 bucket metrics
- Bedrock model invocations

### S3 Vectors Metrics
- `S3Vectors.IndexSize`
- `S3Vectors.QueryLatency`  
- `S3Vectors.QueryCount`

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Required
```
Error: Need to perform AWS CDK bootstrap
```
**Solution**: Run `npx cdk bootstrap`

#### 2. Bedrock Model Access
```
Error: Could not access model amazon.titan-embed-text-v1
```
**Solution**: Request model access in Bedrock console

#### 3. S3 Vectors Not Available
```
Error: S3 Vectors not supported in region
```
**Solution**: Deploy to us-east-1, us-west-2, or eu-west-1

#### 4. IAM Permissions
```
Error: Access denied for Bedrock operations
```
**Solution**: Ensure Lambda execution role has Bedrock permissions

### Debug Commands

```bash
# Check Lambda function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/S3VectorsCrawler"

# Test Lambda function directly
aws lambda invoke \
  --function-name S3VectorsCrawlerStack-S3VectorsCrawler \
  --payload '{"action":"test-crawl"}' \
  response.json

# Check S3 bucket contents
aws s3 ls s3://ada-clara-vectors-123456789012-us-east-1/vectors/ --recursive
```

## Cost Estimation

### Monthly Costs (Moderate Usage)
- **S3 Vectors**: ~$50-100 (storage + indexing + queries)
- **Lambda**: ~$10-20 (execution time)
- **Bedrock**: ~$20-40 (embedding generation)
- **S3 Standard**: ~$5-10 (raw content storage)
- **Total**: ~$85-170/month

### Cost Optimization
- Use S3 lifecycle policies for old content
- Implement incremental crawling (skip unchanged content)
- Batch embedding generation
- Monitor and optimize Lambda memory allocation

## Security

### IAM Least Privilege
- Lambda functions have minimal required permissions
- S3 buckets are private by default
- Bedrock access limited to specific models

### Data Protection
- S3 buckets use server-side encryption
- Lambda environment variables encrypted
- VPC endpoints for private access (optional)

## Scaling Considerations

### High Volume Scenarios
- Increase Lambda memory and timeout
- Implement parallel processing for large crawls
- Use S3 Transfer Acceleration for global access
- Consider multiple vector indices for partitioning

### Performance Optimization
- Implement content change detection
- Use CloudFront for static content caching
- Optimize chunk size and overlap parameters
- Monitor vector index performance

## Next Steps

1. **Deploy the stack**: `npm run deploy-s3-vectors`
2. **Test the workflow**: `npm run test-workflow`
3. **Create Knowledge Base**: `npm run test-s3-vectors-kb`
4. **Integrate with frontend**: Connect to Next.js application
5. **Set up monitoring**: CloudWatch dashboards and alerts
6. **Enable automation**: Weekly scraping schedule

## Support

For issues or questions:
1. Check CloudWatch logs for error details
2. Review AWS service quotas and limits
3. Verify IAM permissions and roles
4. Test with smaller datasets first
5. Consult AWS S3 Vectors documentation