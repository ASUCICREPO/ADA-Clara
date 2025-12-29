# ADA Clara Authentication System Implementation Guide

## Overview

The ADA Clara authentication system provides enterprise-grade security with role-based access control for healthcare professionals. Built on AWS Cognito with comprehensive security enhancements including WAF, Secrets Manager, and audit logging.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│   AWS Cognito    │───▶│   Backend APIs  │
│   (Next.js)     │    │   User Pool      │    │   (Lambda)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌──────────────────┐             │
         └─────────────▶│   Identity Pool  │◀────────────┘
                        │   (AWS Access)   │
                        └──────────────────┘
                                 │
                        ┌──────────────────┐
                        │   IAM Roles      │
                        │ • Public         │
                        │ • Professional   │
                        │ • Admin          │
                        └──────────────────┘
```

## User Types & Permissions

### Public Users
- **Access**: Basic diabetes information
- **Permissions**: `chat:basic`, `chat:history`
- **Authentication**: Email/password
- **Restrictions**: General information only, no clinical details

### Professional Members
- **Access**: Enhanced diabetes resources and clinical information
- **Permissions**: `chat:basic`, `chat:history`, `chat:enhanced`, `professional:resources`
- **Authentication**: Email/password + membership verification
- **Verification**: Professional license/membership ID validation
- **Organizations Supported**:
  - American Diabetes Association (ADA)
  - American Medical Association (AMA)
  - American Nurses Association (ANA)
  - Academy of Nutrition and Dietetics (AND)
  - American Association of Diabetes Educators (AADE)

### Admin Users
- **Access**: Full system access including dashboard and analytics
- **Permissions**: `admin:dashboard`, `admin:analytics`, `admin:users`, `admin:system`
- **Authentication**: Email/password with admin privileges
- **Capabilities**: User management, system monitoring, analytics access

## Implementation Components

### 1. Cognito User Pool Configuration

**Location**: `backend/lib/cognito-auth-stack.ts`

**Key Features**:
- Custom attributes for healthcare professionals
- Secure password policies (8+ chars, mixed case, numbers)
- Email verification required
- OAuth 2.0 support for frontend integration
- Device tracking and security monitoring

**Custom Attributes**:
```typescript
customAttributes: {
  'user_type': 'public' | 'professional' | 'admin',
  'membership_id': string,
  'organization': string,
  'language_preference': 'en' | 'es',
  'verified_professional': 'true' | 'false' | 'pending'
}
```

### 2. Authentication Lambda Functions

#### Auth Handler (`backend/lambda/auth-handler/index.ts`)
- **Purpose**: JWT token validation and user context extraction
- **Endpoints**:
  - `POST /auth/validate` - Validate JWT tokens
  - `GET /auth/user` - Get user context
  - `POST /auth/verify-professional` - Professional verification
  - `GET /auth/health` - Health check

**Key Methods**:
```typescript
validateToken(token: string): Promise<AuthResponse>
extractUserContext(payload: CognitoJWTPayload): Promise<UserContext>
handleAuthorizer(event: APIGatewayAuthorizerEvent): Promise<APIGatewayAuthorizerResult>
```

#### Membership Verification (`backend/lambda/membership-verification/index.ts`)
- **Purpose**: Professional membership validation
- **Endpoints**:
  - `POST /membership/verify` - Verify professional credentials
  - `GET /membership/status` - Check verification status
  - `GET /membership/organizations` - List supported organizations

**Verification Methods**:
1. **Third-party API**: Integration with professional licensing databases
2. **Organization Database**: Direct organization membership validation
3. **Manual Process**: Human review for complex cases

### 3. Security Enhancements

**Location**: `backend/lib/security-enhancements-stack.ts`

#### AWS WAF Protection
- **Rate Limiting**: 2000 requests per 5 minutes per IP
- **Geographic Blocking**: High-risk countries (CN, RU, KP)
- **SQL Injection Protection**: AWS managed rules
- **Healthcare Data Protection**: Custom rules for sensitive data patterns

#### Secrets Management
- **Database Credentials**: Encrypted with KMS
- **API Keys**: Bedrock, third-party integrations
- **JWT Signing Keys**: Secure token validation
- **Professional Verification**: API credentials for licensing databases

#### Audit & Compliance
- **CloudTrail**: All API calls logged
- **GuardDuty**: Threat detection enabled
- **AWS Config**: Compliance rule monitoring
- **CloudWatch**: Security event alerting

## Deployment Process

### Prerequisites
```bash
# Set environment variables
export CDK_DEFAULT_ACCOUNT=your-account-id
export CDK_DEFAULT_REGION=us-east-1
export ADMIN_EMAIL=admin@your-domain.com
export SECURITY_NOTIFICATION_EMAIL=security@your-domain.com
```

### Step 1: Deploy Cognito Authentication
```bash
cd backend
npm install
npm run build
npx ts-node scripts/deploy-cognito-auth.ts
```

**What this deploys**:
- Cognito User Pool with custom attributes
- User Pool Client with OAuth configuration
- Identity Pool for AWS resource access
- IAM roles for different user types
- Auth Lambda functions
- Membership verification Lambda

### Step 2: Deploy Security Enhancements
```bash
npx ts-node scripts/deploy-production-security.ts
```

**What this deploys**:
- AWS WAF with comprehensive rules
- Secrets Manager with KMS encryption
- CloudTrail for audit logging
- GuardDuty for threat detection
- AWS Config for compliance monitoring
- CloudWatch security monitoring

### Step 3: Validate Deployment
```bash
npx ts-node scripts/test-cognito-integration.ts
```

**What this tests**:
- Cognito configuration validation
- Lambda function deployment
- IAM roles and permissions
- Security feature verification
- Integration readiness

## Configuration Files Generated

After deployment, these files are created for frontend integration:

### `cognito-config.json`
```json
{
  "aws_project_region": "us-east-1",
  "aws_cognito_region": "us-east-1",
  "aws_user_pools_id": "us-east-1_xxxxxxxxx",
  "aws_user_pools_web_client_id": "xxxxxxxxxxxxxxxxxx",
  "aws_cognito_identity_pool_id": "us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "aws_user_pool_domain": "https://ada-clara-xxxxx.auth.us-east-1.amazoncognito.com",
  "oauth": {
    "domain": "ada-clara-xxxxx.auth.us-east-1.amazoncognito.com",
    "scope": ["email", "openid", "profile"],
    "redirectSignIn": "http://localhost:3000/auth/callback",
    "redirectSignOut": "http://localhost:3000",
    "responseType": "code"
  },
  "userTypes": ["public", "professional", "admin"]
}
```

### `.env.production`
```bash
# Cognito Configuration
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxx
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Security Configuration
WAF_ENABLED=true
RATE_LIMITING_ENABLED=true
ENCRYPTION_ENABLED=true
AUDIT_LOGGING_ENABLED=true
```

## Authentication Flow

### 1. User Registration
```typescript
// Frontend calls Cognito
const user = await Auth.signUp({
  username: email,
  password: password,
  attributes: {
    email: email,
    'custom:user_type': 'public',
    'custom:language_preference': 'en'
  }
});
```

### 2. Email Verification
```typescript
// User receives email with verification code
await Auth.confirmSignUp(email, verificationCode);
```

### 3. Sign In
```typescript
const user = await Auth.signIn(email, password);
const session = await Auth.currentSession();
const idToken = session.getIdToken().getJwtToken();
```

### 4. Professional Verification (Optional)
```typescript
// Call membership verification API
const response = await fetch('/membership/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    membershipId: 'ADA123456',
    organization: 'American Diabetes Association',
    profession: 'Certified Diabetes Educator'
  })
});
```

### 5. API Access with JWT
```typescript
// All API calls include JWT token
const chatResponse = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: 'What is type 1 diabetes?' })
});
```

## Security Features

### Password Policy
- Minimum 8 characters
- Requires lowercase letters
- Requires uppercase letters
- Requires numbers
- Symbols optional (configurable)
- Temporary password validity: 7 days

### Token Management
- Access token validity: 1 hour
- ID token validity: 1 hour
- Refresh token validity: 30 days
- Token revocation enabled
- Automatic token refresh

### Device Security
- Device tracking enabled
- Challenge required on new devices
- Device remembering on user prompt

### Account Security
- Email verification required
- Account recovery via email only
- User existence errors prevented
- Failed login attempt monitoring

## Monitoring & Alerting

### CloudWatch Alarms
- **WAF Blocked Requests**: >100 blocked requests in 5 minutes
- **Failed Authentication**: >50 failed attempts in 5 minutes
- **Unusual API Activity**: >20 4XX errors in 5 minutes

### Security Notifications
- Threat detection alerts via GuardDuty
- Compliance violations via AWS Config
- Security events via CloudTrail
- Email notifications to security team

## Troubleshooting

### Common Issues

#### 1. Token Validation Failures
```bash
# Check token expiration
aws cognito-idp admin-get-user --user-pool-id <pool-id> --username <username>

