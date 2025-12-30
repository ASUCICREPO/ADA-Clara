# ADA Clara Escalation Workflow Guide

## Overview

The ADA Clara escalation workflow provides intelligent escalation of chat conversations to human support agents when the AI chatbot cannot adequately assist users. The system uses multiple trigger conditions to determine when escalation is needed and automatically notifies support staff via email.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chat Lambda   │───▶│ Escalation       │───▶│   SQS Queue     │
│   (Triggers)    │    │ Service          │    │   (Email Jobs)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   DynamoDB       │    │  SES Lambda     │
                       │   (Audit Logs)   │    │  (Send Emails)  │
                       └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  SNS Topic      │
                                                │  (Urgent Alerts)│
                                                └─────────────────┘
```

## Components

### 1. EscalationService
- **Location**: `backend/src/services/escalation-service.ts`
- **Purpose**: Evaluates escalation triggers and manages escalation workflow
- **Key Methods**:
  - `evaluateEscalationTriggers()`: Analyzes conversation for escalation conditions
  - `createEscalation()`: Creates escalation record and queues email
  - `updateEscalationStatus()`: Updates escalation status for tracking

### 2. SES Lambda Function
- **Location**: `backend/lambda/ses-escalation/index.ts`
- **Purpose**: Processes escalation emails from SQS queue
- **Triggers**: SQS messages from escalation queue
- **Features**:
  - Rich HTML email templates
  - Priority-based processing
  - Urgent notification system
  - Audit logging integration

### 3. CDK Infrastructure
- **Location**: `backend/lib/ses-escalation-stack.ts`
- **Components**:
  - SQS queue with dead letter queue
  - SNS topic for urgent alerts
  - SES configuration set
  - CloudWatch monitoring and alarms
  - IAM permissions

## Escalation Triggers

The system evaluates multiple conditions to determine when escalation is needed:

### 1. Explicit Escalation Request (Priority: HIGH)
**Trigger**: User explicitly asks for human help
**Keywords**: 
- English: "speak to human", "talk to person", "customer service", "not helpful"
- Spanish: "hablar con persona", "ayuda humana", "servicio al cliente"

### 2. Emergency Keywords (Priority: URGENT)
**Trigger**: User mentions emergency or urgent medical situations
**Keywords**: 
- English: "emergency", "urgent", "crisis", "chest pain", "can't breathe"
- Spanish: "emergencia", "urgente", "crisis", "dolor severo"

### 3. Low Confidence Response (Priority: MEDIUM)
**Trigger**: AI response confidence below 70%
**Condition**: `response.confidence < 0.7`

### 4. Repeated Similar Questions (Priority: MEDIUM)
**Trigger**: User asks similar questions multiple times
**Detection**: Keyword similarity analysis across recent messages

### 5. Long Conversation (Priority: LOW)
**Trigger**: Conversation exceeds 15 messages without resolution
**Condition**: `conversationHistory.length > 15`

### 6. No Relevant Sources (Priority: LOW)
**Trigger**: No knowledge base sources found for user query
**Condition**: `response.sources.length === 0`

## Email Templates

### Standard Escalation Email
- **Subject**: `🟡 ADA Clara Escalation - MEDIUM Priority`
- **Content**: 
  - Escalation details (ID, session, priority, reason)
  - User information (name, email, phone, zip code)
  - Complete conversation history with timestamps
  - Next steps for support team

### Urgent Escalation Email
- **Subject**: `🔴 ADA Clara Escalation - URGENT Priority`
- **Additional Features**:
  - Immediate SNS notification
  - Highlighted emergency information
  - Priority processing in queue

## Deployment

### 1. Prerequisites
```bash
# Install dependencies
npm install

# Set environment variables
export SUPPORT_EMAIL="support@ada-clara.org"
export FROM_EMAIL="noreply@ada-clara.org"
export ADMIN_EMAIL="admin@ada-clara.org"
export SUPPORT_PHONE="+1-555-0123"  # Optional for SMS alerts
```

### 2. Deploy Infrastructure
```bash
# Deploy SES escalation stack
npm run deploy-ses-escalation

# Verify deployment
aws cloudformation describe-stacks --stack-name AdaClaraSESEscalation
```

### 3. Configure SES
```bash
# Verify sender email addresses
aws ses verify-email-identity --email-address noreply@ada-clara.org
aws ses verify-email-identity --email-address support@ada-clara.org

# Check verification status
aws ses get-identity-verification-attributes --identities noreply@ada-clara.org support@ada-clara.org

# Request production access (remove sandbox mode)
# This must be done through AWS Console or support ticket
```

### 4. Test Workflow
```bash
# Run escalation workflow tests
npm run test-escalation

# Test specific scenarios
npx ts-node scripts/test-escalation-workflow.ts
```

## Integration with Chat Processor

### 1. Add Escalation Service to Chat Lambda

```typescript
import { EscalationService } from '../src/services/escalation-service';

const escalationService = new EscalationService();

// In your chat processing function
const response = await generateChatResponse(message);

