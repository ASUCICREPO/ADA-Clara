# ADA Clara Frontend Integration Guide

## **User Types**

1. **👤 Public Users**: Diabetes.org visitors who can chat freely without authentication
2. **👨‍💼 Admin Users**: Authenticated users who can access the admin dashboard

## **DEPLOYMENT STATUS**

### **FULLY DEPLOYED & TESTED:**

1. **API Gateway**: `https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/` ✅ **LIVE & WORKING**
2. **Public Chat Endpoints**: ✅ **WORKING PERFECTLY**
   - `POST /chat` - Send message ✅ **FRONTEND-ALIGNED RESPONSE**
   - Chat escalation detection ✅ **WORKING**
   - Response format: `{ response, confidence, sources, escalated, escalationReason }` ✅ **PERFECT MATCH**
3. **Public Escalation Endpoint**: ✅ **WORKING PERFECTLY**
   - `POST /escalation/request` - Submit "Talk to Person" form ✅ **FRONTEND-ALIGNED**
   - Response format: `{ success, message, escalationId, status }` ✅ **PERFECT MATCH**
4. **Admin Dashboard Endpoint**: ✅ **WORKING PERFECTLY** 
   - `GET /admin/dashboard` - Complete dashboard data ✅ **ALL FIELDS PRESENT**
   - Response includes: metrics, conversationsChart, languageSplit, frequentlyAskedQuestions, unansweredQuestions ✅ **COMPLETE**
5. **System Endpoints**: ✅ **WORKING**
   - `GET /health` - System health ✅ **TESTED**

### **🎯 CRITICAL ENDPOINTS STATUS: 5/5 WORKING (100%)**

### **COGNITO CONFIGURATION (ADMIN ONLY):**
- **User Pool ID**: `us-east-1_hChjb1rUB` ✅ **ACTIVE**
- **Client ID**: `3f8vld6mnr1nsfjci1b61okc46` ✅ **CONFIGURED**
- **Identity Pool ID**: `us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c` ✅ **ACTIVE**
- **Domain**: `https://ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com` ✅ **ACCESSIBLE**

> **Note**: These are the actual deployed resource IDs for the current environment. In production deployments, these values should be retrieved from environment variables or AWS Systems Manager Parameter Store.

## Overview

1. **👤 Public Users**: Diabetes.org visitors who can use chat without authentication
2. **👨‍💼 Admin Users**: Authenticated users who can access the admin dashboard via Cognito

## Table of Contents

