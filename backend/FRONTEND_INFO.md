# ADA Clara Frontend Integration 

### **Live API Gateway**
- **Base URL**: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/`
- **Status**: ✅ Deployed and tested with simplified user model
- **Health Check**: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/health`
- **Public Chat**: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat` ✅ **NO AUTH REQUIRED**
- **Chat History**: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat/history` ✅ **NO AUTH REQUIRED**

### **Admin Authentication System** ✅ 
- **User Pool ID**: `us-east-1_hChjb1rUB`
- **Client ID**: `3f8vld6mnr1nsfjci1b61okc46`
- **Identity Pool ID**: `us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c`
- **Domain**: `https://ada-clara-023336033519.auth.us-east-1.amazoncognito.com`
- **Simple Auth Lambda**: Admin-only JWT validation deployed

### **User Model**
- **👤 Public Users**: Chat without authentication
- **👨‍💼 Admin Users**: Dashboard access with Cognito authentication

### **Backend Infrastructure**
- ✅ **DynamoDB**: 13 tables deployed (chat sessions, user data, analytics, etc.)
- ✅ **S3 Vectors**: Content storage and vector search configured
- ✅ **API Gateway**: Single unified endpoint for all services
- ✅ **CORS**: Configured for frontend integration

---

## 🔄 **Integration Timeline - SIMPLIFIED**

### **Phase 1: Public Chat Integration (Start Now)**
- **Duration**: 1 day
- **Tasks**:
  - Implement public chat component (no authentication required)
  - Test chat functionality without login
  - Set up session management for public users

### **Phase 2: Admin Authentication (This Week)**
- **Duration**: 1-2 days  
- **Tasks**:
  - Configure AWS Amplify for admin routes only
  - Implement admin login and dashboard
  - Test admin JWT token validation

### **Phase 3: Polish & Production (Next Week)**
- **Duration**: 2-3 days
- **Tasks**:
  - Error handling refinement
  - Performance optimization
  - Security testing
  - Production deployment

---

1. **Implement Public Chat (No Authentication)**:
   ```javascript
   // Public Chat - No Auth Required
   const sendMessage = async (message, sessionId) => {
     const response = await fetch(`${API_URL}/chat`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ message, sessionId })
     });
     return response.json();
   };
   ```

2. **Admin Authentication**:
   ```javascript
   // Admin Cognito Configuration 
   const adminAmplifyConfig = {
     Auth: {
       region: 'us-east-1',
       userPoolId: 'us-east-1_hChjb1rUB',
       userPoolWebClientId: '3f8vld6mnr1nsfjci1b61okc46',
       identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
       oauth: {
         domain: 'ada-clara-023336033519.auth.us-east-1.amazoncognito.com',
         scope: ['email', 'openid', 'profile'],
         redirectSignIn: 'http://localhost:3000/admin/callback',
         redirectSignOut: 'http://localhost:3000/admin',
         responseType: 'code'
       }
     }
   };
   ```

3. **Environment Variables**:
   ```bash
   NEXT_PUBLIC_API_URL=https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod
   NEXT_PUBLIC_USER_MODEL=simplified
   
   # Admin Only
   NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_hChjb1rUB
   NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=3f8vld6mnr1nsfjci1b61okc46
   NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c
   NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-023336033519.auth.us-east-1.amazoncognito.com
   ```
---

## 🛠 **Technical Details**

### **API Response Format**
```json
{
  "message": "ADA Clara API is working!",
  "timestamp": "2025-12-30T20:08:06.940Z",
  "path": "/health",
  "method": "GET",
  "userModel": "simplified"
}
```

### **Public Chat Response**
```json
{
  "response": "Type 1 diabetes is an autoimmune condition...",
  "confidence": 0.95,
  "sources": [
    {
      "title": "Understanding Type 1 Diabetes",
      "url": "https://diabetes.org/about-diabetes/type-1"
    }
  ],
  "sessionId": "public-session-123",
  "timestamp": "2025-12-30T20:08:06.940Z"
}
```

### **Error Handling**
- Standard HTTP status codes
- JSON error responses
- CORS headers included
- No authentication required for public endpoints

### **Security**
- HTTPS only
- CORS configured
- Admin authentication via Cognito JWT
- Public endpoints require no authentication

---
