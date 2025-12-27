#!/usr/bin/env node

/**
 * Deploy DynamoDB Stack for ADA Clara Chatbot
 * This script deploys the comprehensive DynamoDB infrastructure
 */

import * as cdk from 'aws-cdk-lib';
import { AdaClaraDynamoDBStack } from '../lib/dynamodb-stack';

const app = new cdk.App();

// Get environment from context or default to dev
const environment = app.node.tryGetContext('environment') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

console.log(`Deploying ADA Clara DynamoDB Stack to ${environment} environment`);
console.log(`Account: ${account}, Region: ${region}`);

const dynamoStack = new AdaClaraDynamoDBStack(app, `AdaClaraDynamoDB-${environment}`, {
  env: {
    account,
    region
  },
  description: `ADA Clara Chatbot DynamoDB Infrastructure - ${environment}`,
  tags: {
    Project: 'ADA-Clara',
    Environment: environment,
    Component: 'Database',
    ManagedBy: 'CDK'
  }
});

// Add stack outputs for other stacks to reference
new cdk.CfnOutput(dynamoStack, 'ChatSessionsTableName', {
  value: dynamoStack.chatSessionsTable.tableName,
  description: 'Chat Sessions DynamoDB Table Name',
  exportName: `AdaClara-${environment}-ChatSessionsTable`
});

new cdk.CfnOutput(dynamoStack, 'ChatSessionsTableArn', {
  value: dynamoStack.chatSessionsTable.tableArn,
  description: 'Chat Sessions DynamoDB Table ARN',
  exportName: `AdaClara-${environment}-ChatSessionsTableArn`
});

new cdk.CfnOutput(dynamoStack, 'ProfessionalMembersTableName', {
  value: dynamoStack.professionalMembersTable.tableName,
  description: 'Professional Members DynamoDB Table Name',
  exportName: `AdaClara-${environment}-ProfessionalMembersTable`
});

new cdk.CfnOutput(dynamoStack, 'AnalyticsTableName', {
  value: dynamoStack.analyticsTable.tableName,
  description: 'Analytics DynamoDB Table Name',
  exportName: `AdaClara-${environment}-AnalyticsTable`
});

new cdk.CfnOutput(dynamoStack, 'AuditLogsTableName', {
  value: dynamoStack.auditLogsTable.tableName,
  description: 'Audit Logs DynamoDB Table Name',
  exportName: `AdaClara-${environment}-AuditLogsTable`
});

new cdk.CfnOutput(dynamoStack, 'UserPreferencesTableName', {
  value: dynamoStack.userPreferencesTable.tableName,
  description: 'User Preferences DynamoDB Table Name',
  exportName: `AdaClara-${environment}-UserPreferencesTable`
});

new cdk.CfnOutput(dynamoStack, 'EscalationQueueTableName', {
  value: dynamoStack.escalationQueueTable.tableName,
  description: 'Escalation Queue DynamoDB Table Name',
  exportName: `AdaClara-${environment}-EscalationQueueTable`
});

new cdk.CfnOutput(dynamoStack, 'KnowledgeContentTableName', {
  value: dynamoStack.knowledgeContentTable.tableName,
  description: 'Knowledge Content DynamoDB Table Name',
  exportName: `AdaClara-${environment}-KnowledgeContentTable`
});

app.synth();