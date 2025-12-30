# Enhanced Admin Dashboard API Guide

## Overview

The Enhanced Admin Dashboard API provides comprehensive analytics and monitoring capabilities for the ADA Clara chatbot system. This API builds upon the foundation established in Tasks 1 and 2, utilizing the enhanced DynamoDB schema and analytics service to deliver detailed insights into conversation patterns, question analysis, and system performance.

## Task 3 Implementation Summary

### What Was Implemented

✅ **Enhanced Lambda Function**
- Integrated the new `AnalyticsService` from Task 2
- Added new API endpoint handlers for conversation and question analytics
- Maintained backward compatibility with existing endpoints
- Added comprehensive error handling and validation

✅ **New API Endpoints**
- `GET /admin/conversations` - Conversation analytics with filtering
- `GET /admin/conversations/{id}` - Detailed conversation information
- `GET /admin/questions` - FAQ and unanswered question analysis
- Enhanced existing endpoints with new data sources

✅ **CDK Infrastructure Updates**
- Added new API Gateway routes for enhanced endpoints
- Updated Lambda environment variables for new DynamoDB tables
- Maintained existing CloudWatch monitoring and alarms

✅ **Testing and Validation**
- Created comprehensive test suite for all new endpoints
- Added deployment scripts with validation
- Updated package.json with new npm scripts

## API Endpoints

### 1. Enhanced Dashboard Metrics
```
GET /admin/dashboard
```

**Description**: Comprehensive dashboard metrics combining conversation, question, escalation, and performance analytics.

