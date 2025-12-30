# ADA Clara Unified API Deployment Guide

## Overview

This guide walks you through deploying the unified API Gateway that consolidates all ADA Clara backend services into a single, easy-to-integrate endpoint for frontend development.

## What's New

✅ **Single API Gateway** - All endpoints under one URL  
✅ **Consistent routing** - `/auth/*`, `/chat/*`, `/admin/*`, `/query`  
✅ **Proper CORS** - Configured for frontend integration  
✅ **Health checks** - Built-in monitoring endpoints  
✅ **Error handling** - Standardized error responses  

## Prerequisites

1. **AWS CLI configured** with appropriate permissions
2. **Node.js 18+** installed
3. **AWS CDK** installed (`npm install -g aws-cdk`)
4. **Environment variables** set (optional):
   - `ADMIN_EMAIL` - Admin user email for Cognito
   - `SECURITY_NOTIFICATION_EMAIL` - Security alerts email

## Deployment Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Bootstrap CDK (First time only)

```bash
cdk bootstrap
```

### 3. Deploy the Unified API

```bash
npm run deploy-unified-api
```

This will deploy all required stacks in the correct order:
- DynamoDB tables
- Cognito authentication
- S3 buckets and vector storage
- Lambda functions
- **Unified API Gateway**

### 4. Get Configuration Values

After deployment, the script will output configuration values like:

```
✅ Deployment completed successfully!

📋 Configuration Values for Frontend:
==================================
Cognito User Pool ID: us-east-1_ABC123DEF
Cognito App Client ID: 1a2b3c4d5e6f7g8h9i0j
Cognito Identity Pool ID: us-east-1:12345678-1234-1234-1234-123456789012
Cognito Domain: https://ada-clara-756493389182.auth.us-east-1.amazoncognito.com
Unified API URL: https://abc123def4.execute-api.us-east-1.amazonaws.com/prod

🔗 API Endpoints Available:
=========================
Authentication:
  GET  /auth - Get user context
  POST /auth - Validate JWT token
  GET  /auth/user - Get user context
  POST /auth/verify-professional - Verify credentials
  GET  /auth/health - Auth service health

Chat:
  POST /chat - Send message
  GET  /chat/history - Get user sessions
  GET  /chat/history/{sessionId} - Get session messages
  GET  /chat/sessions - Get user sessions (alias)
  GET  /chat - Chat service health

Admin (Admin users only):
  GET  /admin/dashboard - Dashboard data
  GET  /admin/conversations - Conversation analytics
  GET  /admin/questions - Question analytics
  GET  /admin/escalations - Escalation analytics
  GET  /admin/realtime - Real-time metrics
  GET  /admin/health - Admin service health

Query/RAG:
  POST /query - Process RAG query
  GET  /query - RAG service health

System:
  GET  /health - Overall system health
```

### 5. Test the API

```bash
# Test with the API URL from deployment output
npm run test-unified-api https://your-api-url.execute-api.us-east-1.amazonaws.com/prod
```

## Frontend Configuration

Update your frontend environment variables:

### Development (.env.local)
```bash
# Unified API Configuration
NEXT_PUBLIC_API_URL=https://abc123def4.execute-api.us-east-1.amazonaws.com/prod

# Cognito Configuration
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_ABC123DEF
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=1a2b3c4d5e6f7g8h9i0j
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:12345678-1234-1234-1234-123456789012
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-756493389182.auth.us-east-1.amazoncognito.com

# App Configuration
NEXT_PUBLIC_APP_NAME=ADA Clara
NEXT_PUBLIC_ENVIRONMENT=development
```

### Production (.env.production)
```bash
# Use the same values but update redirect URLs in Cognito for production domain
NEXT_PUBLIC_API_URL=https://abc123def4.execute-api.us-east-1.amazonaws.com/prod
# ... other values same as development
```

## API Client Usage

### Simple API Client
```javascript
// lib/api-client.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

### Usage Examples
```javascript
// Send chat message
const response = await apiClient.post('/chat', {
  message: 'What is diabetes?',
  sessionId: 'session-123'
});

// Get user context
const userContext = await apiClient.get('/auth/user');

// Get chat history
const history = await apiClient.get('/chat/history');

// Admin dashboard (admin users only)
const dashboard = await apiClient.get('/admin/dashboard');
```

## Monitoring and Troubleshooting

### Health Checks

Test individual services:
```bash
curl https://your-api-url/health              # Overall system
curl https://your-api-url/auth/health         # Auth service
curl https://your-api-url/chat                # Chat service  
curl https://your-api-url/query               # RAG service
curl https://your-api-url/admin/health        # Admin service
```

### CloudWatch Logs

Monitor logs in AWS CloudWatch:
- `/aws/lambda/ada-clara-auth-handler`
- `/aws/lambda/ada-clara-chat-processor`
- `/aws/lambda/ada-clara-rag-processor`
- `/aws/lambda/ada-clara-admin-analytics`
- `/aws/apigateway/ada-clara-unified-api`

### Common Issues

1. **CORS Errors**
   - Check that your domain is in the CORS configuration
   - Verify you're sending the correct headers

2. **401 Unauthorized**
   - Check JWT token is valid and not expired
   - Verify token is in Authorization header as `Bearer <token>`

3. **403 Forbidden**
   - User doesn't have required permissions
   - Check user type (public/professional/admin)

4. **404 Not Found**
   - Verify endpoint path is correct
   - Check API Gateway deployment status

## Security Considerations

### Production Checklist

- [ ] Update CORS origins to your production domain
- [ ] Set up custom domain with SSL certificate
- [ ] Configure API keys for rate limiting
- [ ] Enable AWS WAF for additional protection
- [ ] Set up CloudWatch alarms for monitoring
- [ ] Configure backup and disaster recovery

### Rate Limiting

The API includes basic rate limiting:
- 1000 requests/second
- 2000 burst limit

For production, consider:
- API keys for different user tiers
- More restrictive limits for public users
- Higher limits for verified professionals

## Updating the API

### Adding New Endpoints

1. Add the endpoint to the appropriate Lambda function
2. Update the unified API stack routing
3. Redeploy: `npm run deploy-unified-api`
4. Update frontend integration guide

### Modifying Existing Endpoints

1. Update the Lambda function code
2. Test locally if possible
3. Deploy: `npm run deploy-unified-api`
4. Run API tests: `npm run test-unified-api <api-url>`

## Support

### Getting Help

1. **Check CloudWatch logs** for detailed error messages
2. **Run health checks** to identify failing services
3. **Test individual endpoints** with curl or Postman
4. **Review deployment outputs** for configuration issues

### Useful Commands

```bash
# Redeploy everything
npm run deploy-unified-api

# Test API endpoints
npm run test-unified-api <api-url>

# Check stack status
cdk list
cdk diff AdaClaraUnifiedAPI

# View stack outputs
aws cloudformation describe-stacks --stack-name AdaClaraUnifiedAPI --query 'Stacks[0].Outputs'
```

## Next Steps

1. **Deploy the unified API** using this guide
2. **Test all endpoints** with the test script
3. **Update frontend configuration** with the API URL
4. **Start frontend integration** using the updated integration guide
5. **Set up monitoring** and alerts for production

The unified API simplifies frontend integration by providing a single, consistent endpoint for all ADA Clara services. Your frontend team can now start integration with confidence!