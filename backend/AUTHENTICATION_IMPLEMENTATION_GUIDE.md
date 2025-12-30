# ADA Clara Authentication System Implementation Guide

## Overview

The ADA Clara authentication system provides secure access control with a simplified two-user model. Public users can access chat functionality without authentication, while admin users have secure dashboard access via AWS Cognito.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Public Users  │───▶│   Public Chat    │───▶│   Backend APIs  │
│   (No Auth)     │    │   (Direct)       │    │   (Lambda)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘

┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Admin Users   │───▶│   AWS Cognito    │───▶│   Admin APIs    │
│   (Cognito)     │    │   JWT Tokens     │    │   (Lambda)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                       ┌──────────────────┐
                       │   Identity Pool  │
                       │   (AWS Access)   │
                       └──────────────────┘
```

## User Types & Permissions

### Public Users
- **Access**: Full chat functionality without authentication
- **Permissions**: `chat:basic`, `chat:history`, `chat:sessions`
- **Authentication**: None required
- **Use Case**: Diabetes.org visitors seeking information

### Admin Users
- **Access**: Dashboard, analytics, system management
- **Permissions**: `admin:dashboard`, `admin:analytics`, `admin:users`, `admin:system`
- **Authentication**: AWS Cognito JWT tokens
- **Use Case**: System administrators and content managers

## Implementation Components

### 1. Cognito User Pool Configuration

**Location**: `backend/lib/cognito-auth-stack.ts`

**Key Features**:
- Admin user authentication only
- Secure password policies (8+ chars, mixed case, numbers)
- Email verification required
- OAuth 2.0 support for admin dashboard
- Device tracking and security monitoring

**Custom Attributes**:
```typescript
customAttributes: {
  'user_type': 'admin',
  'language_preference': 'en' | 'es'
}
```

### 2. Authentication Lambda Functions

#### Simple Auth Handler (`backend/lambda/simple-auth-handler/index.ts`)
- **Purpose**: JWT token validation for admin users only
- **Endpoints**:
  - `POST /auth` - Validate admin JWT tokens
  - `GET /auth` - Get admin user context
  - `GET /auth/health` - Health check

**Key Methods**:
```typescript
validateAdminToken(token: string): Promise<AuthResponse>
extractAdminUserContext(payload: CognitoJWTPayload): Promise<AdminUserContext>
handleAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>
```

### 3. Public Chat Integration

**No Authentication Required**:
- Public users access chat endpoints directly
- No JWT tokens or user registration needed
- Session management via client-side session IDs
- Full chat functionality available immediately

## Deployment Process

### Prerequisites
```bash
# Set environment variables
export CDK_DEFAULT_ACCOUNT=your-account-id
export CDK_DEFAULT_REGION=us-east-1
export ADMIN_EMAIL=admin@your-domain.com
```

### Step 1: Deploy Simplified Authentication
```bash
cd backend
npm install
npm run build
npx ts-node scripts/deploy-simplified-cognito.ts
```

**What this deploys**:
- Cognito User Pool for admin users
- User Pool Client with OAuth configuration
- Identity Pool for AWS resource access
- IAM roles for admin access
- Simple auth Lambda function

### Step 2: Deploy Unified API
```bash
npx ts-node scripts/deploy-simplified-api.ts
```

**What this deploys**:
- API Gateway with public and admin endpoints
- Public chat endpoints (no auth required)
- Admin authentication endpoints (JWT required)
- Proper CORS configuration

### Step 3: Validate Deployment
```bash
npx ts-node scripts/test-simplified-api.ts
```

**What this tests**:
- Public endpoint accessibility (no auth)
- Admin endpoint security (JWT required)
- System health checks
- Integration readiness

## Configuration Files Generated

After deployment, these files are created for frontend integration:

### `simplified-config.json`
```json
{
  "apiUrl": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod",
  "userModel": "simplified",
  "userTypes": ["public", "admin"],
  
  "publicEndpoints": {
    "health": "/health",
    "chat": "/chat",
    "chatHistory": "/chat/history",
    "chatSessions": "/chat/sessions"
  },
  
  "adminEndpoints": {
    "auth": "/auth",
    "authHealth": "/auth/health"
  },
  
  "authentication": {
    "userPoolId": "us-east-1_hChjb1rUB",
    "clientId": "3f8vld6mnr1nsfjci1b61okc46",
    "identityPoolId": "us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c",
    "domain": "https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com",
    "requiredFor": ["admin"]
  },
  
  "features": {
    "publicChat": true,
    "adminDashboard": true
  }
}
```

### `.env.production`
```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod
NEXT_PUBLIC_USER_MODEL=simplified

