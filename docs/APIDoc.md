# ADA Clara APIs

This document provides comprehensive API documentation for ADA Clara.

---

## Overview

The ADA Clara API provides endpoints for chat interactions, admin analytics, escalation management, and knowledge base queries. The API is built on AWS API Gateway with Lambda backend functions, supporting CORS for web applications and Cognito authentication for admin endpoints.

---

## Base URL

```
https://[API_ID].execute-api.[REGION].amazonaws.com/prod/
```

**Example:**
```
https://abc123xyz.execute-api.us-west-2.amazonaws.com/prod/
```

> **Note**: Replace `[API_ID]` and `[REGION]` with your actual API Gateway endpoint after deployment. The stage is always `prod`.

---

## Authentication

Public endpoints (chat, health) do not require authentication. Admin endpoints require Cognito authentication via API Gateway authorizer.

### Headers Required
| Header | Description | Required |
|--------|-------------|----------|
| `Authorization` | Cognito JWT token for admin endpoints | Yes (admin only) |
| `Content-Type` | `application/json` | Yes (POST requests) |
| `Origin` | Origin domain for CORS | Yes (browser requests) |

---

## 1) Chat Endpoints

Endpoints for user chat interactions, message processing, and conversation management.

---

#### POST /chat — Send Chat Message

- **Purpose**: Process a user's chat message and return an AI-generated response with source citations.

- **Authentication**: Not required

- **Request body**:
```json
{
  "message": "string - The user's question or message",
  "sessionId": "string (optional) - Existing session ID, or new session will be created",
  "language": "string (optional) - Language code (en, es, etc.), auto-detected if not provided"
}
```

- **Example request**:
```json
{
  "message": "What are the symptoms of type 2 diabetes?",
  "sessionId": "session-1234567890-abc"
}
```

- **Response**:
```json
{
  "message": "string - AI-generated response text",
  "sources": [
    {
      "url": "string - Source URL from diabetes.org",
      "title": "string - Source page title",
      "excerpt": "string - Relevant excerpt from source"
    }
  ],
  "sessionId": "string - Session ID for this conversation",
  "escalated": "boolean - Whether the conversation was escalated"
}
```

- **Example response**:
```json
{
  "message": "Type 2 diabetes symptoms include increased thirst, frequent urination, fatigue, and blurred vision...",
  "sources": [
    {
      "url": "https://diabetes.org/about-diabetes/type-2",
      "title": "Type 2 Diabetes",
      "excerpt": "Common symptoms of type 2 diabetes include..."
    }
  ],
  "sessionId": "session-1234567890-abc",
  "escalated": false
}
```

- **Status codes**:
  - `200 OK` - Message processed successfully
  - `400 Bad Request` - Invalid request body or missing required fields
  - `500 Internal Server Error` - Server error processing the message

---

#### GET /chat/history — Get Chat History

- **Purpose**: Retrieve chat history for a specific session.

- **Authentication**: Not required

- **Query parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | The session ID to retrieve history for |

- **Example request**:
```
GET /chat/history?sessionId=session-1234567890-abc
```

- **Response**:
```json
{
  "sessionId": "string",
  "messages": [
    {
      "messageId": "string",
      "content": "string",
      "sender": "user" | "bot",
      "timestamp": "string (ISO 8601)",
      "language": "string"
    }
  ]
}
```

---

#### GET /chat/sessions — List Chat Sessions

- **Purpose**: Retrieve a list of chat sessions (admin use).

- **Authentication**: Not required (but may be restricted in production)

- **Query parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of sessions to return (default: 50) |

- **Response**:
```json
{
  "sessions": [
    {
      "sessionId": "string",
      "startTime": "string (ISO 8601)",
      "language": "string",
      "messageCount": "number",
      "lastActivity": "string (ISO 8601)"
    }
  ]
}
```

---

#### GET /health — Health Check

- **Purpose**: Check API health and service status.

- **Authentication**: Not required

