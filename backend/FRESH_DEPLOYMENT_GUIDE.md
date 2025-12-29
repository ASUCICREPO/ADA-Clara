# ADA Clara Fresh Deployment Guide

This guide provides step-by-step instructions for deploying the complete ADA Clara system from scratch.

## Prerequisites

### 1. AWS Setup
- AWS CLI configured with appropriate credentials
- Account: `023336033519` (or your target account)
- Region: `us-east-1`
- IAM permissions for CloudFormation, Lambda, S3, DynamoDB, Bedrock, etc.

### 2. Development Environment
- Node.js 18+ and npm
- AWS CDK 2.233.0+
- TypeScript and ts-node

### 3. Verify Prerequisites
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check CDK
cdk --version

# Check Node.js
node --version
npm --version
```

## Quick Start (Automated)

### Option 1: Complete Deployment (All Components)
```bash
cd backend
npm install
npx ts-node scripts/deploy-fresh-complete.ts
```

### Option 2: Core Components Only (Faster)
```bash
cd backend
npm install
npx ts-node scripts/deploy-fresh-complete.ts --core-only
```

## Manual Step-by-Step Deployment

If you prefer manual control or need to troubleshoot, follow these steps:

### Step 1: Clean Existing Infrastructure (Optional)
```bash
# Dry run to see what would be destroyed
npx ts-node scripts/destroy-all-stacks.ts --dry-run

# Actually destroy (requires confirmation)
CONFIRM_DESTROY=YES_DESTROY_ALL_ADA_CLARA_STACKS npx ts-node scripts/destroy-all-stacks.ts
```

### Step 2: Deploy Core Infrastructure

#### 2.1 DynamoDB Tables
```bash
npx ts-node scripts/create-enhanced-tables.ts
```

#### 2.2 S3 Vectors GA (Vector Storage)
```bash
npm run deploy-s3-vectors-ga
```

#### 2.3 Chat Processor (Session Management)
```bash
npm run deploy-chat-processor
```

#### 2.4 RAG Processor (Dedicated RAG)
```bash
cdk deploy AdaClaraRAGProcessor --app "npx ts-node scripts/deploy-rag-processor.ts"
```

### Step 3: Deploy Optional Components

#### 3.1 Knowledge Base GA (Bedrock Integration)
```bash
cdk deploy AdaClaraS3VectorsGAKnowledgeBase --app "npx ts-node scripts/deploy-kb-ga.ts"
```

#### 3.2 Admin Analytics (Dashboard)
```bash
npm run deploy-admin-analytics
```

#### 3.3 SES Escalation (Email Notifications)
```bash
npm run deploy-ses-escalation
```

### Step 4: Validation Testing

#### 4.1 Test S3 Vectors GA
```bash
npx ts-node scripts/test-ga-infrastructure-simple.ts
```

#### 4.2 Test Chat Processor
```bash
npx ts-node scripts/test-chat-processor.ts
```

#### 4.3 Test RAG Processor
```bash
npx ts-node scripts/test-rag-processor-simple.ts
```

#### 4.4 Run Performance Validation (Task 6.2)
```bash
npx ts-node scripts/test-task6-2-performance-validation.ts
```

## Deployment Architecture

### Core Components (Required)
1. **DynamoDB Tables** - Data storage for sessions, analytics, user data
2. **S3 Vectors GA** - Vector storage and semantic search capabilities
3. **Chat Processor** - Session management and mock RAG responses
4. **RAG Processor** - Dedicated RAG processing with S3 Vectors integration

### Optional Components
1. **Knowledge Base GA** - Bedrock Knowledge Base integration
2. **Admin Analytics** - Dashboard and analytics API
3. **SES Escalation** - Email escalation for human handoff

### Component Dependencies
```
DynamoDB Tables (foundational)
├── Chat Processor (depends on DynamoDB)
└── Admin Analytics (depends on DynamoDB)

S3 Vectors GA (foundational)
├── RAG Processor (depends on S3 Vectors)
└── Knowledge Base GA (depends on S3 Vectors)