# Verify JWKS endpoint
curl https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/jwks.json
```

#### 2. Professional Verification Issues
```bash
# Check membership record
aws dynamodb get-item --table-name ada-clara-professional-members --key '{"membershipId":{"S":"ADA123456"}}'

# Test verification endpoint
curl -X POST https://api.ada-clara.com/membership/verify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"membershipId":"ADA123456","organization":"American Diabetes Association"}'
```

#### 3. WAF Blocking Legitimate Requests
```bash
# Check WAF logs
aws wafv2 get-sampled-requests --web-acl-arn <web-acl-arn> --rule-metric-name <rule-name>

# Temporarily disable rule for testing
aws wafv2 update-web-acl --scope REGIONAL --id <web-acl-id> --default-action Allow={}
```

### Logs and Debugging

#### CloudWatch Log Groups
- `/aws/lambda/ada-clara-auth-handler`
- `/aws/lambda/ada-clara-membership-verification`
- `/aws/cognito/ada-clara-users`
- `/aws/wafv2/ada-clara-web-acl`

#### Useful CloudWatch Insights Queries
```sql
-- Failed authentication attempts
fields @timestamp, @message
| filter @message like /authentication failed/
| sort @timestamp desc
| limit 100

-- Professional verification requests
fields @timestamp, @message
| filter @message like /membership verification/
| sort @timestamp desc
| limit 50
```

## Cost Optimization

### Estimated Monthly Costs (1000 active users)
- **Cognito User Pool**: ~$5-10
- **AWS WAF**: ~$10-20
- **Secrets Manager**: ~$5
- **CloudTrail**: ~$2-5
- **GuardDuty**: ~$3-8
- **Lambda Execution**: ~$1-3
- **Total**: ~$26-51/month

### Cost Reduction Tips
1. Use Cognito free tier (50,000 MAUs)
2. Optimize Lambda memory allocation
3. Set appropriate log retention periods
4. Use S3 lifecycle policies for audit logs
5. Monitor and adjust WAF rules

## Production Checklist

### Before Go-Live
- [ ] Admin user created and tested
- [ ] Professional verification tested with real credentials
- [ ] WAF rules tested and tuned
- [ ] Security monitoring alerts configured
- [ ] Backup and recovery procedures documented
- [ ] Load testing completed
- [ ] Security audit completed
- [ ] HIPAA compliance verified

### Post-Deployment
- [ ] Monitor authentication success rates
- [ ] Review security alerts daily
- [ ] Update professional organization list as needed
- [ ] Regular security policy reviews
- [ ] Token rotation schedule established
- [ ] Incident response procedures tested

## Support and Maintenance

### Regular Tasks
- **Weekly**: Review security alerts and failed authentications
- **Monthly**: Update professional organization credentials
- **Quarterly**: Security policy review and updates
- **Annually**: Full security audit and penetration testing

### Emergency Procedures
- **Security Incident**: Disable affected users, review logs, notify security team
- **Service Outage**: Check CloudWatch alarms, review CloudFormation events
- **Data Breach**: Follow incident response plan, notify compliance team

## Integration with Existing Systems

### RAG Processor Integration
The authentication system integrates seamlessly with the existing RAG processor:
```typescript
// RAG queries include user context
const ragResponse = await fetch('/api/query', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'What medications are used for type 2 diabetes?',
    userType: 'professional', // Enables enhanced responses
    language: 'en'
  })
});
```

### Admin Dashboard Integration
Admin users get full access to analytics and system management:
```typescript
// Admin dashboard data
const dashboardData = await fetch('/api/admin/dashboard', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
```

This authentication system provides enterprise-grade security while maintaining ease of use for healthcare professionals and patients accessing diabetes information through ADA Clara.