// Evaluate escalation triggers
const escalationEval = await escalationService.evaluateEscalationTriggers(
  sessionId,
  message,
  response
);

if (escalationEval.shouldEscalate) {
  await escalationService.createEscalation(
    sessionId,
    escalationEval.reason,
    escalationEval.priority
  );
  
  // Modify response to inform user
  response.content += "\n\nI've connected you with our support team who will reach out to you shortly.";
}
```

### 2. Environment Variables

Add to your chat processor Lambda:
```typescript
environment: {
  ESCALATION_QUEUE_URL: escalationStack.escalationQueue.queueUrl,
  ESCALATION_TOPIC_ARN: escalationStack.escalationTopic.topicArn,
  // ... other environment variables
}
```

### 3. IAM Permissions

Grant chat processor permission to publish to escalation queue:
```typescript
escalationStack.grantPublishToQueue(chatProcessorLambda);
```

## Monitoring and Alerts

### CloudWatch Metrics
- **Escalation Queue Depth**: Number of pending escalations
- **Lambda Errors**: Failed escalation processing
- **DLQ Messages**: Failed escalation emails
- **Processing Duration**: Time to process escalations

### Alarms
- **High Queue Depth**: >50 messages in queue
- **Lambda Errors**: Any processing failures
- **DLQ Messages**: Any messages in dead letter queue

### Dashboard
Access the escalation dashboard:
```
AWS Console → CloudWatch → Dashboards → ada-clara-escalation-{account}
```

## Troubleshooting

### Common Issues

#### 1. SES Sandbox Mode
**Problem**: Emails only sent to verified addresses
**Solution**: Request production access through AWS Console

#### 2. Queue Permission Errors
**Problem**: Chat processor cannot publish to escalation queue
**Solution**: Verify IAM permissions and queue URL configuration

#### 3. Email Delivery Issues
**Problem**: Emails not being delivered
**Solution**: 
- Check SES sending statistics
- Verify email addresses
- Check spam folders
- Review bounce/complaint notifications

#### 4. Lambda Timeout Errors
**Problem**: Escalation processing times out
**Solution**: 
- Increase Lambda timeout (currently 5 minutes)
- Optimize email template generation
- Check external service dependencies

### Debugging Commands

```bash
# Check SES sending quota and statistics
aws ses get-send-quota
aws ses get-send-statistics

# Monitor SQS queue
aws sqs get-queue-attributes --queue-url $ESCALATION_QUEUE_URL --attribute-names All

# Check Lambda logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ada-clara-ses-escalation"

# Test escalation service health
npx ts-node -e "
import { EscalationService } from './src/services/escalation-service';
const service = new EscalationService();
service.healthCheck().then(console.log);
"
```

## Security Considerations

### Data Protection
- All escalation data is encrypted in transit and at rest
- Email content includes conversation history (ensure HIPAA compliance)
- User PII is handled according to privacy policies

### Access Control
- SES sending limited to verified email addresses
- SQS queue access restricted to escalation Lambda
- SNS topic subscriptions managed through CDK

### Audit Trail
- All escalation events logged to DynamoDB audit table
- Email delivery status tracked through SES events
- Failed escalations captured in dead letter queue

## Cost Optimization

### SES Costs
- **Sending**: $0.10 per 1,000 emails
- **Receiving**: $0.09 per 1,000 emails (if configured)

### SQS Costs
- **Requests**: $0.40 per 1 million requests
- **Data Transfer**: Minimal for escalation messages

### SNS Costs
- **Email**: $2.00 per 100,000 notifications
- **SMS**: $0.75 per 100 messages (if configured)

### Optimization Tips
- Use SQS batching to reduce request costs
- Configure appropriate message retention periods
- Monitor and adjust Lambda memory allocation
- Use CloudWatch Logs retention policies

## Future Enhancements

### Planned Features
1. **Escalation Analytics Dashboard**: Real-time escalation metrics
2. **Multi-language Email Templates**: Spanish escalation emails
3. **Escalation Routing**: Route to specific support agents
4. **Auto-resolution**: Automatic escalation closure
5. **Integration with Ticketing Systems**: JIRA, ServiceNow integration

### Configuration Options
1. **Custom Trigger Thresholds**: Adjustable confidence levels
2. **Business Hours Routing**: Different handling for off-hours
3. **Priority-based SLA**: Different response times by priority
4. **Escalation Workflows**: Multi-step escalation processes

---

## Quick Reference

### Key Files
- `backend/src/services/escalation-service.ts` - Core escalation logic
- `backend/lambda/ses-escalation/index.ts` - Email processing Lambda
- `backend/lib/ses-escalation-stack.ts` - CDK infrastructure
- `backend/scripts/test-escalation-workflow.ts` - Test suite

### Commands
```bash
npm run deploy-ses-escalation  # Deploy infrastructure
npm run test-escalation        # Run tests
```

### Environment Variables
```bash
ESCALATION_QUEUE_URL           # SQS queue URL
ESCALATION_TOPIC_ARN          # SNS topic ARN
SUPPORT_EMAIL                 # Support team email
FROM_EMAIL                    # Sender email address
```