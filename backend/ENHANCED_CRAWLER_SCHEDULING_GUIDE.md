# Enhanced Crawler Scheduling Guide

## Overview

The ADA Clara system now includes automated weekly web crawler scheduling with intelligent content change detection, comprehensive monitoring, and robust error handling. This enhancement ensures the knowledge base stays current with the latest diabetes information from diabetes.org without manual intervention.

## Key Features

### 🕒 Automated Weekly Scheduling
- **EventBridge Integration**: Automated weekly triggers via AWS EventBridge
- **Configurable Schedule**: Support for weekly, bi-weekly, and monthly frequencies
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Dead Letter Queue**: Failed executions are captured for analysis

### 🔍 Intelligent Content Change Detection
- **Hash-Based Detection**: SHA-256 content hashing to detect changes
- **Timestamp Validation**: HTTP Last-Modified header comparison
- **Efficient Processing**: Only new or modified content is processed
- **Content Tracking**: DynamoDB table tracks content state and history

### 📊 Comprehensive Monitoring
- **CloudWatch Dashboard**: Real-time crawler health and performance metrics
- **Custom Alarms**: Alerts for execution failures, high latency, and low efficiency
- **SNS Notifications**: Email alerts for critical issues
- **Execution History**: Complete audit trail of crawler activities

### 🔐 Security and Compliance
- **Domain Whitelist**: Restricted to diabetes.org domains only
- **Rate Limiting**: Respects robots.txt and terms of service
- **Minimal IAM**: Least privilege principle for all components
- **Audit Logging**: Complete security event logging
- **Encryption**: SSE-S3 encryption enforced on all stored content

## Architecture Components

### EventBridge Scheduler
- **Rule Name**: `ada-clara-weekly-crawler-schedule`
- **Default Schedule**: Every 7 days (configurable)
- **Target**: Enhanced crawler Lambda function
- **Retry Configuration**: 3 attempts with exponential backoff

### Content Detection Service
- **Table**: `ada-clara-content-tracking`
- **GSI**: `GSI-LastCrawled` for efficient queries
- **TTL**: Automatic cleanup of old tracking records
- **Change Detection**: Hash comparison and timestamp validation

### Monitoring Infrastructure
- **Dashboard**: `ada-clara-crawler-monitoring-{account}`
- **Alarms**: Execution failures, high latency, low efficiency
- **Metrics**: Custom CloudWatch metrics for crawler performance
- **Notifications**: SNS topic for failure alerts

### Security Features
- **URL Validation**: Domain whitelist enforcement
- **Rate Limiting**: Configurable request limits
- **Encryption Validation**: SSE-S3 requirement verification
- **Audit Logging**: Security event tracking

## Configuration

### Environment Variables

The crawler scheduling system is configured via environment variables:

```bash
# Schedule Configuration
CRAWLER_FREQUENCY=weekly                    # weekly, bi-weekly, monthly
CRAWLER_DAY_OF_WEEK=0                      # 0-6, Sunday = 0
CRAWLER_HOUR=2                             # 0-23, UTC
CRAWLER_MINUTE=0                           # 0-59
CRAWLER_TARGET_URLS=                       # Comma-separated URLs
CRAWLER_TIMEOUT_MINUTES=15                 # Execution timeout

# Notification Configuration
NOTIFICATION_EMAIL=                        # Email for failure alerts
FAILURE_NOTIFICATION_TOPIC=                # SNS topic ARN

# Security Configuration
ALLOWED_DOMAINS=diabetes.org,www.diabetes.org
ALLOWED_PROTOCOLS=https
REQUESTS_PER_MINUTE=10
REQUESTS_PER_HOUR=100
REQUESTS_PER_DAY=1000

# Content Detection Configuration
CONTENT_TRACKING_TABLE=ada-clara-content-tracking
CHANGE_DETECTION_ENABLED=true
HASH_ALGORITHM=SHA-256

# Monitoring Configuration
MONITORING_ENABLED=true
CRAWLER_DASHBOARD_NAME=ada-clara-crawler-monitoring
EXECUTION_HISTORY_ENABLED=true
```

### Schedule Expressions

EventBridge schedule expressions supported:

```bash
# Weekly (default)
rate(7 days)

# Bi-weekly
rate(14 days)

# Monthly
rate(30 days)

# Custom cron expressions
cron(0 2 * * 0 *)  # Every Sunday at 2 AM UTC
```

## Deployment

### Production Deployment

The enhanced crawler scheduling is included in the production deployment:

