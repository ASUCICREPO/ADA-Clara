# ADA Clara Admin Dashboard API Specification

## Overview

This document details all the statistics and data points available through the ADA Clara Admin Analytics API. Use this to ensure your frontend dashboard can display all available metrics.

## Available Statistics

### 1. Overview Metrics (`GET /admin/dashboard`)

**High-level system statistics:**

```json
{
  "overview": {
    "totalSessions": 1250,           // Total chat sessions (all time or date range)
    "totalMessages": 8500,           // Total messages processed
    "totalEscalations": 45,          // Total escalations created
    "activeUsers": 375,              // Currently active users (estimated)
    "averageResponseTime": 850,      // Average response time in milliseconds
    "systemUptime": 99.9             // System uptime percentage
  }
}
```

### 2. Chat Metrics (`GET /admin/dashboard`)

**Detailed chat and conversation analytics:**

```json
{
  "chatMetrics": {
    "messagesPerHour": [
      { "hour": "00:00", "count": 5 },
      { "hour": "01:00", "count": 3 },
      // ... 24 hours of data
    ],
    "languageDistribution": {
      "en": 7200,                    // English messages
      "es": 1300                     // Spanish messages
    },
    "averageSessionLength": 8.5,     // Average session duration in minutes
    "topQuestions": [
      { "question": "What is type 1 diabetes?", "count": 45 },
      { "question": "How to manage blood sugar?", "count": 38 },
      { "question": "Diabetes diet recommendations", "count": 32 },
      { "question": "Insulin dosage questions", "count": 28 },
      { "question": "Exercise with diabetes", "count": 24 }
    ]
  }
}
```

### 3. Escalation Metrics (`GET /admin/dashboard`)

**Escalation tracking and analysis:**

```json
{
  "escalationMetrics": {
    "escalationRate": 3.6,           // Percentage of sessions that escalate
    "escalationsByPriority": {
      "low": 20,
      "medium": 15,
      "high": 8,
      "urgent": 2
    },
    "escalationsByReason": {
      "Low confidence response": 25,
      "Explicit user request": 12,
      "Emergency keywords": 5,
      "Repeated questions": 8,
      "Long conversation": 15,
      "No relevant sources": 10
    },
    "averageResolutionTime": 2.5,    // Hours to resolve escalations
    "escalationTrends": [
      { "date": "2024-01-15", "count": 3 },
      { "date": "2024-01-16", "count": 5 },
      // ... daily escalation counts
    ]
  }
}
```

### 4. Performance Metrics (`GET /admin/dashboard`)

**System performance and technical metrics:**

```json
{
  "performanceMetrics": {
    "responseTimeP50": 850,          // 50th percentile response time (ms)
    "responseTimeP95": 2100,         // 95th percentile response time (ms)
    "errorRate": 0.5,                // Error rate percentage
    "throughput": 125,               // Requests per minute
    "lambdaMetrics": {
      "chatProcessor": {
        "invocations": 1250,
        "errors": 6,
        "duration": 1200             // Average duration in ms
      },
      "escalationProcessor": {
        "invocations": 45,
        "errors": 0,
        "duration": 800
      }
    }
  }
}
```

### 5. System Health (`GET /admin/health`)

**Infrastructure health monitoring:**

```json
{
  "systemHealth": {
    "dynamodbHealth": true,          // DynamoDB connectivity
    "s3Health": true,                // S3 bucket accessibility
    "sesHealth": true,               // SES email service status
    "overallHealth": "healthy",      // "healthy" | "degraded" | "unhealthy"
    "lastHealthCheck": "2024-01-15T10:30:00Z"
  }
}
```

### 6. Real-time Metrics (`GET /admin/realtime`)

**Live system metrics for real-time updates:**

```json
{
  "activeConnections": 15,           // Current active chat connections
  "messagesLastHour": 42,           // Messages in the last hour
  "escalationsToday": 3,            // Escalations created today
  "systemLoad": 0.25,               // System load (0.0 to 1.0)
  "responseTime": 950               // Current average response time (ms)
}
```

### 7. Chat History (`GET /admin/chat-history`)

**Detailed session history with filtering:**

```json
{
  "sessions": [
    {
      "sessionId": "session-123",
      "userId": "user-456",
      "startTime": "2024-01-15T09:00:00Z",
      "messageCount": 12,
      "language": "en",
      "escalated": false,
      "lastActivity": "2024-01-15T09:15:00Z"
    }
  ],
  "total": 150,                     // Total sessions matching filters
  "hasMore": true                   // Whether more results are available
}
```

## Advanced Analytics Available

### Time-based Analytics
- **Hourly Distribution**: Message counts by hour (0-23)
- **Daily Trends**: Metrics aggregated by day
- **Weekly Patterns**: Week-over-week comparisons
- **Monthly Summaries**: Long-term trend analysis