SES Escalation (independent)
```

## Expected Deployment Times

| Component | Time | Notes |
|-----------|------|-------|
| DynamoDB Tables | 2-5 min | Fast table creation |
| S3 Vectors GA | 10-15 min | Includes Lambda and S3 setup |
| Chat Processor | 5-10 min | Lambda and API Gateway |
| RAG Processor | 5-10 min | Lambda with Bedrock permissions |
| Knowledge Base GA | 15-20 min | Bedrock KB creation (slow) |
| Admin Analytics | 5-10 min | Lambda and API Gateway |
| SES Escalation | 5-10 min | Lambda and SES setup |

**Total Time:**
- Core only: ~25-40 minutes
- Complete: ~50-80 minutes

## Deployed Resources

After successful deployment, you'll have:

### Lambda Functions
- `ada-clara-chat-processor-us-east-1` - Chat processing
- `ada-clara-rag-processor-us-east-1` - RAG processing
- `AdaClaraS3VectorsGA-CrawlerFunction*` - S3 Vectors operations
- `AdaClaraKBGATest-us-east-1` - Knowledge Base testing (optional)
- Additional admin and escalation functions (optional)

### S3 Buckets
- `ada-clara-content-ga-*` - Raw content storage
- `ada-clara-vectors-ga-*` - Vector storage with GA features

### DynamoDB Tables
- `ada-clara-chat-sessions` - User sessions
- `ada-clara-analytics` - System analytics
- `ada-clara-conversations` - Conversation records
- `ada-clara-messages` - Message records
- Additional tables for questions, escalations, etc.

### API Gateways
- Chat API - `/chat` endpoint for user interactions
- RAG API - `/query` endpoint for RAG processing
- Admin API - Dashboard and analytics endpoints (optional)

## Verification Commands

### Check Deployed Stacks
```bash
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[?contains(StackName, 'Ada')].{Name:StackName,Status:StackStatus}" --output table
```

### Check Lambda Functions
```bash
aws lambda list-functions --query "Functions[?contains(FunctionName, 'ada') || contains(FunctionName, 'Ada')].{Name:FunctionName,Runtime:Runtime}" --output table
```

### Check DynamoDB Tables
```bash
aws dynamodb list-tables --query "TableNames[?contains(@, 'ada-clara')]"
```

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Required
```bash
cdk bootstrap aws://023336033519/us-east-1
```

#### 2. Insufficient Permissions
Ensure your AWS credentials have permissions for:
- CloudFormation (full access)
- Lambda (full access)
- S3 (full access)
- DynamoDB (full access)
- Bedrock (InvokeModel permissions)
- IAM (role creation)

#### 3. Stack Already Exists
```bash
# Check existing stacks
aws cloudformation describe-stacks --stack-name STACK_NAME

# Delete if needed
aws cloudformation delete-stack --stack-name STACK_NAME
```

#### 4. Timeout Issues
- Increase timeout in deployment scripts
- Check CloudFormation events for specific errors
- Retry deployment after fixing issues

### Getting Help

#### View CloudFormation Events
```bash
aws cloudformation describe-stack-events --stack-name STACK_NAME --query "StackEvents[0:10].{Time:Timestamp,Status:ResourceStatus,Reason:ResourceStatusReason}" --output table
```

#### View Lambda Logs
```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ada-clara"
aws logs tail /aws/lambda/FUNCTION_NAME --follow
```

#### Test Individual Components
```bash
# Test S3 Vectors
npx ts-node scripts/test-ga-infrastructure-simple.ts

# Test Chat Processor
npx ts-node scripts/test-chat-processor.ts

# Test RAG Integration
npx ts-node scripts/test-e2e-rag-ga-simple.ts
```

## Next Steps

After successful deployment:

1. **Run Performance Tests**
   ```bash
   npx ts-node scripts/test-task6-2-performance-validation.ts
   ```

2. **Load Sample Data** (if available)
   ```bash
   npx ts-node scripts/load-sample-diabetes-content.ts
   ```

3. **Configure Monitoring**
   - Set up CloudWatch alarms
   - Configure log retention
   - Set up cost monitoring

4. **Test End-to-End Workflows**
   ```bash
   npx ts-node scripts/test-e2e-rag-ga.ts
   ```

## Production Considerations

### Security
- Review IAM permissions (principle of least privilege)
- Enable CloudTrail logging
- Configure VPC endpoints if needed
- Set up WAF for API Gateway

### Monitoring
- CloudWatch dashboards
- Lambda error rate alarms
- DynamoDB throttling alarms
- Cost monitoring and budgets

### Backup and Recovery
- DynamoDB point-in-time recovery
- S3 versioning and lifecycle policies
- Lambda function versioning
- Infrastructure as Code (this CDK setup)

### Performance Optimization
- Lambda memory and timeout tuning
- DynamoDB capacity planning
- S3 Vectors index optimization
- API Gateway caching

---

## Support

For issues or questions:
1. Check CloudFormation events and Lambda logs
2. Review the troubleshooting section above
3. Run individual test scripts to isolate issues
4. Check AWS service limits and quotas