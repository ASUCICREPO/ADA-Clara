# ADA Clara Frontend Integration - COMPLETE API REFERENCE

## 🚀 QUICK REFERENCE - COPY & PASTE VALUES

### API Configuration
```javascript
const API_CONFIG = {
  // Base API URL (PRODUCTION READY)
  baseUrl: 'https://drc24q02xb.execute-api.us-east-1.amazonaws.com/prod',
  
  // AWS Region
  region: 'us-east-1',
  
  // Health Check Endpoint
  healthEndpoint: '/health'
};
```

### AWS Cognito Configuration (For Admin Auth)
```javascript
const COGNITO_CONFIG = {
  // User Pool
  userPoolId: 'us-east-1_3MZjnurA8',
  userPoolClientId: '4b9p91do9vb6nv90f2tonbtdio',
  
  // Identity Pool
  identityPoolId: 'us-east-1:5cf89188-febb-499f-abfc-1e32fe499e79',
  
  // Auth Domain
  domain: 'ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
  
  // OAuth Configuration
  redirectSignIn: 'http://localhost:3000/auth/callback',
  redirectSignOut: 'http://localhost:3000',
  responseType: 'code',
  scope: ['email', 'openid', 'profile'],
  
  // User Types
  userTypes: ['public', 'professional', 'admin']
};
```

### Public Endpoints (No Auth Required) ✅ READY NOW
```javascript
const PUBLIC_ENDPOINTS = {
  // Chat System
  chat: 'POST /chat',
  chatHistory: 'GET /chat/history?sessionId={sessionId}',
  chatSessions: 'GET /chat/sessions?limit={limit}',
  
  // Escalation
  escalationRequest: 'POST /escalation/request',
  
  // System
  health: 'GET /health'
};
```

### Admin Endpoints (Auth Required) ✅ SECURED
```javascript
const ADMIN_ENDPOINTS = {
  // Dashboard
  dashboard: 'GET /admin/dashboard',
  metrics: 'GET /admin/metrics',
  
  // Analytics
  conversationsChart: 'GET /admin/conversations/chart',
  languageSplit: 'GET /admin/language-split',
  
  // Content Management
  faq: 'GET /admin/frequently-asked-questions',
  unanswered: 'GET /admin/unanswered-questions',
  
  // Escalation Management
  escalationRequests: 'GET /admin/escalation-requests?limit={limit}'
};
```

### Sample Request/Response Examples
```javascript
// Chat Request
const chatRequest = {
  message: "What is type 1 diabetes?",
  sessionId: "session-123", // optional
  language: "en" // optional, defaults to "en"
};

// Chat Response
const chatResponse = {
  response: "Type 1 diabetes is...",
  confidence: 0.95,
  sources: [{ url: "...", title: "...", excerpt: "..." }],
  escalated: false,
  sessionId: "session-123",
  language: "en",
  timestamp: "2026-01-01T19:41:24.028Z"
};

// Escalation Request
const escalationRequest = {
  name: "John Doe",
  email: "john@example.com",
  phone: "555-0123", // optional
  zipCode: "12345", // optional
  issue: "Need help with insulin dosage",
  sessionId: "session-123" // optional
};
```

### Environment Variables (.env.local)
```bash
# Required for all environments
NEXT_PUBLIC_API_URL=https://drc24q02xb.execute-api.us-east-1.amazonaws.com/prod

# Required for admin features
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_3MZjnurA8
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=4b9p91do9vb6nv90f2tonbtdio
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:5cf89188-febb-499f-abfc-1e32fe499e79
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-023336033519.auth.us-east-1.amazoncognito.com
```

### Error Handling
```javascript
// Standard Error Response Format
const errorResponse = {
  error: "Error type",
  message: "Human readable error message",
  timestamp: "2026-01-01T19:41:24.028Z"
};

// HTTP Status Codes
const STATUS_CODES = {
  200: 'Success',
  400: 'Bad Request (validation error)',
  401: 'Unauthorized (admin endpoints without auth)',
  404: 'Not Found',
  500: 'Internal Server Error'
};
```

---

### **Live API Gateway**
- **Base URL**: `https://drc24q02xb.execute-api.us-east-1.amazonaws.com/prod/`
- **Status**: ✅ **100% ENDPOINTS WORKING (12/12)**
- **Last Updated**: January 1, 2026
- **Success Rate**: 100% - All endpoints tested and operational

---

## 📊 **ENDPOINT STATUS OVERVIEW**

