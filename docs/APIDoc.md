# ADA Clara APIs

This document provides comprehensive API documentation for ADA Clara.

---

## Overview

The ADA Clara API provides endpoints for chat interactions, admin analytics, escalation management, content scraping, and knowledge base management. The API is built on AWS API Gateway (HTTP API) with Lambda backend functions, supporting CORS for web applications and Cognito authentication for admin endpoints.

---

## Base URL

```
https://[API_ID].execute-api.[REGION].amazonaws.com/
```

**Example:**
```
https://mbx87iv2z8.execute-api.us-west-2.amazonaws.com/
```

> **Note**: Replace `[API_ID]` and `[REGION]` with your actual API Gateway endpoint after deployment. This API uses the default stage (no `/prod/` prefix).

---

## Authentication

Public endpoints (chat, escalation, config, scraper) do not require authentication. Admin endpoints require Cognito authentication via API Gateway authorizer.

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
  "sessionId": "string - Session ID for this conversation",
  "sources": [
    {
      "url": "string - Source URL from diabetes.org",
      "title": "string - Source page title",
      "excerpt": "string - Relevant excerpt from source",
      "relevanceScore": "number - Relevance score (0-1)"
    }
  ],
  "escalated": "boolean - Whether the conversation was escalated",
  "confidence": "number - Confidence score (0-1)"
}
```

- **Example response**:
```json
{
  "message": "Type 2 diabetes symptoms include increased thirst, frequent urination, fatigue, and blurred vision...",
  "sessionId": "session-1234567890-abc",
  "sources": [
    {
      "url": "https://diabetes.org/about-diabetes/type-2",
      "title": "Type 2 Diabetes",
      "excerpt": "Common symptoms of type 2 diabetes include...",
      "relevanceScore": 0.85
    }
  ],
  "escalated": false,
  "confidence": 0.85
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

#### GET /config — Get Configuration

- **Purpose**: Retrieve system configuration and settings.

- **Authentication**: Not required

- **Response**:
```json
{
  "confidenceThreshold": "number - Confidence threshold for escalation",
  "supportedLanguages": ["string - Language codes"],
  "apiVersion": "string"
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

## 3) Content Management Endpoints

Endpoints for managing web scraping, content discovery, and knowledge base updates.

---

#### POST /scraper — Trigger Content Scraping

- **Purpose**: Manually trigger content scraping for specific URLs.

- **Authentication**: Not required (should be restricted in production)

- **Request body**:
```json
{
  "url": "string - URL to scrape",
  "depth": "number (optional) - Crawl depth"
}
```

- **Response**:
```json
{
  "message": "Scraping job started",
  "jobId": "string"
}
```

---

#### GET /scraper/status — Get Scraper Status

- **Purpose**: Check the status of scraping jobs.

- **Authentication**: Not required (should be restricted in production)

- **Query parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | No | Specific job ID to check status |

- **Response**:
```json
{
  "status": "running" | "completed" | "failed",
  "jobId": "string",
  "progress": "number (percentage)"
}
```

---

#### POST /scraper/discover — Discover Domains

- **Purpose**: Discover and validate new domains for content scraping.

- **Authentication**: Not required (should be restricted in production)

- **Request body**:
```json
{
  "seedUrl": "string - Starting URL for domain discovery"
}
```

- **Response**:
```json
{
  "message": "Domain discovery started",
  "discoveredDomains": ["string - List of discovered domains"]
}
```

---

#### GET /scraper/processor — Get Processor Status

- **Purpose**: Check content processor status and statistics.

- **Authentication**: Not required (should be restricted in production)

- **Response**:
```json
{
  "status": "idle" | "processing",
  "processedCount": "number",
  "lastProcessed": "string (ISO 8601)"
}
```

---

## 4) Admin Endpoints

Endpoints for admin dashboard analytics and metrics. All admin endpoints require Cognito authentication.

---

#### GET /admin — Get Admin Home Data

- **Purpose**: Retrieve admin home page data (redirects or provides summary).

- **Authentication**: Cognito required

- **Response**:
```json
{
  "message": "Admin home",
  "links": {
    "dashboard": "/admin/dashboard",
    "escalations": "/admin/escalation-requests",
    "metrics": "/admin/metrics"
  }
}
```

---

#### GET /admin/dashboard — Get Dashboard Data

- **Purpose**: Retrieve comprehensive dashboard data including all metrics, charts, and analytics.

- **Authentication**: Cognito required

- **Response**:
```json
{
  "metrics": {
    "totalConversations": "number",
    "escalationRate": "number (percentage)",
    "outOfScopeRate": "number (percentage)",
    "trends": {
      "conversations": "string (e.g., +12%)",
      "escalations": "string",
      "outOfScope": "string"
    }
  },
  "conversationsChart": {
    "data": [
      {
        "date": "string (YYYY-MM-DD)",
        "conversations": "number"
      }
    ]
  },
  "languageSplit": {
    "english": "number (percentage)",
    "spanish": "number (percentage)"
  },
  "lastUpdated": "string (ISO 8601)"
}
```

> **Note**: This endpoint combines data from `/admin/metrics`, `/admin/conversations/chart`, and `/admin/language-split`.

---

#### GET /admin/metrics — Get Metrics Only

- **Purpose**: Retrieve only the key metrics (conversations, escalation rate, out-of-scope rate, and trends).

- **Authentication**: Cognito required

- **Response**:
```json
{
  "totalConversations": "number",
  "escalationRate": "number (percentage) - User-submitted escalation forms",
  "outOfScopeRate": "number (percentage) - Questions auto-escalated due to low confidence",
  "trends": {
    "conversations": "string (e.g., +12%, -5%)",
    "escalations": "string (week-over-week trend)",
    "outOfScope": "string (week-over-week trend)"
  }
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
  "english": "number (percentage)",
  "spanish": "number (percentage)"
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