### User Analytics
- **Language Preferences**: EN vs ES usage patterns
- **Session Patterns**: Length, frequency, engagement
- **Geographic Distribution**: Based on zip codes (if provided)
- **Return User Analysis**: New vs returning user patterns

### Content Analytics
- **Popular Topics**: Most asked questions and topics
- **Knowledge Gaps**: Questions with low confidence responses
- **Content Performance**: Which knowledge base articles are most helpful
- **Search Patterns**: Common query patterns and themes

### Operational Analytics
- **Response Quality**: Confidence score distributions
- **System Performance**: Response times, error rates, throughput
- **Escalation Analysis**: Patterns in escalation triggers
- **Resource Utilization**: Lambda performance, database usage

## API Query Parameters

### Dashboard Endpoint
```
GET /admin/dashboard?startDate=2024-01-01&endDate=2024-01-31&granularity=daily
```

**Parameters:**
- `startDate`: Start date (YYYY-MM-DD format)
- `endDate`: End date (YYYY-MM-DD format)  
- `granularity`: Data granularity (hourly, daily, weekly, monthly)

### Chat History Endpoint
```
GET /admin/chat-history?limit=50&offset=0&language=en&escalated=false
```

**Parameters:**
- `limit`: Number of results (1-100, default: 50)
- `offset`: Results to skip for pagination (default: 0)
- `startDate`: Filter sessions from date
- `endDate`: Filter sessions to date
- `userId`: Filter by specific user
- `language`: Filter by language (en, es)
- `escalated`: Filter by escalation status (true, false)

## Dashboard Widget Recommendations

Based on the available data, here are recommended dashboard widgets:

### 1. Overview Cards
- Total Sessions (with % change)
- Total Messages (with % change)
- Escalation Rate (with trend indicator)
- System Uptime (with health status)

### 2. Charts and Graphs
- **Line Chart**: Messages per hour (24-hour view)
- **Pie Chart**: Language distribution
- **Bar Chart**: Escalations by priority
- **Area Chart**: Daily escalation trends
- **Donut Chart**: Escalation reasons breakdown

### 3. Performance Widgets
- **Gauge**: Current system load
- **Metric Cards**: P50/P95 response times
- **Status Indicators**: Service health (DynamoDB, S3, SES)
- **Timeline**: Recent escalations with priority

### 4. Data Tables
- **Recent Sessions**: Latest chat sessions with details
- **Top Questions**: Most frequently asked questions
- **Escalation Queue**: Pending escalations with priority
- **System Alerts**: Health issues and warnings

### 5. Real-time Updates
- **Live Counter**: Active connections
- **Recent Activity**: Last hour message count
- **Alert Banner**: System health issues
- **Notification Badge**: New escalations

## Sample Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Overview Cards                                              │
│ [Sessions] [Messages] [Escalations] [Uptime]               │
├─────────────────────────────────────────────────────────────┤
│ Real-time Metrics          │ System Health                  │
│ [Active: 15]              │ [DynamoDB: ✅]                │
│ [Last Hour: 42]           │ [S3: ✅]                      │
│ [Today Escalations: 3]    │ [SES: ✅]                     │
├─────────────────────────────────────────────────────────────┤
│ Messages per Hour Chart                                     │
│ [24-hour line chart showing message distribution]           │
├─────────────────────────────────────────────────────────────┤
│ Language Distribution     │ Escalation Breakdown           │
│ [EN: 85% | ES: 15%]      │ [Priority pie chart]           │
├─────────────────────────────────────────────────────────────┤
│ Recent Chat Sessions                                        │
│ [Paginated table with session details]                     │
├─────────────────────────────────────────────────────────────┤
│ Top Questions            │ Escalation Trends               │
│ [List of popular topics] │ [7-day trend chart]             │
└─────────────────────────────────────────────────────────────┘
```

## Integration Notes

### Data Refresh Rates
- **Real-time metrics**: Update every 30 seconds
- **Dashboard metrics**: Update every 5 minutes
- **Chat history**: Update every 1 minute
- **System health**: Update every 30 seconds

### Error Handling
All endpoints return consistent error format:
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### CORS Configuration
- Configured for cross-origin requests
- Supports all standard HTTP methods
- Includes proper preflight handling

### Rate Limiting
- 100 requests per second per IP
- 200 burst capacity
- Throttling applied at API Gateway level

## Next Steps

1. **Deploy API Gateway**: Run `npm run deploy-admin-analytics`
2. **Test Endpoints**: Use the deployed URL with your frontend
3. **Customize Metrics**: Add any additional statistics your UI needs
4. **Optimize Performance**: Implement caching based on usage patterns

Please share your Figma design or screenshot so I can ensure we're providing all the specific metrics your dashboard requires!