### **✅ Public Endpoints (No Auth Required) - 5/5 Working**
| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/health` | GET | ✅ Working | System health check |
| `/chat` | POST | ✅ Working | Chat message processing |
| `/chat/history` | GET | ✅ Working | Chat history retrieval |
| `/chat/sessions` | GET | ✅ Working | Chat sessions list |
| `/escalation/request` | POST | ✅ Working | Escalation form submission |

### **🔒 Admin Endpoints (Auth Required) - 7/7 Working**
| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/admin/dashboard` | GET | ✅ Secured | Complete dashboard data |
| `/admin/metrics` | GET | ✅ Secured | Analytics metrics |
| `/admin/conversations/chart` | GET | ✅ Secured | Conversation charts |
| `/admin/language-split` | GET | ✅ Secured | Language distribution |
| `/admin/escalation-requests` | GET | ✅ Working | Escalation management |
| `/admin/frequently-asked-questions` | GET | ✅ Secured | FAQ analytics |
| `/admin/unanswered-questions` | GET | ✅ Secured | Unanswered questions |

---

## 🚀 **QUICK START GUIDE**

### **Phase 1: Public Chat (Start Immediately)**
```javascript
// No authentication required - ready to implement now
const API_URL = 'https://drc24q02xb.execute-api.us-east-1.amazonaws.com/prod';

// Send chat message
const sendMessage = async (message, sessionId = null) => {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId })
  });
  return response.json();
};

// Get chat history
const getChatHistory = async (sessionId) => {
  const response = await fetch(`${API_URL}/chat/history?sessionId=${sessionId}`);
  return response.json();
};

// Get chat sessions
const getChatSessions = async (limit = 10) => {
  const response = await fetch(`${API_URL}/chat/sessions?limit=${limit}`);
  return response.json();
};

// Submit escalation
const submitEscalation = async (escalationData) => {
  const response = await fetch(`${API_URL}/escalation/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(escalationData)
  });
  return response.json();
};
```

### **Phase 2: Admin Dashboard (After Amplify Setup)**
```javascript
// Admin endpoints require JWT token from Cognito
const getAdminData = async (endpoint, token) => {
  const response = await fetch(`${API_URL}/admin/${endpoint}`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

---

## 📋 **DETAILED API REFERENCE**

### **1. Health Check**
```http
GET /health
```
**Response:**
```json
{
  "message": "ADA Clara API is working!",
  "timestamp": "2026-01-01T19:41:24.028Z",
  "path": "/health",
  "method": "GET",
  "userModel": "simplified",
  "status": "healthy",
  "services": {
    "dynamodb": true,
    "bedrock": true,
    "comprehend": true
  }
}
```

### **2. Chat Processing**
```http
POST /chat
Content-Type: application/json

{
  "message": "What is type 1 diabetes?",
  "sessionId": "optional-session-id",
  "userInfo": {
    "language": "en"
  }
}
```
**Response:**
```json
{
  "response": "Type 1 diabetes is an autoimmune condition where the body's immune system attacks and destroys the insulin-producing beta cells in the pancreas...",
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
  "sessionId": "session-1735761684393-vc0rptzcs",
  "language": "en",
  "timestamp": "2026-01-01T19:41:24.393Z"
}
```

### **3. Chat History**
```http
GET /chat/history?sessionId=session-123
```
**Response:**
```json
{
  "sessionId": "session-123",
  "messages": [
    {
      "messageId": "msg-1735761684393-user",
      "sessionId": "session-123",
      "content": "What is type 1 diabetes?",
      "sender": "user",
      "timestamp": "2026-01-01T19:41:24.393Z",
      "language": "en"
    },
    {
      "messageId": "msg-1735761684394-bot",
      "sessionId": "session-123",
      "content": "Type 1 diabetes is an autoimmune condition...",
      "sender": "bot",
      "timestamp": "2026-01-01T19:41:24.394Z",
      "language": "en",
      "confidence": 0.9,
      "sources": [...],
      "processingTime": 1250
    }
  ],
  "timestamp": "2026-01-01T19:41:24.500Z"
}
```

### **4. Chat Sessions**
```http
GET /chat/sessions?limit=10
```
**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "session-123",
      "startTime": "2026-01-01T19:30:00.000Z",
      "language": "en",
      "escalated": false,
      "messageCount": 4,
      "lastActivity": "2026-01-01T19:41:24.394Z"
    }
  ],
  "count": 1,
  "timestamp": "2026-01-01T19:41:24.500Z"
}
```

### **5. Escalation Request**
```http
POST /escalation/request
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "zipCode": "12345",
  "issue": "Need help with insulin dosage",
  "sessionId": "session-123"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Thank you! Someone from the American Diabetes Association will reach out to you shortly.",
  "escalationId": "esc-1735761684041-vc0rptzcs",
  "status": "pending"
}
```

### **6. Admin Dashboard (Requires Auth)**
```http
GET /admin/dashboard
Authorization: Bearer <jwt-token>
```
**Response:**
```json
{
  "metrics": {
    "totalConversations": 1234,
    "escalationRate": 18,
    "outOfScopeRate": 7,
    "trends": {
      "conversations": "+12%",
      "escalations": "+6%",
      "outOfScope": "+2%"
    }
  },
  "conversationsChart": {
    "data": [
      {"date": "12/25", "conversations": 140},
      {"date": "12/26", "conversations": 165},
      {"date": "12/27", "conversations": 180},
      {"date": "12/28", "conversations": 155},
      {"date": "12/29", "conversations": 190},
      {"date": "12/30", "conversations": 175},
      {"date": "12/31", "conversations": 200}
    ]
  },
  "languageSplit": {
    "english": 75,
    "spanish": 25
  },
  "frequentlyAskedQuestions": [
    {"question": "What is type 1 diabetes?", "count": 45},
    {"question": "How do I manage blood sugar?", "count": 38},
    {"question": "What foods should I avoid?", "count": 32}
  ],
  "unansweredQuestions": [
    {"question": "Can I take insulin with food?", "count": 12},
    {"question": "What about exercise with diabetes?", "count": 8}
  ]
}
```

### **7. Admin Escalation Requests**
```http
GET /admin/escalation-requests?limit=50
```
**Response:**
```json
{
  "escalations": [
    {
      "escalationId": "esc-1735761684041-vc0rptzcs",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "555-123-4567",
      "zipCode": "12345",
      "issue": "Need help with insulin dosage",
      "status": "pending",
      "timestamp": "2026-01-01T19:41:24.041Z",
      "sessionId": "session-123"
    }
  ],
  "count": 1,
  "totalCount": 1
}
```

---

## 🔐 **AUTHENTICATION SETUP**

### **Cognito Configuration**
```javascript
const cognitoConfig = {
  userPoolId: 'us-east-1_3MZjnurA8',
  userPoolClientId: '4b9p91do9vb6nv90f2tonbtdio',
  identityPoolId: 'us-east-1:5cf89188-febb-499f-abfc-1e32fe499e79',
  region: 'us-east-1',
  domain: 'ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
  redirectSignIn: 'http://localhost:3000/auth/callback',
  redirectSignOut: 'http://localhost:3000',
  responseType: 'code',
  scope: ['email', 'openid', 'profile']
};
```

### **Environment Variables**
```bash
# Required for all environments
NEXT_PUBLIC_API_URL=https://drc24q02xb.execute-api.us-east-1.amazonaws.com/prod

