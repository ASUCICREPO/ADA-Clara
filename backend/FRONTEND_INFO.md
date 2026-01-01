# ADA Clara Backend - Frontend Integration Guide

## API Configuration

### Base URL
```
https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod/
```

### Authentication (Cognito)
```json
{
  "userPoolId": "us-east-1_ys5bYVAcQ",
  "userPoolClientId": "2husu7lrbojemcpjqq23gnuf90",
  "identityPoolId": "us-east-1:84e4675e-902a-4ed6-85fe-660037a0c1d7",
  "region": "us-east-1",
  "domain": "ada-clara-023336033519.auth.us-east-1.amazoncognito.com",
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
  "sessionId": "user-session-123",
  "reason": "complex_medical_question",
  "userMessage": "I need specific medical advice about my condition",
  "priority": "normal"
}
```

### Admin Endpoints (Authentication Required)

All admin endpoints require Cognito JWT token:
```
Authorization: Bearer <cognito-jwt-token>
```

- `GET /admin/dashboard` - Main dashboard data
- `GET /admin/metrics` - System metrics
- `GET /admin/conversations/chart` - Conversation analytics
- `GET /admin/language-split` - Language distribution
- `GET /admin/frequently-asked-questions` - FAQ analytics
- `GET /admin/unanswered-questions` - Unanswered questions
- `GET /admin/escalation-requests` - Escalation queue

## Frontend Implementation

### Public Chat (No Auth)
```javascript
const sendMessage = async (message, sessionId) => {
  const response = await fetch('https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod/chat', {
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

### Admin Authentication
```javascript
import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ys5bYVAcQ',
    userPoolWebClientId: '2husu7lrbojemcpjqq23gnuf90',
    identityPoolId: 'us-east-1:84e4675e-902a-4ed6-85fe-660037a0c1d7',
    oauth: {
      domain: 'ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
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
  
  const response = await fetch(`https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod${endpoint}`, {
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
REACT_APP_API_BASE_URL=https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_ys5bYVAcQ
REACT_APP_COGNITO_CLIENT_ID=2husu7lrbojemcpjqq23gnuf90
REACT_APP_COGNITO_IDENTITY_POOL_ID=us-east-1:84e4675e-902a-4ed6-85fe-660037a0c1d7
REACT_APP_COGNITO_REGION=us-east-1
REACT_APP_COGNITO_DOMAIN=ada-clara-023336033519.auth.us-east-1.amazoncognito.com
```

## Testing

### Health Check
```bash
curl -X GET "https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod/health"
```

### Chat Test
```bash
curl -X POST "https://8ijcwb4wwh.execute-api.us-east-1.amazonaws.com/prod/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is diabetes?", "sessionId": "test-123"}'
```

## CORS & Rate Limits

- **CORS**: Configured for `localhost:3000` and `ada-clara.diabetes.org`
- **Rate Limit**: 1000 requests/second, 2000 burst limit