```bash
cd backend
npm run deploy-production-complete
```

### Core Components Only

For faster deployment of core components:

```bash
cd backend
npm run deploy-production-complete -- --core-only
```

### Validation

Validate the deployment with comprehensive health checks:

```bash
cd backend
npx ts-node scripts/validate-enhanced-crawler-deployment.ts
```

## Monitoring and Troubleshooting

### CloudWatch Dashboard

Access the crawler monitoring dashboard:
- **URL**: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=ada-clara-crawler-monitoring-{account}`
- **Metrics**: Execution count, duration, success rate, content processed
- **Performance**: Change detection time, vector generation time
- **Efficiency**: Content skipped vs processed ratio

### Key Metrics

Monitor these critical metrics:

1. **Execution Success Rate**: Should be > 95%
2. **Average Execution Time**: Should be < 10 minutes
3. **Content Detection Efficiency**: Should be > 70%
4. **Change Detection Time**: Should be < 30 seconds
5. **Vector Generation Time**: Should be < 2 minutes per URL

### Common Issues

#### High Failure Rate
- Check EventBridge rule is enabled
- Verify Lambda function permissions
- Review CloudWatch logs for errors
- Check SNS notifications for failure details

#### Poor Performance
- Monitor content detection efficiency
- Check for network timeouts
- Verify S3 Vectors throughput limits
- Review Bedrock embedding API limits

#### Content Not Updating
- Verify change detection is working
- Check content tracking table records
- Review target URL accessibility
- Validate domain whitelist configuration

### Troubleshooting Commands

```bash
# Check EventBridge rule status
aws events describe-rule --name ada-clara-weekly-crawler-schedule

# List recent Lambda executions
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/AdaClaraS3VectorsGA

# Check SNS topic subscriptions
aws sns list-subscriptions-by-topic --topic-arn {TOPIC_ARN}

# Query content tracking table
aws dynamodb scan --table-name ada-clara-content-tracking --limit 10

# Check CloudWatch alarms
aws cloudwatch describe-alarms --alarm-name-prefix ada-clara-crawler
```

## Manual Operations

### Trigger Manual Crawl

Invoke the crawler manually for immediate content updates:

```bash
aws lambda invoke \
  --function-name {CRAWLER_FUNCTION_NAME} \
  --payload '{"source":"manual","action":"manual-crawl","targetUrls":["https://diabetes.org/about-diabetes/type-1"],"forceRefresh":true}' \
  response.json
```

### Update Schedule

Modify the EventBridge rule schedule:

```bash
aws events put-rule \
  --name ada-clara-weekly-crawler-schedule \
  --schedule-expression "rate(14 days)" \
  --state ENABLED
```

### Add Email Notifications

Subscribe to failure notifications:

```bash
aws sns subscribe \
  --topic-arn {FAILURE_NOTIFICATION_TOPIC_ARN} \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Security Considerations

### Access Control
- EventBridge uses minimal IAM role with least privilege
- Lambda function has restricted permissions
- Content tracking table has row-level security
- S3 buckets enforce encryption at rest

### Compliance
- All URLs validated against domain whitelist
- Rate limiting prevents abuse
- Audit logging captures all security events
- Encryption enforced on all stored content

### Monitoring
- Failed authentication attempts logged
- Unauthorized domain access blocked
- Rate limit violations tracked
- Security metrics available in CloudWatch

## Performance Optimization

### Content Detection
- Hash-based change detection reduces processing by 60-80%
- Timestamp validation provides fast pre-filtering
- Incremental vector updates minimize S3 Vectors operations
- Batch processing optimizes throughput

### Resource Utilization
- Lambda memory optimized for GA throughput (3008 MB)
- EventBridge retry logic prevents resource waste
- Dead letter queue captures failed executions
- CloudWatch metrics enable performance tuning

### Cost Management
- Content change detection reduces unnecessary processing
- S3 Vectors GA provides cost-effective vector storage
- Lifecycle policies manage storage costs
- Monitoring identifies optimization opportunities

## Future Enhancements

### Planned Features
- Multi-domain support with configurable whitelists
- Real-time content change notifications
- Advanced content filtering and categorization
- Integration with additional knowledge sources

### Scalability Improvements
- Parallel processing for multiple domains
- Distributed crawling with SQS coordination
- Auto-scaling based on content volume
- Cross-region replication for global access

---

For additional support or questions, refer to the CloudWatch logs and monitoring dashboard for detailed execution information.