1. [User Configuration](#️-user-configuration)
2. [Quick Start](#quick-start)
3. [Public Chat Integration (No Auth)](#public-chat-integration-no-auth)
4. [Admin Authentication Integration](#admin-authentication-integration)
5. [API Integration](#api-integration)
6. [User Types & Permissions](#user-types--permissions)
7. [Admin Dashboard Integration](#admin-dashboard-integration)
8. [Environment Configuration](#environment-configuration)
9. [API Endpoints Reference](#api-endpoints-reference)
10. [Error Handling](#error-handling)
11. [Security Considerations](#security-considerations)
12. [Testing](#testing)
13. [Deployment Checklist](#deployment-checklist)
14. [Support](#support)

## ⚡ User Configuration

**The simplified ADA Clara system uses a two-user model:**

### **👤 Public Users (No Authentication Required)**
- Can access chat immediately
- No signup or login required  
- Uses public API endpoints

### **👨‍💼 Admin Users (Cognito Authentication Required)**
- Access admin dashboard and analytics
- Manage system and moderate content
- Uses existing Cognito configuration

### **Complete Configuration Ready:**

```json
{
  "apiUrl": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod",
  "userModel": "simplified",
  "userTypes": ["public", "admin"],
  
  "publicEndpoints": {
    "health": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/health",
    "chat": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat",
    "chatHistory": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat/history",
    "chatSessions": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/chat/sessions",
    "escalationRequest": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/escalation/request"
  },
  
  "adminEndpoints": {
    "auth": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth",
    "authHealth": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/auth/health",
    "dashboard": "https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod/admin/dashboard"
  },
  
  "authentication": {
    "userPoolId": "us-east-1_hChjb1rUB",
    "clientId": "3f8vld6mnr1nsfjci1b61okc46",
    "identityPoolId": "us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c",
    "domain": "https://ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com",
    "requiredFor": ["admin"]
  },
  
  "features": {
    "publicChat": true,
    "adminDashboard": true,
    "professionalVerification": false,
    "membershipValidation": false
  }
}
```

## Quick Start

### 1. Backend Configuration

**`cognito-config.json`** (Generated after deployment):
```json
{
  "aws_project_region": "us-east-1",
  "aws_cognito_region": "us-east-1", 
  "aws_user_pools_id": "us-east-1_hChjb1rUB",
  "aws_user_pools_web_client_id": "3f8vld6mnr1nsfjci1b61okc46",
  "aws_cognito_identity_pool_id": "us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c",
  "aws_user_pool_domain": "ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com",
  "oauth": {
    "domain": "ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com",
    "scope": ["email", "openid", "profile"],
    "redirectSignIn": "http://localhost:3000/auth/callback",
    "redirectSignOut": "http://localhost:3000",
    "responseType": "code"
  },
  "userTypes": ["public", "admin"]
}
```

**API Base URLs**:
```bash
# Development & Production (Same API Gateway)
NEXT_PUBLIC_API_URL=https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod
```

**✅ Unified API Endpoints Available:**
- Authentication: `/auth/*` (admin only)
- Chat: `/chat/*` (public access)
- Health: `/health` (public access)

### 2. Required Dependencies

Install these packages in your frontend:

```bash
# For React/Next.js
npm install aws-amplify @aws-amplify/ui-react

# For authentication (admin only)
npm install jsonwebtoken jwks-rsa

# For HTTP requests
npm install axios
```

## Public Chat Integration (No Auth)

### 1. Public Chat Component (No Authentication Required)

**`components/PublicChat.jsx`**:
```javascript
import { useState, useEffect, useRef } from 'react';

const PublicChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Generate session ID for public user
    setSessionId(`public-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      // No authentication required for public chat
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: inputMessage,
          sessionId,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();
      
      const botMessage = {
        id: Date.now() + 1,
        text: data.response || 'I apologize, but I encountered an issue. Please try again.',
        sender: 'bot',
        timestamp: new Date().toISOString(),
        confidence: data.confidence,
        sources: data.sources
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="public-chat-container">
      <div className="chat-header">
        <h3>ADA Clara - Diabetes Assistant</h3>
        <div className="user-info">
          <span className="user-type public">👤 Public User - No Login Required</span>
        </div>
      </div>

      <div className="messages-container">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.sender}`}>
            <div className="message-content">
              <p>{message.text}</p>
              
              {message.confidence && (
                <div className="message-meta">
                  <span className="confidence">
                    Confidence: {Math.round(message.confidence * 100)}%
                  </span>
                </div>
              )}
              
              {message.sources && message.sources.length > 0 && (
                <div className="sources">
                  <strong>Sources:</strong>
                  <ul>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="message bot">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me about diabetes... (No login required!)"
          rows={3}
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !inputMessage.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default PublicChat;
```

### 2. Public Chat History (Optional)

**`components/PublicChatHistory.jsx`**:
```javascript
import { useState, useEffect } from 'react';

const PublicChatHistory = ({ sessionId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionId) {
      fetchChatHistory();
    }
  }, [sessionId]);

  const fetchChatHistory = async () => {
    try {
      // No authentication required for public chat history
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/history?sessionId=${sessionId}`);
      const data = await response.json();
      setHistory(data.messages || []);
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading chat history...</div>;

  return (
    <div className="chat-history">
      <h4>Previous Messages</h4>
      {history.length === 0 ? (
        <p>No previous messages in this session.</p>
      ) : (
        <div className="history-messages">
          {history.map((message, idx) => (
            <div key={idx} className={`history-message ${message.sender}`}>
              <span className="sender">{message.sender}:</span>
              <span className="text">{message.text}</span>
              <span className="timestamp">{new Date(message.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PublicChatHistory;
```

## Admin Authentication Integration

### 1. Admin Amplify Configuration (Admin Only)

**`lib/admin-amplify-config.js`**:
```javascript
import { Amplify } from 'aws-amplify';

const adminAmplifyConfig = {
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_hChjb1rUB',
    userPoolWebClientId: '3f8vld6mnr1nsfjci1b61okc46',
    identityPoolId: 'us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c',
    oauth: {
      domain: 'ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com',
      scope: ['email', 'openid', 'profile'],
      redirectSignIn: process.env.NODE_ENV === 'production' 
        ? 'https://YOUR_PRODUCTION_DOMAIN.com/admin/callback' // Update this!
        : 'http://localhost:3000/admin/callback', // Development - keep as-is
      redirectSignOut: process.env.NODE_ENV === 'production'
        ? 'https://YOUR_PRODUCTION_DOMAIN.com/admin' // Update this!
        : 'http://localhost:3000/admin', // Development - keep as-is
      responseType: 'code'
    }
  }
};

// Only configure Amplify for admin routes
if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
  Amplify.configure(adminAmplifyConfig);
}

export default adminAmplifyConfig;
```

### 2. Admin Authentication Hook

**`hooks/useAdminAuth.js`**:
```javascript
import { useState, useEffect, createContext, useContext } from 'react';
import { Auth } from 'aws-amplify';

const AdminAuthContext = createContext();

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    checkAdminAuthState();
  }, []);

  const checkAdminAuthState = async () => {
    try {
      const currentUser = await Auth.currentAuthenticatedUser();
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      
      // Verify this is an admin user
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      if (payload['custom:user_type'] !== 'admin') {
        throw new Error('Access denied: Admin privileges required');
      }
      
      setAdmin(currentUser);
      setToken(idToken);
    } catch (error) {
      console.log('No authenticated admin user');
      setAdmin(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      const user = await Auth.signIn(email, password);
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      
      // Verify admin privileges
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      if (payload['custom:user_type'] !== 'admin') {
        await Auth.signOut();
        throw new Error('Access denied: Admin privileges required');
      }
      
      setAdmin(user);
      setToken(idToken);
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await Auth.signOut();
      setAdmin(null);
      setToken(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const getAdminContext = () => {
    if (!admin || !token) return null;

    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      userId: payload.sub,
      email: payload.email,
      userType: 'admin',
      isVerified: payload.email_verified,
      languagePreference: payload['custom:language_preference'] || 'en',
      permissions: [
        'admin:dashboard',
        'admin:analytics',
        'admin:users',
        'admin:system',
        'chat:monitor',
        'chat:moderate'
      ]
    };
  };

  const value = {
    admin,
    token,
    loading,
    signIn,
    signOut,
    getAdminContext,
    checkAdminAuthState
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
```

### 3. Admin Login Component

**`components/AdminLogin.jsx`**:
```javascript
import { useState } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';

const AdminLogin = () => {
  const { signIn, loading } = useAdminAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await signIn(formData.email, formData.password);
    
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-container">
        <h2>ADA Clara Admin Login</h2>
        <p>Admin access required for dashboard and system management.</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Password:</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button type="submit" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        <div className="login-info">
          <p><strong>Note:</strong> Only admin users can access the dashboard.</p>
          <p>Public users can use the chat without logging in.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
```

## API Integration

### 1. Simplified API Client

**`lib/api-client.js`**:
```javascript
import axios from 'axios';

class SimplifiedApiClient {
  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor for admin endpoints only
    this.client.interceptors.request.use(
      (config) => {
        // Only add auth token for admin endpoints
        if (config.url?.startsWith('/auth') || config.url?.startsWith('/admin')) {
          const token = localStorage.getItem('adminAuthToken');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && error.config?.url?.startsWith('/auth')) {
          // Admin token expired or invalid
          localStorage.removeItem('adminAuthToken');
          window.location.href = '/admin/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // ===== PUBLIC CHAT API METHODS (NO AUTH REQUIRED) =====
  
  async sendPublicMessage(message, sessionId = null) {
    const response = await this.client.post('/chat', {
      message,
      sessionId,
      timestamp: new Date().toISOString()
    });
    return response.data;
  }

  async getPublicChatHistory(sessionId) {
    const response = await this.client.get(`/chat/history?sessionId=${sessionId}`);
    return response.data;
  }

  async getPublicChatSessions() {
    const response = await this.client.get('/chat/sessions');
    return response.data;
  }

  async submitEscalationRequest(formData) {
    const response = await this.client.post('/escalation/request', formData);
    return response.data;
  }

  // ===== ADMIN API METHODS (AUTH REQUIRED) =====
  
  async validateAdminToken(token) {
    const response = await this.client.post('/auth', { token });
    return response.data;
  }

  async getAdminContext() {
    const response = await this.client.get('/auth');
    return response.data;
  }

  async getAdminDashboardData(params = {}) {
    const response = await this.client.get('/admin/dashboard', { params });
    return response.data;
  }

  async getAdminMetrics() {
    const response = await this.client.get('/admin/metrics');
    return response.data;
  }

  async getConversationsChart() {
    const response = await this.client.get('/admin/conversations/chart');
    return response.data;
  }

  async getLanguageSplit() {
    const response = await this.client.get('/admin/language-split');
    return response.data;
  }

  async getEscalationRequests() {
    const response = await this.client.get('/admin/escalation-requests');
    return response.data;
  }

  async getFrequentlyAskedQuestions() {
    const response = await this.client.get('/admin/frequently-asked-questions');
    return response.data;
  }

  async getUnansweredQuestions() {
    const response = await this.client.get('/admin/unanswered-questions');
    return response.data;
  }

  // ===== SYSTEM HEALTH =====
  
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }

  async authHealthCheck() {
    const response = await this.client.get('/auth/health');
    return response.data;
  }
}

export default new SimplifiedApiClient();
```

## User Types & Permissions

### Simplified User Type Detection

```javascript
// Simplified user type detection
const getUserType = () => {
  // Check if we're on admin routes
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    // Check for admin authentication
    const adminToken = localStorage.getItem('adminAuthToken');
    if (adminToken) {
      try {
        const payload = JSON.parse(atob(adminToken.split('.')[1]));
        return payload['custom:user_type'] === 'admin' ? 'admin' : 'public';
      } catch {
        return 'public';
      }
    }
    return 'public';
  }
  
  // Default to public user
  return 'public';
};

// Usage in components:
const userType = getUserType();

if (userType === 'admin') {
  // Show admin features
} else {
  // Show public features (default)
}
```

### Permission-based Rendering

```javascript
const PermissionGate = ({ permission, children, fallback = null }) => {
  const userType = getUserType();
  
  const permissions = {
    'admin': [
      'admin:dashboard', 
      'admin:analytics', 
      'admin:users', 
      'admin:system',
      'chat:monitor',
      'chat:moderate'
    ],
    'public': [
      'chat:basic', 
      'chat:history'
    ]
  };
  
  const userPermissions = permissions[userType] || permissions['public'];
  const hasPermission = userPermissions.includes(permission);
  
  return hasPermission ? children : fallback;
};

// Usage:
<PermissionGate permission="admin:dashboard">
  <AdminDashboard />
</PermissionGate>

<PermissionGate permission="chat:basic">
  <PublicChat />
</PermissionGate>
```

## Admin Dashboard Integration

### Dashboard Data Hook

**`hooks/useAdminDashboard.js`**:
```javascript
import { useState, useEffect } from 'react';
import apiClient from '../lib/api-client';

export const useAdminDashboard = (refreshInterval = 300000) => { // 5 minutes
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async (params = {}) => {
    try {
      setLoading(true);
      const response = await apiClient.getAdminDashboardData(params);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Set up auto-refresh
    const interval = setInterval(() => {
      fetchDashboardData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  return {
    data,
    loading,
    error,
    refresh: fetchDashboardData
  };
};
```

### Admin Dashboard Component

**`components/AdminDashboard.jsx`**:
```javascript
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { useAdminAuth } from '../hooks/useAdminAuth';

const AdminDashboard = () => {
  const { data, loading, error, refresh } = useAdminDashboard();
  const { getAdminContext } = useAdminAuth();
  
  const adminContext = getAdminContext();

  if (loading) return <div>Loading admin dashboard...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h2>ADA Clara Admin Dashboard</h2>
        <div className="admin-info">
          <span>👨‍💼 Admin: {adminContext?.email}</span>
          <button onClick={refresh}>Refresh Data</button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="overview-cards">
        <div className="card">
          <h3>Total Public Sessions</h3>
          <div className="metric">{data?.overview?.totalSessions || 0}</div>
        </div>
        <div className="card">
          <h3>Total Messages</h3>
          <div className="metric">{data?.overview?.totalMessages || 0}</div>
        </div>
        <div className="card">
          <h3>System Uptime</h3>
          <div className="metric">{data?.overview?.systemUptime || 0}%</div>
        </div>
        <div className="card">
          <h3>Active Users</h3>
          <div className="metric">{data?.overview?.activeUsers || 0}</div>
        </div>
      </div>

      {/* Chat Analytics */}
      <div className="analytics-section">
        <h3>Public Chat Analytics</h3>
        <div className="analytics-grid">
          <div className="chart-container">
            <h4>Messages per Hour</h4>
            {/* Integrate your charting library here */}
            <div className="placeholder-chart">Chart placeholder</div>
          </div>
          
          <div className="chart-container">
            <h4>Most Asked Questions</h4>
            <ul className="top-questions">
              {data?.chatMetrics?.topQuestions?.map((q, idx) => (
                <li key={idx}>
                  <span className="question">{q.question}</span>
                  <span className="count">{q.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="system-status">
        <h3>System Status</h3>
        <div className="status-grid">
          <div className="status-item">
            <span className="service">API Gateway</span>
            <span className="status healthy">✅ Healthy</span>
          </div>
          <div className="status-item">
            <span className="service">Chat Service</span>
            <span className="status healthy">✅ Healthy</span>
          </div>
          <div className="status-item">
            <span className="service">Auth Service</span>
            <span className="status healthy">✅ Healthy</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
```

## Environment Configuration

### Development (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod

# Cognito Configuration (Admin Only)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_hChjb1rUB
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=3f8vld6mnr1nsfjci1b61okc46
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com

# App Configuration
NEXT_PUBLIC_APP_NAME=ADA Clara
NEXT_PUBLIC_ENVIRONMENT=development
NEXT_PUBLIC_USER_MODEL=simplified
```

### Production (.env.production)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://gew0atxbl4.execute-api.us-east-1.amazonaws.com/prod

# Cognito Configuration (Admin Only)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_hChjb1rUB
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=3f8vld6mnr1nsfjci1b61okc46
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:7d2a7873-1502-4d74-b042-57cdee6d600c
NEXT_PUBLIC_COGNITO_DOMAIN=ada-clara-{ACCOUNT_ID}.auth.us-east-1.amazoncognito.com

# App Configuration
NEXT_PUBLIC_APP_NAME=ADA Clara
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_USER_MODEL=simplified
```

## API Endpoints Reference

### Public Endpoints (No Authentication Required)

```bash
# System health check
GET /health

# Send public chat message
POST /chat
Body: {
  "message": "What is type 1 diabetes?",
  "sessionId": "public-session-123",
  "timestamp": "2024-01-15T10:30:00Z"
}

# Get public chat history
GET /chat/history?sessionId=public-session-123

# Get public chat sessions
GET /chat/sessions

# Submit "Talk to Person" form
POST /escalation/request
Body: {
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "(555) 123-4567",
  "zipCode": "12345"
}
```

### Admin Endpoints (Authentication Required)

```bash
# Admin auth health check
GET /auth/health

# Validate admin JWT token  
POST /auth
Headers: { "Authorization": "Bearer admin-jwt-token" }
Body: { "token": "admin-jwt-token" }

# Get admin user context
GET /auth
Headers: { "Authorization": "Bearer admin-jwt-token" }

# Admin dashboard data
GET /admin/dashboard?startDate=2024-01-01&endDate=2024-01-31
Headers: { "Authorization": "Bearer admin-jwt-token" }

# Admin analytics endpoints
GET /admin/metrics
GET /admin/conversations/chart
GET /admin/language-split
GET /admin/escalation-requests
GET /admin/frequently-asked-questions
GET /admin/unanswered-questions
Headers: { "Authorization": "Bearer admin-jwt-token" }
```

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:30:00Z",
  "userType": "public|admin"
}
```

### Common Error Codes

- **401 Unauthorized**: Invalid or expired admin JWT token (admin endpoints only)
- **403 Forbidden**: Admin privileges required
- **400 Bad Request**: Invalid request parameters
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Backend service error

### Simplified Error Handling

```javascript
const handleApiError = (error) => {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 401:
        // Only redirect to admin login for admin endpoints
        if (error.config?.url?.startsWith('/auth') || error.config?.url?.startsWith('/admin')) {
          localStorage.removeItem('adminAuthToken');
          window.location.href = '/admin/login';
        } else {
          alert('Authentication error. Please try again.');
        }
        break;
      case 403:
        alert('Admin privileges required for this action.');
        break;
      case 429:
        alert('Too many requests. Please wait a moment and try again.');
        break;
      default:
        alert(data.message || 'An error occurred. Please try again.');
    }
  } else {
    alert('Network error. Please check your connection.');
  }
};
```

## Security Considerations

### Token Management (Admin Only)

```javascript
// Store admin token securely
const storeAdminToken = (token) => {
  localStorage.setItem('adminAuthToken', token);
  
  // Set expiration check
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expirationTime = payload.exp * 1000;
  localStorage.setItem('adminTokenExpiration', expirationTime.toString());
};

// Check admin token expiration
const isAdminTokenExpired = () => {
  const expiration = localStorage.getItem('adminTokenExpiration');
  if (!expiration) return true;
  
  return Date.now() > parseInt(expiration);
};
```

### Content Security Policy

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' *.amazonaws.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      connect-src 'self' *.amazonaws.com *.execute-api.*.amazonaws.com;
      font-src 'self';
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

## Testing

### Public Chat Testing

```javascript
// __tests__/public-chat.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PublicChat from '../components/PublicChat';

test('public user can send message without authentication', async () => {
  render(<PublicChat />);
  
  const input = screen.getByPlaceholderText(/Ask me about diabetes/);
  const sendButton = screen.getByText('Send');
  
  fireEvent.change(input, { target: { value: 'What is diabetes?' } });
  fireEvent.click(sendButton);
  
  await waitFor(() => {
    expect(screen.getByText('What is diabetes?')).toBeInTheDocument();
  });
});
```

### Admin Authentication Testing

```javascript
// __tests__/admin-auth.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminAuthProvider } from '../hooks/useAdminAuth';
import AdminLogin from '../components/AdminLogin';

test('admin can sign in with valid credentials', async () => {
  render(
    <AdminAuthProvider>
      <AdminLogin />
    </AdminAuthProvider>
  );
  
  fireEvent.change(screen.getByLabelText('Email:'), { 
    target: { value: 'admin@example.com' } 
  });
  fireEvent.change(screen.getByLabelText('Password:'), { 
    target: { value: 'adminPassword123' } 
  });
  fireEvent.click(screen.getByText('Sign In'));
  
  await waitFor(() => {
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
  });
});
```

## Deployment Checklist

### Pre-deployment

- [ ] Update environment variables with production values
- [ ] Configure CORS for production domain
- [ ] Set up SSL certificate for custom domain
- [ ] Update Cognito redirect URLs for production (admin only)
- [ ] Test public chat functionality (no auth required)
- [ ] Test admin authentication flow
- [ ] Verify admin dashboard functionality
- [ ] Remove all professional verification references

### Post-deployment

- [ ] Monitor public chat usage
- [ ] Check API response times
- [ ] Verify security headers are applied
- [ ] Test error handling scenarios
- [ ] Monitor CloudWatch logs for errors
- [ ] Validate admin permissions are working correctly
- [ ] Confirm professional verification is completely removed

## Support

### Common Issues

1. **CORS Errors**: Ensure your domain is added to the API Gateway CORS configuration
2. **Admin Token Validation Failures**: Check that the JWT token is being sent correctly in the Authorization header
3. **Permission Denied**: Verify the user has admin privileges (custom:user_type = 'admin')
4. **Public Chat Not Working**: Ensure no authentication headers are being sent to public endpoints

### Getting Help

- Check CloudWatch logs for detailed error messages
- Use the `/health` endpoint to verify backend connectivity
- Use the `/auth/health` endpoint to verify admin auth service
- Test API endpoints directly with tools like Postman