- **Response**:
```json
{
  "message": "ADA Clara API is working!",
  "timestamp": "string (ISO 8601)",
  "status": "healthy" | "unhealthy",
  "services": {
    "dynamodb": "healthy" | "unhealthy",
    "bedrock": "healthy" | "unhealthy"
  }
}
```

---

## 2) Escalation Endpoints

Endpoints for managing escalation requests when users need to speak with a healthcare professional.

---

#### POST /escalation/request — Submit Escalation Request

- **Purpose**: Submit an escalation request form to contact a healthcare professional.

- **Authentication**: Not required

- **Request body**:
```json
{
  "name": "string - User's name",
  "email": "string - User's email address",
  "phone": "string (optional) - User's phone number",
  "question": "string - The question or concern",
  "sessionId": "string (optional) - Associated chat session ID",
  "escalationType": "submit" | "talk_to_person"
}
```

- **Example request**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "question": "I need help managing my blood sugar levels",
  "sessionId": "session-1234567890-abc",
  "escalationType": "submit"
}
```

- **Response**:
```json
{
  "message": "Escalation request submitted successfully",
  "requestId": "string - Unique request ID",
  "timestamp": "string (ISO 8601)"
}
```

- **Status codes**:
  - `200 OK` - Request submitted successfully
  - `400 Bad Request` - Invalid request body
  - `500 Internal Server Error` - Server error

---

#### GET /escalation/requests — Get Escalation Requests

- **Purpose**: Retrieve escalation requests (admin use).

- **Authentication**: Cognito required

- **Query parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of requests to return (default: 50) |
| `status` | string | No | Filter by status (pending, resolved, etc.) |

- **Response**:
```json
{
  "requests": [
    {
      "requestId": "string",
      "name": "string",
      "email": "string",
      "question": "string",
      "timestamp": "string (ISO 8601)",
      "status": "string"
    }
  ]
}
```

---

## 3) Admin Endpoints

Endpoints for admin dashboard analytics and metrics. All admin endpoints require Cognito authentication.

---

#### GET /admin/dashboard — Get Dashboard Data

- **Purpose**: Retrieve comprehensive dashboard data including all metrics, charts, and analytics.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "metrics": {
    "totalConversations": "number",
    "totalMessages": "number",
    "escalationRate": "number (percentage)",
    "outOfScopeRate": "number (percentage)"
  },
  "conversationsChart": {
    "labels": ["string - Date labels"],
    "data": ["number - Conversation counts"]
  },
  "languageSplit": {
    "en": "number (percentage)",
    "es": "number (percentage)"
  },
  "frequentlyAskedQuestions": [
    {
      "question": "string",
      "count": "number",
      "category": "string"
    }
  ],
  "unansweredQuestions": [
    {
      "question": "string",
      "unansweredRate": "number (percentage)",
      "category": "string"
    }
  ]
}
```

---

#### GET /admin/metrics — Get Metrics Only

- **Purpose**: Retrieve only the key metrics (conversations, messages, escalation rate, out-of-scope rate).

- **Authentication**: Cognito required

- **Response**:
```json
{
  "totalConversations": "number",
  "totalMessages": "number",
  "escalationRate": "number (percentage)",
  "outOfScopeRate": "number (percentage)"
}
```

---

#### GET /admin/conversations/chart — Get Conversations Chart Data

- **Purpose**: Retrieve time-series data for conversations chart.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "labels": ["string - Date labels"],
  "data": ["number - Conversation counts"]
}
```

---

#### GET /admin/language-split — Get Language Distribution

- **Purpose**: Retrieve language distribution statistics.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "en": "number (percentage)",
  "es": "number (percentage)",
  "other": "number (percentage)"
}
```

---

#### GET /admin/frequently-asked-questions — Get Frequently Asked Questions

