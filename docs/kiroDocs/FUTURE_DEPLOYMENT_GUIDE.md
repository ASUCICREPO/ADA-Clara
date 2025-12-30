# ADA Clara - Future Deployment Guide

## 🎯 **Simplified Deployment Process**

This guide shows how to deploy the complete ADA Clara backend in the future using the CDK stack we created, making deployments much simpler and more reliable.

---

## 🚀 **One-Command Deployment**

### **Prerequisites**
```bash
# Install dependencies
npm install

# Ensure CDK is bootstrapped
npx cdk bootstrap
```

### **Deploy Everything**
```bash
# Deploy the complete frontend-aligned API stack
npx cdk deploy AdaClaraFrontendAlignedApi
```

**That's it!** This single command will create:
- ✅ All 3 Lambda functions (chat, escalation, admin analytics)
- ✅ Complete API Gateway with all routes
- ✅ DynamoDB tables
- ✅ IAM roles and permissions
- ✅ CloudWatch log groups
- ✅ CORS configuration

---

## 📋 **What Gets Deployed**

### **Lambda Functions**
1. **Simple Chat Processor** (`ada-clara-simple-chat-processor`)
   - Handles chat requests with escalation detection
   - Returns frontend-aligned response format
   - No external dependencies for reliability

2. **Escalation Handler** (`ada-clara-escalation-handler-v2`)
   - Handles "Talk to Person" form submissions
   - Stores requests in DynamoDB
   - Returns success confirmation

3. **Admin Analytics** (`ada-clara-admin-analytics-v2`)
   - Provides complete dashboard data
   - All expected frontend fields included
   - Mock data ready for real analytics integration

### **API Gateway Routes**
```
GET  /health                              # System health
POST /chat                                # Send chat message
GET  /chat/history                        # Chat history
GET  /chat/sessions                       # User sessions
POST /escalation/request                  # Submit escalation form
GET  /admin/dashboard                     # Complete dashboard data
GET  /admin/metrics                       # Metrics only
GET  /admin/escalation-requests           # Escalation requests list
GET  /admin/conversations/chart           # Chart data
GET  /admin/language-split                # Language distribution
GET  /admin/frequently-asked-questions    # FAQ data
GET  /admin/unanswered-questions          # Unanswered questions
```

### **DynamoDB Tables**
- `ada-clara-escalation-requests` - Stores escalation form submissions

---

## 🔧 **Development Workflow**

### **1. Make Changes**
```bash
# Update Lambda function code in lambda-packages/
# Update CDK stack in lib/frontend-aligned-api-stack.ts
```

### **2. Test Locally**
```bash
# Run tests
npm test

# Validate CDK changes
npx cdk diff AdaClaraFrontendAlignedApi
```

### **3. Deploy Changes**
```bash
# Deploy updated stack
npx cdk deploy AdaClaraFrontendAlignedApi
```

### **4. Verify Deployment**
```bash
# Test API endpoints
node scripts/test-api-endpoints.js

# Check CloudWatch logs if needed
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ada-clara"
```

---

## 📊 **Monitoring & Maintenance**

### **CloudWatch Logs**
```bash
# View chat processor logs
aws logs tail /aws/lambda/ada-clara-simple-chat-processor --follow

# View escalation handler logs  
aws logs tail /aws/lambda/ada-clara-escalation-handler-v2 --follow

# View admin analytics logs
aws logs tail /aws/lambda/ada-clara-admin-analytics-v2 --follow
```

### **DynamoDB Monitoring**
```bash
# Check escalation requests
aws dynamodb scan --table-name ada-clara-escalation-requests --max-items 10
```

### **API Gateway Monitoring**
```bash
# Get API Gateway URL
aws cloudformation describe-stacks --stack-name AdaClaraFrontendAlignedApi --query "Stacks[0].Outputs[?OutputKey=='FrontendAlignedApiUrl'].OutputValue" --output text
```

---

## 🎯 **Frontend Integration**

### **Environment Variables**
After deployment, update your frontend environment:

