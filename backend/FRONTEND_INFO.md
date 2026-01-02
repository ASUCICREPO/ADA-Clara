# ADA Clara Backend - Frontend Integration Guide

## API Configuration

### Base URL
```
https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/
```

### Authentication (Cognito)
```json
{
  "userPoolId": "us-east-1_i1RNxqKoh",
  "userPoolClientId": "1irli5d7j6uje5vn7fs4uu274j",
  "identityPoolId": "us-east-1:5cb99a75-f2a3-4745-8417-0b2095cd26ed",
  "region": "us-east-1",
  "domain": "ada-clara-023336033519-dev.auth.us-east-1.amazoncognito.com",
  "redirectSignIn": "http://localhost:3000/auth/callback",
  "redirectSignOut": "http://localhost:3000",
  "responseType": "code",
  "scope": ["email", "openid", "profile"]
}
```

## User Model

**2-User System:**
- **Public Users**: No authentication required for chat
- **Admin Users**: Cognito authentication required for dashboard access

## API Endpoints

### Public Endpoints (No Authentication)

#### Health Check
```
GET /health
```

#### Chat
```
POST /chat
Content-Type: application/json

{
  "message": "What is diabetes?",
  "sessionId": "user-session-123",
  "language": "en"
}
```

**Response:**
```json
{
  "response": "Diabetes is a condition where your body cannot properly process blood sugar...",
  "confidence": 0.9,
  "sources": [
    {
      "url": "https://diabetes.org/about-diabetes",
      "title": "About Diabetes | ADA",
      "excerpt": "Comprehensive information about diabetes types and management."
    }
  ],
  "escalated": false,
  "escalationSuggested": false,
  "sessionId": "user-session-123",
  "language": "en",
  "timestamp": "2026-01-01T21:31:15.234Z"
}
```

#### Chat History
```
GET /chat/history?sessionId=user-session-123
```

#### Chat Sessions
```
GET /chat/sessions?userId=optional-user-id
```

#### Escalation Request
```
POST /escalation/request
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "(555) 123-4567",
  "zipCode": "12345"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Thank you! Someone from the American Diabetes Association will reach out to you shortly.",
  "escalationId": "esc-1735851075234-abc123def",
  "status": "pending"
}
```

### Admin Endpoints (Authentication Required)

All admin endpoints require Cognito JWT token:
```
Authorization: Bearer <cognito-jwt-token>
```

- `GET /admin/dashboard` - Complete dashboard data
- `GET /admin/metrics` - System metrics  
- `GET /admin/conversations/chart` - Conversation analytics
- `GET /admin/language-split` - Language distribution
- `GET /admin/frequently-asked-questions` - FAQ analytics
- `GET /admin/unanswered-questions` - Unanswered questions
- `GET /admin/escalation-requests` - Escalation queue (alias for /escalation/requests)
- `GET /escalation/requests` - Escalation requests list

## Frontend Implementation

### Public Chat (No Auth)
```javascript
const sendMessage = async (message, sessionId) => {
  const response = await fetch('https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      language: 'en'
    })
  });
  return await response.json();
};
```

### Escalation Request Submission
```javascript
const submitEscalationRequest = async (formData) => {
  const response = await fetch('https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/escalation/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.name,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      zipCode: formData.zipCode
    })
  });
  return await response.json();
};
```

### Admin Authentication
```javascript
import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_i1RNxqKoh',
    userPoolWebClientId: '1irli5d7j6uje5vn7fs4uu274j',
    identityPoolId: 'us-east-1:5cb99a75-f2a3-4745-8417-0b2095cd26ed',
    oauth: {
      domain: 'ada-clara-023336033519-dev.auth.us-east-1.amazoncognito.com',
      scope: ['email', 'openid', 'profile'],
      redirectSignIn: 'http://localhost:3000/auth/callback',
      redirectSignOut: 'http://localhost:3000',
      responseType: 'code'
    }
  }
});

const callAdminAPI = async (endpoint) => {
  const session = await Auth.currentSession();
  const token = session.getIdToken().getJwtToken();
  
  const response = await fetch(`https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return await response.json();
};
```

### Session Management
```javascript
const generateSessionId = () => {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const getOrCreateSessionId = () => {
  let sessionId = localStorage.getItem('ada-clara-session-id');
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem('ada-clara-session-id', sessionId);
  }
  return sessionId;
};
```

## Environment Variables

```env
REACT_APP_API_BASE_URL=https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_i1RNxqKoh
REACT_APP_COGNITO_CLIENT_ID=1irli5d7j6uje5vn7fs4uu274j
REACT_APP_COGNITO_IDENTITY_POOL_ID=us-east-1:5cb99a75-f2a3-4745-8417-0b2095cd26ed
REACT_APP_COGNITO_REGION=us-east-1
REACT_APP_COGNITO_DOMAIN=ada-clara-023336033519-dev.auth.us-east-1.amazoncognito.com
```

## Testing

### Health Check
```bash
curl -X GET "https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/health"
```

### Chat Test
```bash
curl -X POST "https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is diabetes?", "sessionId": "test-123"}'
```

### Escalation Request Test
```bash
curl -X POST "https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/escalation/request" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "phoneNumber": "(555) 123-4567", "zipCode": "12345"}'
```

## CORS & Rate Limits

- **CORS**: Configured for `localhost:3000` and `ada-clara.diabetes.org`
- **Rate Limit**: 1000 requests/second, 2000 burst limit

## API Response Formats

### Admin Dashboard Data Structure

#### Metrics Response (`GET /admin/metrics`)
```json
{
  "totalConversations": 1234,
  "escalationRate": 18,
  "outOfScopeRate": 7,
  "trends": {
    "conversations": "+12%",
    "escalations": "+6%",
    "outOfScope": "+2%"
  }
}
```

#### Conversations Chart (`GET /admin/conversations/chart`)
```json
{
  "data": [
    { "date": "12/15", "conversations": 140 },
    { "date": "12/16", "conversations": 165 },
    { "date": "12/17", "conversations": 155 }
  ]
}
```

#### Language Split (`GET /admin/language-split`)
```json
{
  "english": 75,
  "spanish": 25
}
```

#### Escalation Requests (`GET /escalation/requests`)
```json
{
  "requests": [
    {
      "name": "Maria Rodriguez",
      "email": "maria.rodriguez@email.com", 
      "phone": "(555) 234-5678",
      "zipCode": "85001",
      "dateTime": "Dec 21, 2:34 PM"
    }
  ],
  "total": 1
}
```

#### FAQ Data (`GET /admin/frequently-asked-questions`)
```json
{
  "questions": [
    {
      "question": "What is type 1 diabetes?",
      "count": 45
    }
  ]
}
```

## Frontend Integration Status

### ❌ **INTEGRATION NEEDED**
The frontend currently uses mock data and needs to be updated to call these APIs:

1. **ChatPanel** - Replace `setTimeout()` simulation with `/chat` API calls
2. **TalkToPersonForm** - Replace `alert()` with `/escalation/request` API calls  
3. **Admin Components** - Replace hardcoded data with admin API calls

### ✅ **READY TO USE**
- All backend APIs are implemented and tested
- Data structures match frontend expectations
- Authentication system is configured
- CORS is properly set up