- **Purpose**: Retrieve top 6 most frequently asked questions.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "questions": [
    {
      "question": "string",
      "count": "number",
      "category": "string"
    }
  ]
}
```

---

#### GET /admin/unanswered-questions — Get Unanswered Questions

- **Purpose**: Retrieve top 6 unanswered questions (questions with high escalation rate).

- **Authentication**: Cognito required

- **Response**:
```json
{
  "questions": [
    {
      "question": "string",
      "unansweredRate": "number (percentage)",
      "category": "string"
    }
  ]
}
```

---

#### GET /admin/escalation-requests — Get Escalation Requests

- **Purpose**: Retrieve escalation requests for admin review.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "requests": [
    {
      "requestId": "string",
      "name": "string",
      "email": "string",
      "question": "string",
      "timestamp": "string (ISO 8601)",
      "status": "string"
    }
  ]
}
```

---

## Response Format

All API responses follow this general structure:

### Success Response
```json
{
  "message": "string - Response message",
  "data": {
    // Response data fields
  }
}
```

### Error Response
```json
{
  "error": "string - Error type",
  "message": "string - Detailed error message"
}
```

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| `400` | Bad Request | Invalid request body, missing required fields, or invalid parameter values |
| `401` | Unauthorized | Missing or invalid authentication token (for admin endpoints) |
| `403` | Forbidden | Valid token but insufficient permissions |
| `404` | Not Found | Endpoint not found or resource does not exist |
| `429` | Too Many Requests | Rate limit exceeded (1000 requests/second default) |
| `500` | Internal Server Error | Server error processing the request |
| `503` | Service Unavailable | One or more backend services are unavailable |

---

## Rate Limiting

API Gateway enforces rate limiting to prevent abuse:

- **Requests per second**: 1000 (throttling rate limit)
- **Burst limit**: 2000 requests
- **Per-endpoint limits**: Applied uniformly across all endpoints

If rate limits are exceeded, the API returns a `429 Too Many Requests` status code.

---

## SDK / Client Examples

### JavaScript/TypeScript
```typescript
// Send a chat message
const response = await fetch('https://[API_ID].execute-api.[REGION].amazonaws.com/prod/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'What are the symptoms of type 2 diabetes?',
    sessionId: 'session-1234567890-abc'
  })
});

const data = await response.json();
console.log(data.message); // AI response
console.log(data.sources); // Source citations

// Get admin metrics (requires authentication)
const adminResponse = await fetch('https://[API_ID].execute-api.[REGION].amazonaws.com/prod/admin/metrics', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${cognitoToken}`,
    'Content-Type': 'application/json'
  }
});

const metrics = await adminResponse.json();
```

### Python
```python
import requests

# Send a chat message
response = requests.post(
    'https://[API_ID].execute-api.[REGION].amazonaws.com/prod/chat',
    headers={
        'Content-Type': 'application/json'
    },
    json={
        'message': 'What are the symptoms of type 2 diabetes?',
        'sessionId': 'session-1234567890-abc'
    }
)

data = response.json()
print(data['message'])  # AI response
print(data['sources'])   # Source citations

# Get admin metrics (requires authentication)
admin_response = requests.get(
    'https://[API_ID].execute-api.[REGION].amazonaws.com/prod/admin/metrics',
    headers={
        'Authorization': f'Bearer {cognito_token}',
        'Content-Type': 'application/json'
    }
)

metrics = admin_response.json()
```

### cURL
```bash
# Send a chat message
curl -X POST 'https://[API_ID].execute-api.[REGION].amazonaws.com/prod/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "What are the symptoms of type 2 diabetes?",
    "sessionId": "session-1234567890-abc"
  }'

# Get admin metrics (requires authentication)
curl -X GET 'https://[API_ID].execute-api.[REGION].amazonaws.com/prod/admin/metrics' \
  -H 'Authorization: Bearer [COGNITO_TOKEN]' \
  -H 'Content-Type: application/json'
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| [INSERT_VERSION] | [INSERT_DATE] | [INSERT_CHANGES] |

---

## Support

For API-related issues or questions:
- [INSERT_SUPPORT_CHANNEL]
- [INSERT_DOCUMENTATION_LINK]

