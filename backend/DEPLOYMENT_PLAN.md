# S3 Vectors Deployment Plan - Fresh AWS Account

## ✅ Pre-Deployment Verification

**Titan Text Embedding V2 Confirmed:**
- ✅ Model ID: `amazon.titan-embed-text-v2:0` 
- ✅ Status: ACTIVE in us-east-1
- ✅ Test successful: 1536-dimensional embeddings generated
- ✅ Request format: Simple `{"inputText": "..."}`

**Code Review:**
- ✅ `backend/lambda-minimal/index.js`: Uses `amazon.titan-embed-text-v2:0`
- ✅ `backend/lib/s3-vectors-minimal-stack.ts`: Environment variable set to V2
- ✅ CDK stack has `RemovalPolicy.DESTROY` for easy cleanup

## 🚀 Deployment Strategy

### Minimal Test Deployment
We'll deploy only the essential components for testing:

**Resources Created:**
1. **S3 Content Bucket**: `ada-clara-content-minimal-{account}-{region}`
2. **S3 Vectors Bucket**: `ada-clara-vectors-minimal-{account}-{region}`  
3. **S3 Vectors Index**: `ada-clara-vector-index` (1536 dimensions, cosine)
4. **Lambda Function**: Crawler with Titan V2 integration
5. **IAM Roles**: Minimal permissions for S3, S3 Vectors, and Bedrock

**Stack Name:** `AdaClaraS3VectorsMinimalTest`

### Deployment Commands
```bash
# 1. Deploy infrastructure
cd backend
npm install
cdk bootstrap  # If not already done in this account
cdk deploy AdaClaraS3VectorsMinimalTest --app "npx ts-node scripts/deploy-s3-vectors-minimal-test.ts"

# 2. Test the deployment
npx ts-node scripts/test-minimal-lambda.ts
```

## 🧪 Testing Plan

### Phase 1: Basic Connectivity (2 minutes)
```bash
# Test S3 Vectors and Bedrock connectivity
# Event: { "action": "test" }
```

### Phase 2: Content Crawling (5 minutes)  
```bash
# Test crawling 2 URLs from diabetes.org
# Event: { "action": "test-crawl" }
```

### Phase 3: Vector Creation (10 minutes)
```bash
# Test single vector creation with Titan V2
# Event: { "action": "create-single-vector" }

# If successful, create all vectors
# Event: { "action": "create-vectors" }
```

### Phase 4: Full System Test (Optional - 30 minutes)
```bash
# Full crawl of diabetes.org URLs
# Event: { "action": "full-crawl" }
```

## 🗑️ Cleanup Plan

### Immediate Cleanup (if testing fails)
```bash
# Destroy all resources
cdk destroy AdaClaraS3VectorsMinimalTest --app "npx ts-node scripts/deploy-s3-vectors-minimal-test.ts"
```

### Selective Cleanup (keep infrastructure, clear data)
```bash
# Clear S3 buckets but keep infrastructure
aws s3 rm s3://ada-clara-content-minimal-{account}-{region} --recursive
aws s3vectors delete-vector --vector-bucket-name ada-clara-vectors-minimal-{account}-{region} --index-name ada-clara-vector-index --vector-id {vector-id}
```

### Production Migration Plan
If testing is successful, we can:
1. **Keep the stack** and use it as the production S3 Vectors system
2. **Rename the stack** to remove "Test" suffix
3. **Update RemovalPolicy** to `RETAIN` for production data protection

## 💰 Cost Estimation

**Expected Costs (per month):**
- S3 Storage: ~$1-5 (minimal content)
- S3 Vectors: ~$10-20 (small vector index)
- Lambda: ~$1-2 (pay-per-execution)
- Bedrock: ~$5-10 (embedding generation)
- **Total: ~$17-37/month**

**Cleanup saves:** $0 (all resources destroyed)

## 🔒 Security & Permissions

**IAM Permissions (Minimal):**
- S3: Read/Write to content bucket
- S3 Vectors: Full access to vectors bucket and index
- Bedrock: InvokeModel for Titan Text Embedding V2
- CloudWatch: Logs for debugging

**No External Access:**
- All resources are private
- Lambda function only accessible via AWS console/CLI
- No public endpoints created

## 📋 Success Criteria

**Deployment Success:**
- ✅ All CDK resources deploy without errors
- ✅ Lambda function passes connectivity test
- ✅ S3 Vectors bucket and index created successfully

**Functionality Success:**
- ✅ Crawl 2 diabetes.org URLs (100% success rate)
- ✅ Create 3+ content chunks
- ✅ Generate embeddings with Titan V2 (1536 dimensions)
- ✅ Store vectors in S3 Vectors successfully

**Production Ready:**
- ✅ End-to-end workflow: Crawl → Chunk → Embed → Store
- ✅ Error handling and retry logic working
- ✅ Rate limiting prevents Bedrock throttling
- ✅ Ready for Bedrock Knowledge Base integration

## 🚨 Rollback Plan

If anything goes wrong:
1. **Stop immediately** - Don't continue with failed deployment
2. **Run cleanup** - `cdk destroy` to remove all resources
3. **Review logs** - Check CloudWatch logs for errors
4. **Fix issues** - Update code and redeploy
5. **No data loss** - All test data is disposable

## 📊 Expected Timeline

- **Deployment**: 5-10 minutes
- **Basic Testing**: 5 minutes  
- **Vector Creation**: 10-15 minutes
- **Full Testing**: 30-45 minutes
- **Cleanup**: 2-5 minutes

**Total: 1-2 hours for complete validation**