**Query Parameters**:
- `startDate` (optional): Start date for analytics (YYYY-MM-DD)
- `endDate` (optional): End date for analytics (YYYY-MM-DD)
- `type` (optional): Filter by type ('chat', 'escalation', 'performance', 'user')

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "conversationMetrics": {
      "totalConversations": 1250,
      "averageLength": 8.5,
      "languageBreakdown": { "en": 850, "es": 400 },
      "outcomeDistribution": {
        "resolved": 1000,
        "escalated": 150,
        "abandoned": 100
      }
    },
    "questionMetrics": {
      "totalQuestions": 2500,
      "answeredQuestions": 2200,
      "unansweredQuestions": 300,
      "answerRate": 88.0,
      "topCategories": [
        { "category": "diabetes-management", "count": 800 },
        { "category": "medication", "count": 600 }
      ]
    },
    "escalationMetrics": {
      "escalationRate": 12.0,
      "averageResolutionTime": 2.5,
      "escalationsByPriority": { "high": 50, "medium": 75, "low": 25 }
    },
    "realTimeMetrics": {
      "activeConnections": 15,
      "messagesLastHour": 85,
      "systemLoad": 0.25
    },
    "performanceMetrics": {
      "responseTimeP50": 850,
      "responseTimeP95": 2100,
      "errorRate": 0.5
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2. Conversation Analytics
```
GET /admin/conversations
```

**Description**: Detailed conversation analytics with filtering and pagination support.

**Query Parameters**:
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `language` (optional): Language filter ('en', 'es', 'all')
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "analytics": {
      "totalConversations": 1250,
      "averageMessagesPerConversation": 6.8,
      "averageDuration": 8.5,
      "languageBreakdown": { "en": 850, "es": 400 },
      "outcomeDistribution": {
        "resolved": 1000,
        "escalated": 150,
        "abandoned": 100
      },
      "dailyTrends": [
        { "date": "2024-01-01", "count": 45 },
        { "date": "2024-01-02", "count": 52 }
      ]
    },
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 1250
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. Conversation Details
```
GET /admin/conversations/{conversationId}
```

**Description**: Detailed information for a specific conversation including full message history.

**Path Parameters**:
- `conversationId`: Unique conversation identifier

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv-123456",
    "userId": "user-789",
    "startTime": "2024-01-15T09:00:00Z",
    "endTime": "2024-01-15T09:15:00Z",
    "messageCount": 8,
    "language": "en",
    "outcome": "resolved",
    "escalated": false,
    "confidenceScores": {
      "average": 0.85,
      "minimum": 0.72,
      "maximum": 0.95
    },
    "messages": [
      {
        "messageId": "msg-001",
        "timestamp": "2024-01-15T09:00:00Z",
        "sender": "user",
        "content": "What is type 1 diabetes?",
        "confidenceScore": null
      },
      {
        "messageId": "msg-002",
        "timestamp": "2024-01-15T09:00:15Z",
        "sender": "assistant",
        "content": "Type 1 diabetes is an autoimmune condition...",
        "confidenceScore": 0.92
      }
    ],
    "metadata": {
      "userAgent": "Mozilla/5.0...",
      "sessionDuration": 900,
      "questionsAsked": 3,
      "escalationTriggers": []
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 4. Question Analysis
```
GET /admin/questions
```

**Description**: FAQ analysis and unanswered question identification for knowledge base improvement.

**Query Parameters**:
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `category` (optional): Question category filter
- `limit` (optional): Number of results (default: 20)
- `includeUnanswered` (optional): Include unanswered questions analysis ('true'/'false')

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "faq": {
      "totalQuestions": 2500,
      "uniqueQuestions": 450,
      "topQuestions": [
        {
          "question": "What is type 1 diabetes?",
          "normalizedQuestion": "what is type 1 diabetes",
          "count": 45,
          "category": "diabetes-basics",
          "averageConfidence": 0.92
        }
      ],
      "categoryBreakdown": {
        "diabetes-basics": 800,
        "medication": 600,
        "lifestyle": 500
      }
    },
    "unanswered": {
      "totalUnanswered": 300,
      "unansweredRate": 12.0,
      "topUnansweredQuestions": [
        {
          "question": "Can I eat sugar-free candy with diabetes?",
          "count": 15,
          "category": "nutrition",
          "averageConfidence": 0.45
        }
      ],
      "knowledgeGaps": [
        {
          "category": "nutrition",
          "gapCount": 85,
          "improvementPriority": "high"
        }
      ]
    },
    "summary": {
      "totalQuestions": 2500,
      "answeredQuestions": 2200,
      "unansweredQuestions": 300,
      "answerRate": 88.0
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 5. Enhanced Real-time Metrics
```
GET /admin/realtime
```

**Description**: Live system metrics with enhanced conversation and question data.

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "activeConnections": 15,
    "messagesLastHour": 85,
    "escalationsToday": 3,
    "systemLoad": 0.25,
    "responseTime": 1200,
    "conversationMetrics": {
      "activeConversations": 12,
      "averageSessionLength": 8.5,
      "newConversationsLastHour": 18
    },
    "questionMetrics": {
      "questionsLastHour": 45,
      "averageConfidence": 0.87,
      "lowConfidenceCount": 5
    },
    "systemHealth": {
      "dynamodbHealth": true,
      "s3Health": true,
      "sesHealth": true,
      "overallHealth": "healthy"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 6. System Health (Existing)
```
GET /admin/health
```

**Description**: System health status and service availability.

### 7. Chat History (Legacy)
```
GET /admin/chat-history
```

**Description**: Legacy endpoint maintained for backward compatibility. Use `/admin/conversations` for new implementations.

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `404`: Not Found (conversation/resource not found)
- `500`: Internal Server Error

## Authentication

The API uses AWS API Gateway authentication. Ensure proper IAM permissions are configured for accessing the admin endpoints.

## Rate Limiting

- Rate limit: 100 requests per minute
- Burst limit: 200 requests
- Throttling is handled at the API Gateway level

## Deployment

### Prerequisites
1. Enhanced DynamoDB tables (Task 1) must be deployed
2. Enhanced analytics service (Task 2) must be implemented
3. AWS CDK and credentials must be configured

### Deploy Enhanced API
```bash
# Deploy the enhanced admin analytics stack
npm run deploy-enhanced-admin-api

# Test the deployed endpoints
npm run test-enhanced-api
```

### Rollback
```bash
# Rollback deployment if needed
npx ts-node scripts/deploy-enhanced-admin-api.ts rollback
```

## Monitoring

### CloudWatch Metrics
- API Gateway request count and latency
- Lambda function invocations and errors
- DynamoDB read/write capacity utilization

### CloudWatch Alarms
- High error rate (>5 errors in 5 minutes)
- High latency (>5 seconds)
- Lambda function errors

### Dashboard
Access the CloudWatch dashboard at:
```
https://{region}.console.aws.amazon.com/cloudwatch/home?region={region}#dashboards:name=ada-clara-admin-analytics-{account}
```

## Integration Examples

### Frontend Integration
```javascript
// Enhanced dashboard data
const dashboardData = await fetch('/admin/dashboard?startDate=2024-01-01&endDate=2024-01-07')
  .then(response => response.json());

// Conversation analytics with pagination
const conversations = await fetch('/admin/conversations?limit=50&offset=0&language=en')
  .then(response => response.json());

// Specific conversation details
const conversationDetails = await fetch('/admin/conversations/conv-123456')
  .then(response => response.json());

// Question analysis
const questionAnalysis = await fetch('/admin/questions?includeUnanswered=true&category=diabetes-basics')
  .then(response => response.json());
```

### Real-time Updates
```javascript
// Poll real-time metrics every 30 seconds
setInterval(async () => {
  const realTimeData = await fetch('/admin/realtime')
    .then(response => response.json());
  
  updateDashboard(realTimeData.data);
}, 30000);
```

## Performance Considerations

### Caching
- Dashboard metrics are cached for 5 minutes
- Real-time metrics are cached for 30 seconds
- Conversation details are cached for 1 hour

### Optimization Tips
1. Use date range filters to limit data processing
2. Implement pagination for large result sets
3. Cache frequently accessed data on the frontend
4. Use the most specific endpoint for your needs

## Troubleshooting

### Common Issues

**1. "Table not found" errors**
- Ensure enhanced DynamoDB tables are deployed (Task 1)
- Check table names in environment variables

**2. "Analytics service unavailable"**
- Verify enhanced analytics service is deployed (Task 2)
- Check Lambda function logs for initialization errors

**3. High latency**
- Check DynamoDB capacity settings
- Review CloudWatch metrics for bottlenecks
- Consider implementing additional caching

**4. Authentication errors**
- Verify API Gateway authentication configuration
- Check IAM permissions for Lambda execution role

### Debugging
1. Check CloudWatch logs for Lambda function errors
2. Monitor API Gateway access logs
3. Review DynamoDB metrics for throttling
4. Use the health endpoint to verify system status

## Migration from Legacy API

### Backward Compatibility
- Existing endpoints continue to work unchanged
- New fields are added to existing responses without breaking changes
- Legacy `/admin/chat-history` endpoint is maintained

### Migration Steps
1. Update frontend to use new endpoints gradually
2. Test new functionality in development environment
3. Monitor performance after migration
4. Deprecate legacy endpoints after full migration

## Future Enhancements

### Planned Features
- Real-time WebSocket updates for live dashboard
- Advanced filtering with multiple criteria
- Data export functionality
- Custom dashboard configurations
- Automated alerting for anomalies

### API Versioning
Future API versions will be implemented using URL versioning:
- Current: `/admin/dashboard`
- Future: `/v2/admin/dashboard`

## Support

For issues or questions regarding the Enhanced Admin Dashboard API:
1. Check CloudWatch logs for error details
2. Review this documentation for usage examples
3. Test endpoints using the provided test scripts
4. Monitor system health using the `/admin/health` endpoint

---

**Implementation Status**: ✅ Task 3 Complete
**Dependencies**: Tasks 1 (Enhanced DynamoDB) and 2 (Enhanced Analytics Service)
**Next Steps**: Deploy to production and integrate with frontend dashboard