```bash
# Get the new API URL from CDK output
API_URL=$(aws cloudformation describe-stacks --stack-name AdaClaraFrontendAlignedApi --query "Stacks[0].Outputs[?OutputKey=='FrontendAlignedApiUrl'].OutputValue" --output text)

# Update .env.local
echo "NEXT_PUBLIC_API_URL=${API_URL}" >> .env.local
```

### **API Integration**
The API endpoints will have the same response formats as documented:

```typescript
// Chat endpoint
const response = await fetch(`${API_URL}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, sessionId })
});
// Returns: { response, confidence, sources, escalated, escalationReason }

// Escalation form
const result = await fetch(`${API_URL}/escalation/request`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, phoneNumber, zipCode })
});
// Returns: { success, message, escalationId, status }

// Admin dashboard
const dashboard = await fetch(`${API_URL}/admin/dashboard`, {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
// Returns: { metrics, conversationsChart, languageSplit, frequentlyAskedQuestions, unansweredQuestions }
```

---

## 🔄 **Migration from Manual Deployment**

### **Current State**
- Manual API Gateway: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/`
- Manually created Lambda functions
- Manually configured routes

### **Migration Steps**

1. **Deploy CDK Stack** (creates new resources)
   ```bash
   npx cdk deploy AdaClaraFrontendAlignedApi
   ```

2. **Test New API** (parallel to existing)
   ```bash
   # Get new API URL
   NEW_API_URL=$(aws cloudformation describe-stacks --stack-name AdaClaraFrontendAlignedApi --query "Stacks[0].Outputs[?OutputKey=='FrontendAlignedApiUrl'].OutputValue" --output text)
   
   # Test endpoints
   curl "${NEW_API_URL}/health"
   curl -X POST "${NEW_API_URL}/chat" -H "Content-Type: application/json" -d '{"message":"test"}'
   ```

3. **Update Frontend** (point to new API)
   ```bash
   # Update environment variables
   NEXT_PUBLIC_API_URL=${NEW_API_URL}
   ```

4. **Verify Everything Works**
   ```bash
   # Run comprehensive tests
   node scripts/test-api-endpoints.js
   ```

5. **Clean Up Old Resources** (optional)
   ```bash
   # Delete manually created Lambda functions
   aws lambda delete-function --function-name ada-clara-escalation-handler
   aws lambda delete-function --function-name ada-clara-admin-analytics
   
   # Keep the original API Gateway if needed for backward compatibility
   ```

---

## 🛡️ **Security & Best Practices**

### **IAM Permissions**
- Lambda functions have minimal required permissions
- DynamoDB access is scoped to specific tables
- CloudWatch logging enabled for debugging

### **CORS Configuration**
- Properly configured for frontend domains
- Allows necessary headers and methods
- Can be restricted to specific origins in production

### **Error Handling**
- Consistent JSON error responses
- Proper HTTP status codes
- CloudWatch logging for debugging

---

## 📞 **Troubleshooting**

### **Common Issues**

1. **CDK Bootstrap Required**
   ```bash
   npx cdk bootstrap
   ```

2. **Lambda Package Missing**
   ```bash
   # Ensure lambda packages exist
   ls -la lambda-packages/
   ```

3. **Permission Errors**
   ```bash
   # Check AWS credentials
   aws sts get-caller-identity
   ```

4. **API Gateway 502 Errors**
   ```bash
   # Check Lambda logs
   aws logs tail /aws/lambda/ada-clara-simple-chat-processor --follow
   ```

### **Getting Help**
- Check CloudWatch logs for detailed error messages
- Use CDK diff to see what changes will be made
- Test individual Lambda functions using AWS Console
- Verify API Gateway integration in AWS Console

---

## 🎉 **Benefits of CDK Deployment**

### **Reliability**
- Infrastructure as Code ensures consistent deployments
- No manual configuration steps to forget
- Version controlled infrastructure changes

### **Simplicity**
- One command deploys everything
- Automatic dependency management
- Built-in best practices

### **Maintainability**
- Easy to update and modify
- Clear resource relationships
- Automatic cleanup on stack deletion

### **Scalability**
- Easy to add new endpoints
- Simple to modify Lambda configurations
- Straightforward environment management

**The CDK deployment makes future ADA Clara deployments simple, reliable, and maintainable! 🚀**