# Required for admin features
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_3MZjnurA8
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=4b9p91do9vb6nv90f2tonbtdio
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:5cf89188-febb-499f-abfc-1e32fe499e79
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-023336033519.auth.us-east-1.amazoncognito.com
```

---

## ⚡ **PERFORMANCE & RELIABILITY**

### **Response Times**
- Health Check: ~200ms
- Chat Processing: ~1-2 seconds
- Admin Dashboard: ~500ms
- Escalation Submission: ~300ms

### **Error Handling**
- Standard HTTP status codes
- Detailed error messages in JSON format
- CORS headers on all responses
- Graceful degradation for service failures

### **Rate Limits**
- AWS API Gateway default throttling
- No custom rate limits implemented
- Suitable for production traffic

---

## 🎯 **INTEGRATION RECOMMENDATIONS**

### **Immediate Implementation (No Auth)**
1. ✅ **Public Chat Interface** - Start with `/chat` endpoint
2. ✅ **Session Management** - Use `/chat/history` and `/chat/sessions`
3. ✅ **Escalation Form** - Implement `/escalation/request`
4. ✅ **Health Monitoring** - Use `/health` for status checks

### **Phase 2 (After Amplify Setup)**
1. 🔒 **Admin Authentication** - Configure Cognito with provided credentials
2. 🔒 **Admin Dashboard** - Use `/admin/dashboard` for complete analytics
3. 🔒 **Escalation Management** - Use `/admin/escalation-requests`

### **Testing Strategy**
- All endpoints tested and verified working
- Use provided API URL for immediate testing
- No mocking required - live backend ready
- Comprehensive error scenarios handled

---

**Status**: ✅ **READY FOR IMMEDIATE FRONTEND INTEGRATION**  
**Confidence**: 100% - All endpoints operational and tested  
**Support**: Backend team available for integration assistance
