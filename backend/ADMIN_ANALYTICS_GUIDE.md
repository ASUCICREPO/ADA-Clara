# ADA Clara Admin Analytics Guide

## Overview

The ADA Clara Admin Analytics system provides comprehensive monitoring, reporting, and business intelligence for the chatbot platform. It includes real-time metrics, historical analytics, chat session management, and system health monitoring.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│   API Gateway    │───▶│  Admin Lambda   │
│   Dashboard     │    │   (REST API)     │    │  (Analytics)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   CloudWatch     │    │   DynamoDB      │
                       │   Dashboard      │    │   (Analytics)   │
                       └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  EventBridge    │
                                                │  (Aggregation)  │
                                                └─────────────────┘
```

## Components

### 1. Admin Analytics Lambda
- **Location**: `backend/lambda/admin-analytics/index.ts`
- **Purpose**: Processes analytics queries and provides dashboard data
- **API Endpoints**:
  - `GET /admin/dashboard` - Comprehensive dashboard metrics
  - `GET /admin/realtime` - Real-time system metrics
  - `GET /admin/chat-history` - Chat session history with filtering
  - `GET /admin/health` - System health status

### 2. Analytics Service
- **Location**: `backend/src/services/analytics-service.ts`
- **Purpose**: Aggregates and processes analytics data
- **Features**:
  - Multi-dimensional analytics aggregation
  - Real-time metrics generation
  - Performance analytics calculation
  - User behavior analysis

### 3. CDK Infrastructure
- **Location**: `backend/lib/admin-analytics-stack.ts`
- **Components**:
  - API Gateway with CORS configuration
  - Lambda function with proper IAM permissions
  - CloudWatch dashboard and alarms
  - EventBridge rules for automated aggregation

## API Endpoints

### Dashboard Metrics (`GET /admin/dashboard`)

Returns comprehensive dashboard data including overview, chat metrics, escalation metrics, performance metrics, and system health.

**Query Parameters:**
- `startDate` (optional): Start date in YYYY-MM-DD format (default: 7 days ago)
- `endDate` (optional): End date in YYYY-MM-DD format (default: today)
- `granularity` (optional): Data granularity - hourly, daily, weekly, monthly (default: daily)

**Response Format:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalSessions": 1250,
      "totalMessages": 8500,
      "totalEscalations": 45,
      "activeUsers": 375,
      "averageResponseTime": 850,
      "systemUptime": 99.9
    },
    "chatMetrics": {
      "messagesPerHour": [
        { "hour": "00:00", "count": 5 },
        { "hour": "01:00", "count": 3 }
      ],
      "languageDistribution": { "en": 7200, "es": 1300 },
      "averageSessionLength": 8.5,
      "topQuestions": [
        { "question": "What is type 1 diabetes?", "count": 45 }
      ]
    },
    "escalationMetrics": {
      "escalationRate": 3.6,
      "escalationsByPriority": { "low": 20, "medium": 15, "high": 8, "urgent": 2 },
      "escalationsByReason": { "Low confidence": 25, "Explicit request": 12 },
      "averageResolutionTime": 2.5,
      "escalationTrends": [
        { "date": "2024-01-15", "count": 3 }
      ]
    },
    "performanceMetrics": {
      "responseTimeP50": 850,
      "responseTimeP95": 2100,
      "errorRate": 0.5,
      "throughput": 125,
      "lambdaMetrics": {
        "chatProcessor": { "invocations": 1250, "errors": 6, "duration": 1200 },
        "escalationProcessor": { "invocations": 45, "errors": 0, "duration": 800 }
      }
    },
    "systemHealth": {
      "dynamodbHealth": true,
      "s3Health": true,
      "sesHealth": true,
      "overallHealth": "healthy",
      "lastHealthCheck": "2024-01-15T10:30:00Z"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Real-time Metrics (`GET /admin/realtime`)

Returns current system metrics for live dashboard updates.

**Response Format:**
```json
{
  "success": true,
  "data": {
    "activeConnections": 15,
    "messagesLastHour": 42,
    "escalationsToday": 3,
    "systemLoad": 0.25,
    "responseTime": 950
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Chat History (`GET /admin/chat-history`)

Returns paginated chat session history with filtering options.

**Query Parameters:**
- `limit` (optional): Number of sessions to return (default: 50, max: 100)
- `offset` (optional): Number of sessions to skip (default: 0)
- `startDate` (optional): Filter sessions from this date
- `endDate` (optional): Filter sessions to this date
- `userId` (optional): Filter by specific user ID
- `language` (optional): Filter by language (en, es)
- `escalated` (optional): Filter by escalation status (true, false)

**Response Format:**
```json
{
  "success": true,
  "data": {
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
    "total": 150,
    "hasMore": true
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### System Health (`GET /admin/health`)

Returns current system health status.

**Response Format:**
```json
{
  "success": true,
  "data": {
    "dynamodbHealth": true,
    "s3Health": true,
    "sesHealth": true,
    "overallHealth": "healthy",
    "lastHealthCheck": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Analytics Data Model

### Analytics Recording

The system automatically records analytics events throughout the application:

```typescript
// Chat analytics
await dataService.recordAnalytics('chat', 'message_processed', 1, {
  language: 'en',
  confidence: 0.85,
  responseTime: 850
});

// Escalation analytics
await dataService.recordAnalytics('escalation', 'created', 1, {
  priority: 'medium',
  reason: 'Low confidence response',
  sessionId: 'session-123'
});

// Performance analytics
await dataService.recordAnalytics('performance', 'response_time', 1200, {
  endpoint: 'chat_processor',
  functionName: 'ada-clara-chat-processor'
});

// User analytics
await dataService.recordAnalytics('user', 'active_users', 1, {
  userId: 'user-456',
  sessionId: 'session-123'
});
```

### Data Aggregation

Analytics data is aggregated using the `AnalyticsService`:

- **Hourly Aggregation**: EventBridge triggers aggregation every hour
- **Daily Summaries**: Calculated from hourly data
- **Weekly/Monthly Reports**: Aggregated from daily summaries
- **Real-time Metrics**: Generated on-demand from recent data

## Deployment

### 1. Prerequisites

```bash
# Install dependencies
npm install

# Ensure DynamoDB tables are deployed
npm run create-dynamodb-tables
```

### 2. Deploy Infrastructure

```bash
# Deploy admin analytics stack
npm run deploy-admin-analytics

# Verify deployment
aws cloudformation describe-stacks --stack-name AdaClaraAdminAnalytics
```

### 3. Test System

```bash
# Run comprehensive tests
npm run test-admin-analytics

# Test with data generation
npm run test-admin-analytics -- --generate-data

# Test specific API URL
npm run test-admin-analytics -- --api-url=https://your-api-gateway-url.amazonaws.com/prod
```

## Monitoring and Alerting

### CloudWatch Dashboard

Access the admin analytics dashboard:
```
AWS Console → CloudWatch → Dashboards → ada-clara-admin-analytics-{account}
```

**Dashboard Widgets:**
- API Gateway performance metrics
- Lambda function performance
- Request counts and error rates
- Response time percentiles

### Alarms

**Configured Alarms:**
- **High Error Rate**: >5 server errors in 5 minutes
- **High Latency**: >5 seconds average response time
- **Lambda Errors**: >3 Lambda errors in 5 minutes

### Custom Metrics

**Business Metrics:**
- Chat session count
- Message processing rate
- Escalation rate
- User engagement metrics

**Technical Metrics:**
- API response times
- Lambda performance
- Database query performance
- System health status

## Integration with Frontend

### API Base URL

The frontend team should use the API Gateway endpoint:
```
Base URL: https://{api-gateway-id}.execute-api.{region}.amazonaws.com/prod
```

### Authentication

Currently, the API uses API Gateway without authentication. For production, consider:
- AWS Cognito integration
- API Key authentication
- IAM-based access control

### CORS Configuration

CORS is configured to allow all origins for development. Update for production:
```typescript
allowOrigins: ['https://your-admin-dashboard.com']
```

### Error Handling

All API responses follow this format:
```json
{
  "success": boolean,
  "data": object | null,
  "error": string | null,
  "timestamp": string
}
```

### Rate Limiting

API Gateway is configured with:
- Rate limit: 100 requests/second
- Burst limit: 200 requests

## Performance Optimization

### Caching Strategy

- **Dashboard Data**: Cache for 5 minutes
- **Real-time Metrics**: No caching (always fresh)
- **Chat History**: Cache for 1 minute
- **System Health**: Cache for 30 seconds

### Database Optimization

- **Analytics Table**: Optimized for time-series queries
- **GSI Usage**: Efficient querying by type and date
- **Batch Operations**: Reduce DynamoDB costs
- **TTL Configuration**: Automatic data cleanup

### Lambda Optimization

- **Memory Allocation**: 1024 MB for optimal performance
- **Timeout**: 5 minutes for complex aggregations
- **Concurrent Executions**: Limited to 20 for cost control
- **Cold Start Mitigation**: EventBridge keeps function warm

## Security Considerations

### Data Protection

- All analytics data is encrypted at rest and in transit
- PII is anonymized in analytics records
- Audit logging for all admin actions
- Data retention policies enforced

### Access Control

- API Gateway throttling prevents abuse
- CloudWatch logs for audit trails
- IAM roles with least privilege
- VPC endpoints for private access (optional)

### Compliance

- HIPAA-compliant data handling
- Audit trails for compliance reporting
- Data anonymization for analytics
- Secure credential management

## Troubleshooting

### Common Issues

#### 1. High API Latency
**Symptoms**: Dashboard loads slowly, timeouts
**Solutions**:
- Check CloudWatch metrics for Lambda duration
- Optimize DynamoDB queries
- Increase Lambda memory allocation
- Implement caching

#### 2. Missing Analytics Data
**Symptoms**: Empty dashboard, zero metrics
**Solutions**:
- Verify analytics recording in application logs
- Check DynamoDB table for data
- Validate date range parameters
- Test analytics service health

#### 3. Authentication Errors
**Symptoms**: 403 Forbidden responses
**Solutions**:
- Verify API Gateway configuration
- Check IAM permissions
- Validate CORS settings
- Test with correct API key (if configured)

### Debugging Commands

```bash
# Check API Gateway logs
aws logs describe-log-groups --log-group-name-prefix "/aws/apigateway/ada-clara-admin"

# Monitor Lambda logs
aws logs tail /aws/lambda/ada-clara-admin-analytics --follow

# Test analytics data
npx ts-node -e "
import { AnalyticsService } from './src/services/analytics-service';
const service = new AnalyticsService();
service.healthCheck().then(console.log);
"

# Check DynamoDB analytics table
aws dynamodb scan --table-name ada-clara-analytics --limit 10
```

## Cost Optimization

### Current Costs (Estimated)

- **API Gateway**: ~$3.50 per million requests
- **Lambda**: ~$0.20 per million requests (1GB memory)
- **DynamoDB**: ~$1.25 per million read/write units
- **CloudWatch**: ~$0.50 per dashboard + $0.30 per alarm

### Optimization Strategies

1. **Implement Caching**: Reduce API calls by 60-80%
2. **Optimize Lambda Memory**: Right-size based on usage
3. **DynamoDB On-Demand**: Pay only for actual usage
4. **Log Retention**: Set appropriate retention periods
5. **Alarm Consolidation**: Combine related alarms

## Future Enhancements

### Planned Features

1. **Advanced Analytics**:
   - User journey analysis
   - Conversation flow mapping
   - Sentiment analysis integration
   - Predictive analytics

2. **Enhanced Monitoring**:
   - Custom business metrics
   - SLA monitoring and reporting
   - Automated anomaly detection
   - Performance benchmarking

3. **Integration Improvements**:
   - Real-time WebSocket updates
   - Export capabilities (CSV, PDF)
   - Scheduled report generation
   - Third-party integrations (Slack, Teams)

4. **Security Enhancements**:
   - Role-based access control
   - Multi-factor authentication
   - Audit log analysis
   - Compliance reporting automation

---

## Quick Reference

### Key Files
- `backend/lambda/admin-analytics/index.ts` - Main Lambda function
- `backend/src/services/analytics-service.ts` - Analytics processing
- `backend/lib/admin-analytics-stack.ts` - CDK infrastructure
- `backend/scripts/test-admin-analytics.ts` - Test suite

### Commands
```bash
npm run deploy-admin-analytics  # Deploy infrastructure
npm run test-admin-analytics    # Run tests
```

### Environment Variables
```bash
AWS_REGION                     # AWS region
CHAT_SESSIONS_TABLE           # DynamoDB table names
ANALYTICS_TABLE               # Analytics data table
ESCALATION_QUEUE_TABLE        # Escalation data table
```

### API Endpoints
```
GET /admin/dashboard          # Dashboard metrics
GET /admin/realtime          # Real-time metrics
GET /admin/chat-history      # Chat history
GET /admin/health            # System health
```