# Admin Authentication (Cognito)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_hChjb1rUB
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=3f8vld6mnr1nsfjci1b61okc46
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-023336033519.auth.us-east-1.amazoncognito.com
```

## Authentication Flow

### 1. Public Users (No Authentication)
```typescript
// Public users access chat directly
const sendMessage = async (message: string, sessionId?: string) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message, 
      sessionId: sessionId || `public-${Date.now()}` 
    })
  });
  return response.json();
};
```

### 2. Admin Users (Cognito Authentication)
```typescript
// Admin sign in
const adminSignIn = async (email: string, password: string) => {
  const user = await Auth.signIn(email, password);
  const session = await Auth.currentSession();
  const idToken = session.getIdToken().getJwtToken();
  
  // Verify admin privileges
  const payload = JSON.parse(atob(idToken.split('.')[1]));
  if (payload['custom:user_type'] !== 'admin') {
    throw new Error('Admin privileges required');
  }
  
  return { user, token: idToken };
};
```

### 3. Admin API Access
```typescript
// Admin API calls with JWT
const adminApiCall = async (endpoint: string, options: RequestInit = {}) => {
  const session = await Auth.currentSession();
  const token = session.getIdToken().getJwtToken();
  
  return fetch(`/api/admin${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};
```

## Security Features

### Public Endpoints
- **No Authentication**: Immediate access for diabetes.org visitors
- **Rate Limiting**: Prevents abuse while maintaining accessibility
- **CORS**: Configured for frontend integration
- **Session Management**: Client-side session tracking

### Admin Endpoints
- **JWT Validation**: Secure token-based authentication
- **Admin Verification**: Ensures only admin users can access
- **Token Expiration**: 1-hour token validity with refresh capability
- **Device Security**: Device tracking for admin accounts

### Password Policy (Admin Users)
- Minimum 8 characters
- Requires lowercase letters
- Requires uppercase letters
- Requires numbers
- Email verification required

## Monitoring & Alerting

### CloudWatch Metrics
- **Public Chat Usage**: Message volume and response times
- **Admin Authentication**: Login success/failure rates
- **API Performance**: Response times and error rates
- **Security Events**: Failed authentication attempts

### Health Checks
- **System Health**: `GET /health` - Overall system status
- **Auth Health**: `GET /auth/health` - Admin authentication service status

## Troubleshooting

### Common Issues

#### 1. Public Chat Not Working
```bash
# Test public health check
curl https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/health

# Test public chat endpoint
curl -X POST https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Test message"}'
```

#### 2. Admin Authentication Issues
```bash
# Check admin auth health
curl https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health

# Test admin endpoint (should return 401 without token)
curl https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth
```

#### 3. CORS Issues
- Ensure frontend domain is configured in API Gateway CORS settings
- Check that preflight OPTIONS requests are handled correctly
- Verify Access-Control-Allow-Origin headers are present

### Logs and Debugging

#### CloudWatch Log Groups
- `/aws/lambda/ada-clara-simple-auth-handler`
- `/aws/lambda/ada-clara-chat-processor`
- `/aws/apigateway/ada-clara-unified-api`

#### Useful CloudWatch Insights Queries
```sql
-- Public chat usage
fields @timestamp, @message
| filter @message like /POST \/chat/
| sort @timestamp desc
| limit 100

-- Admin authentication attempts
fields @timestamp, @message
| filter @message like /admin authentication/
| sort @timestamp desc
| limit 50
```

## Cost Optimization

### Estimated Monthly Costs (1000 active users)
- **Cognito User Pool**: ~$0 (admin users only, well within free tier)
- **API Gateway**: ~$3-5 (based on request volume)
- **Lambda Execution**: ~$1-3 (optimized for minimal admin usage)
- **CloudWatch Logs**: ~$1-2
- **Total**: ~$5-10/month

### Cost Reduction Tips
1. Leverage Cognito free tier for admin users
2. Optimize Lambda memory allocation
3. Set appropriate log retention periods
4. Use efficient session management for public users

## Production Checklist

### Before Go-Live
- [ ] Admin user created and tested
- [ ] Public chat functionality tested
- [ ] API Gateway CORS configured for production domain
- [ ] CloudWatch monitoring configured
- [ ] Load testing completed for public endpoints
- [ ] Admin dashboard security tested

### Post-Deployment
- [ ] Monitor public chat usage patterns
- [ ] Review admin authentication logs
- [ ] Verify system performance metrics
- [ ] Test backup and recovery procedures

## Integration Examples

### Frontend Public Chat Component
```typescript
const PublicChat = () => {
  const [messages, setMessages] = useState([]);
  const [sessionId] = useState(`public-${Date.now()}`);

  const sendMessage = async (message: string) => {
    // No authentication required
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });
    
    const data = await response.json();
    setMessages(prev => [...prev, { text: message, sender: 'user' }, data]);
  };

  return (
    <div>
      {/* Chat interface - no login required */}
    </div>
  );
};
```

### Frontend Admin Dashboard
```typescript
const AdminDashboard = () => {
  const { admin, token } = useAdminAuth();

  const fetchDashboardData = async () => {
    // Requires admin authentication
    const response = await fetch('/api/admin/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  };

  if (!admin) {
    return <AdminLogin />;
  }

  return (
    <div>
      {/* Admin dashboard content */}
    </div>
  );
};
```

## Support and Maintenance

### Regular Tasks
- **Weekly**: Review public chat usage and admin access logs
- **Monthly**: Update admin user credentials as needed
- **Quarterly**: Review and optimize API performance

### Emergency Procedures
- **Public Chat Outage**: Check Lambda function health and API Gateway status
- **Admin Access Issues**: Verify Cognito service status and JWT validation
- **Security Incident**: Review CloudWatch logs and disable affected accounts

This simplified authentication system provides secure admin access while maintaining barrier-free public chat functionality, perfectly aligned with the diabetes.org visitor experience and administrative needs.