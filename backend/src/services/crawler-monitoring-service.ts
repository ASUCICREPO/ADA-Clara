/**
 * Crawler Monitoring Service
 * 
 * Provides comprehensive monitoring and alerting capabilities for the weekly crawler scheduling system.
 * Handles CloudWatch metrics, execution history tracking, and performance monitoring.
 * 
 * Requirements: 4.1, 4.3, 4.4, 4.5
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export interface ExecutionMetrics {
  executionId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  totalUrls: number;
  processedUrls: number;
  skippedUrls: number;
  failedUrls: number;
  newContent: number;
  modifiedContent: number;
  unchangedContent: number;
  vectorsCreated: number;
  vectorsUpdated: number;
  changeDetectionTime: number;
  embeddingGenerationTime: number;
  vectorStorageTime: number;
  errorCount: number;
  errors?: string[];
}

export interface PerformanceMetrics {
  averageExecutionTime: number;
  successRate: number;
  contentProcessingRate: number;
  changeDetectionEfficiency: number;
  vectorGenerationThroughput: number;
  errorRate: number;
}

export interface AlertConfiguration {
  executionFailureThreshold: number;
  highLatencyThreshold: number; // milliseconds
  lowEfficiencyThreshold: number; // percentage
  errorRateThreshold: number; // percentage
  notificationTopicArn: string;
}

/**
 * Crawler Monitoring Service
 * Handles metrics collection, execution history, and alerting
 */
export class CrawlerMonitoringService {
  private cloudWatchClient: CloudWatchClient;
  private dynamoDBClient: DynamoDBClient;
  private snsClient: SNSClient;
  private readonly metricsNamespace = 'ADA-Clara/Crawler';
  private readonly executionHistoryTable: string;
  private readonly alertConfig: AlertConfiguration;

  constructor(
    executionHistoryTable: string,
    alertConfig: AlertConfiguration,
    region: string = process.env.AWS_REGION || 'us-east-1'
  ) {
    this.cloudWatchClient = new CloudWatchClient({ region });
    this.dynamoDBClient = new DynamoDBClient({ region });
    this.snsClient = new SNSClient({ region });
    this.executionHistoryTable = executionHistoryTable;
    this.alertConfig = alertConfig;
  }

  /**
   * Record crawler execution start
   * Requirements: 4.1, 4.4
   */
  async recordExecutionStart(executionId: string, targetUrls: string[]): Promise<void> {
    const startTime = new Date().toISOString();
    
    try {
      // Store execution record in DynamoDB
      await this.dynamoDBClient.send(new PutItemCommand({
        TableName: this.executionHistoryTable,
        Item: {
          PK: { S: `EXECUTION#${executionId}` },
          SK: { S: 'METADATA' },
          executionId: { S: executionId },
          startTime: { S: startTime },
          status: { S: 'running' },
          totalUrls: { N: targetUrls.length.toString() },
          targetUrls: { SS: targetUrls },
          createdAt: { S: startTime },
          updatedAt: { S: startTime },
          ttl: { N: Math.floor((Date.now() + (90 * 24 * 60 * 60 * 1000)) / 1000).toString() } // 90 days TTL
        }
      }));

      // Record CloudWatch metrics
      await this.putCloudWatchMetrics([
        {
          MetricName: 'ExecutionStarted',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ExecutionId', Value: executionId }
          ],
          Timestamp: new Date()
        },
        {
          MetricName: 'TargetUrlCount',
          Value: targetUrls.length,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ExecutionId', Value: executionId }
          ],
          Timestamp: new Date()
        }
      ]);

      console.log(`📊 Execution start recorded: ${executionId}`);
    } catch (error: any) {
      console.error('Failed to record execution start:', error);
      throw error;
    }
  }

  /**
   * Record crawler execution completion
   * Requirements: 4.1, 4.4, 4.5
   */
  async recordExecutionCompletion(metrics: ExecutionMetrics): Promise<void> {
    const endTime = new Date().toISOString();
    const duration = metrics.duration || (new Date().getTime() - new Date(metrics.startTime).getTime());
    
    try {
      // Update execution record in DynamoDB
      await this.dynamoDBClient.send(new UpdateItemCommand({
        TableName: this.executionHistoryTable,
        Key: {
          PK: { S: `EXECUTION#${metrics.executionId}` },
          SK: { S: 'METADATA' }
        },
        UpdateExpression: 'SET #status = :status, endTime = :endTime, #duration = :duration, processedUrls = :processedUrls, skippedUrls = :skippedUrls, failedUrls = :failedUrls, newContent = :newContent, modifiedContent = :modifiedContent, unchangedContent = :unchangedContent, vectorsCreated = :vectorsCreated, vectorsUpdated = :vectorsUpdated, changeDetectionTime = :changeDetectionTime, embeddingGenerationTime = :embeddingGenerationTime, vectorStorageTime = :vectorStorageTime, errorCount = :errorCount, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#duration': 'duration'
        },
        ExpressionAttributeValues: {
          ':status': { S: metrics.status },
          ':endTime': { S: endTime },
          ':duration': { N: duration.toString() },
          ':processedUrls': { N: metrics.processedUrls.toString() },
          ':skippedUrls': { N: metrics.skippedUrls.toString() },
          ':failedUrls': { N: metrics.failedUrls.toString() },
          ':newContent': { N: metrics.newContent.toString() },
          ':modifiedContent': { N: metrics.modifiedContent.toString() },
          ':unchangedContent': { N: metrics.unchangedContent.toString() },
          ':vectorsCreated': { N: metrics.vectorsCreated.toString() },
          ':vectorsUpdated': { N: metrics.vectorsUpdated.toString() },
          ':changeDetectionTime': { N: metrics.changeDetectionTime.toString() },
          ':embeddingGenerationTime': { N: metrics.embeddingGenerationTime.toString() },
          ':vectorStorageTime': { N: metrics.vectorStorageTime.toString() },
          ':errorCount': { N: metrics.errorCount.toString() },
          ':updatedAt': { S: endTime }
        }
      }));

      // Calculate performance metrics
      const successRate = metrics.totalUrls > 0 ? ((metrics.processedUrls - metrics.failedUrls) / metrics.totalUrls) * 100 : 0;
      const changeDetectionEfficiency = metrics.processedUrls > 0 ? ((metrics.skippedUrls + metrics.processedUrls) / metrics.totalUrls) * 100 : 0;
      const contentProcessingRate = duration > 0 ? (metrics.processedUrls / (duration / 1000)) : 0;
      const vectorGenerationThroughput = metrics.embeddingGenerationTime > 0 ? ((metrics.vectorsCreated + metrics.vectorsUpdated) / (metrics.embeddingGenerationTime / 1000)) : 0;

      // Record comprehensive CloudWatch metrics
      await this.putCloudWatchMetrics([
        {
          MetricName: 'ExecutionCount',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Status', Value: metrics.status }
          ],
          Timestamp: new Date()
        },
        {
          MetricName: 'ExecutionDuration',
          Value: duration,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'Status', Value: metrics.status }
          ],
          Timestamp: new Date()
        },
        {
          MetricName: 'SuccessfulExecutions',
          Value: metrics.status === 'completed' ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'FailedExecutions',
          Value: metrics.status === 'failed' ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'ContentProcessed',
          Value: metrics.processedUrls,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'ContentSkipped',
          Value: metrics.skippedUrls,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'ChangeDetectionTime',
          Value: metrics.changeDetectionTime,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        },
        {
          MetricName: 'VectorGenerationTime',
          Value: metrics.embeddingGenerationTime,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        },
        {
          MetricName: 'VectorStorageTime',
          Value: metrics.vectorStorageTime,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        },
        {
          MetricName: 'ChangeDetectionEfficiency',
          Value: changeDetectionEfficiency,
          Unit: 'Percent',
          Timestamp: new Date()
        },
        {
          MetricName: 'SuccessRate',
          Value: successRate,
          Unit: 'Percent',
          Timestamp: new Date()
        },
        {
          MetricName: 'ContentProcessingRate',
          Value: contentProcessingRate,
          Unit: 'Count/Second',
          Timestamp: new Date()
        },
        {
          MetricName: 'VectorGenerationThroughput',
          Value: vectorGenerationThroughput,
          Unit: 'Count/Second',
          Timestamp: new Date()
        },
        {
          MetricName: 'ErrorCount',
          Value: metrics.errorCount,
          Unit: 'Count',
          Timestamp: new Date()
        }
      ]);

      // Check for alert conditions and send notifications if needed
      await this.checkAlertConditions(metrics, {
        successRate,
        changeDetectionEfficiency,
        contentProcessingRate,
        vectorGenerationThroughput,
        averageExecutionTime: duration,
        errorRate: metrics.totalUrls > 0 ? (metrics.errorCount / metrics.totalUrls) * 100 : 0
      });

      console.log(`📊 Execution completion recorded: ${metrics.executionId} (${metrics.status})`);
    } catch (error: any) {
      console.error('Failed to record execution completion:', error);
      throw error;
    }
  }

  /**
   * Get execution history for monitoring and analysis
   * Requirements: 4.4, 4.5
   */
  async getExecutionHistory(limit: number = 50): Promise<ExecutionMetrics[]> {
    try {
      const response = await this.dynamoDBClient.send(new QueryCommand({
        TableName: this.executionHistoryTable,
        IndexName: 'GSI-LastCrawled', // Assuming this GSI exists for querying by date
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': { S: 'completed' }
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      }));

      const executions: ExecutionMetrics[] = [];
      
      if (response.Items) {
        for (const item of response.Items) {
          executions.push({
            executionId: item.executionId?.S || '',
            startTime: item.startTime?.S || '',
            endTime: item.endTime?.S,
            duration: item.duration?.N ? parseInt(item.duration.N) : undefined,
            status: (item.status?.S as any) || 'unknown',
            totalUrls: item.totalUrls?.N ? parseInt(item.totalUrls.N) : 0,
            processedUrls: item.processedUrls?.N ? parseInt(item.processedUrls.N) : 0,
            skippedUrls: item.skippedUrls?.N ? parseInt(item.skippedUrls.N) : 0,
            failedUrls: item.failedUrls?.N ? parseInt(item.failedUrls.N) : 0,
            newContent: item.newContent?.N ? parseInt(item.newContent.N) : 0,
            modifiedContent: item.modifiedContent?.N ? parseInt(item.modifiedContent.N) : 0,
            unchangedContent: item.unchangedContent?.N ? parseInt(item.unchangedContent.N) : 0,
            vectorsCreated: item.vectorsCreated?.N ? parseInt(item.vectorsCreated.N) : 0,
            vectorsUpdated: item.vectorsUpdated?.N ? parseInt(item.vectorsUpdated.N) : 0,
            changeDetectionTime: item.changeDetectionTime?.N ? parseInt(item.changeDetectionTime.N) : 0,
            embeddingGenerationTime: item.embeddingGenerationTime?.N ? parseInt(item.embeddingGenerationTime.N) : 0,
            vectorStorageTime: item.vectorStorageTime?.N ? parseInt(item.vectorStorageTime.N) : 0,
            errorCount: item.errorCount?.N ? parseInt(item.errorCount.N) : 0
          });
        }
      }

      return executions;
    } catch (error: any) {
      console.error('Failed to get execution history:', error);
      throw error;
    }
  }

  /**
   * Calculate performance metrics from execution history
   * Requirements: 4.4, 4.5
   */
  async calculatePerformanceMetrics(days: number = 7): Promise<PerformanceMetrics> {
    try {
      const executions = await this.getExecutionHistory(100); // Get more data for analysis
      const recentExecutions = executions.filter(exec => {
        const executionDate = new Date(exec.startTime);
        const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        return executionDate >= cutoffDate;
      });

      if (recentExecutions.length === 0) {
        return {
          averageExecutionTime: 0,
          successRate: 0,
          contentProcessingRate: 0,
          changeDetectionEfficiency: 0,
          vectorGenerationThroughput: 0,
          errorRate: 0
        };
      }

      const totalExecutions = recentExecutions.length;
      const successfulExecutions = recentExecutions.filter(exec => exec.status === 'completed').length;
      const totalDuration = recentExecutions.reduce((sum, exec) => sum + (exec.duration || 0), 0);
      const totalProcessed = recentExecutions.reduce((sum, exec) => sum + exec.processedUrls, 0);
      const totalSkipped = recentExecutions.reduce((sum, exec) => sum + exec.skippedUrls, 0);
      const totalUrls = recentExecutions.reduce((sum, exec) => sum + exec.totalUrls, 0);
      const totalVectors = recentExecutions.reduce((sum, exec) => sum + exec.vectorsCreated + exec.vectorsUpdated, 0);
      const totalEmbeddingTime = recentExecutions.reduce((sum, exec) => sum + exec.embeddingGenerationTime, 0);
      const totalErrors = recentExecutions.reduce((sum, exec) => sum + exec.errorCount, 0);

      return {
        averageExecutionTime: totalDuration / totalExecutions,
        successRate: (successfulExecutions / totalExecutions) * 100,
        contentProcessingRate: totalDuration > 0 ? (totalProcessed / (totalDuration / 1000)) : 0,
        changeDetectionEfficiency: totalUrls > 0 ? ((totalSkipped + totalProcessed) / totalUrls) * 100 : 0,
        vectorGenerationThroughput: totalEmbeddingTime > 0 ? (totalVectors / (totalEmbeddingTime / 1000)) : 0,
        errorRate: totalUrls > 0 ? (totalErrors / totalUrls) * 100 : 0
      };
    } catch (error: any) {
      console.error('Failed to calculate performance metrics:', error);
      throw error;
    }
  }

  /**
   * Check alert conditions and send notifications
   * Requirements: 4.3, 4.5
   */
  private async checkAlertConditions(
    metrics: ExecutionMetrics, 
    performance: PerformanceMetrics
  ): Promise<void> {
    const alerts: string[] = [];

    // Check execution failure
    if (metrics.status === 'failed') {
      alerts.push(`Crawler execution failed: ${metrics.executionId}`);
    }

    // Check high latency
    if (metrics.duration && metrics.duration > this.alertConfig.highLatencyThreshold) {
      alerts.push(`High execution latency detected: ${metrics.duration}ms (threshold: ${this.alertConfig.highLatencyThreshold}ms)`);
    }

    // Check low efficiency
    if (performance.changeDetectionEfficiency < this.alertConfig.lowEfficiencyThreshold) {
      alerts.push(`Low change detection efficiency: ${performance.changeDetectionEfficiency.toFixed(1)}% (threshold: ${this.alertConfig.lowEfficiencyThreshold}%)`);
    }

    // Check high error rate
    if (performance.errorRate > this.alertConfig.errorRateThreshold) {
      alerts.push(`High error rate detected: ${performance.errorRate.toFixed(1)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`);
    }

    // Send notifications if alerts exist
    if (alerts.length > 0) {
      await this.sendAlertNotification(metrics.executionId, alerts, metrics, performance);
    }
  }

  /**
   * Send alert notification via SNS
   * Requirements: 4.3
   */
  private async sendAlertNotification(
    executionId: string,
    alerts: string[],
    metrics: ExecutionMetrics,
    performance: PerformanceMetrics
  ): Promise<void> {
    try {
      const message = {
        executionId,
        timestamp: new Date().toISOString(),
        alerts,
        metrics: {
          status: metrics.status,
          duration: metrics.duration,
          processedUrls: metrics.processedUrls,
          failedUrls: metrics.failedUrls,
          errorCount: metrics.errorCount
        },
        performance: {
          successRate: performance.successRate.toFixed(1) + '%',
          changeDetectionEfficiency: performance.changeDetectionEfficiency.toFixed(1) + '%',
          errorRate: performance.errorRate.toFixed(1) + '%'
        }
      };

      await this.snsClient.send(new PublishCommand({
        TopicArn: this.alertConfig.notificationTopicArn,
        Subject: `ADA Clara Crawler Alert - Execution ${executionId}`,
        Message: JSON.stringify(message, null, 2)
      }));

      console.log(`🚨 Alert notification sent for execution: ${executionId}`);
    } catch (error: any) {
      console.error('Failed to send alert notification:', error);
    }
  }

  /**
   * Put metrics to CloudWatch
   */
  private async putCloudWatchMetrics(metrics: MetricDatum[]): Promise<void> {
    try {
      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: this.metricsNamespace,
        MetricData: metrics
      }));
    } catch (error: any) {
      console.error('Failed to put CloudWatch metrics:', error);
      throw error;
    }
  }

  /**
   * Record custom performance metric
   * Requirements: 4.4
   */
  async recordCustomMetric(
    metricName: string, 
    value: number, 
    unit: string = 'Count',
    dimensions: { [key: string]: string } = {}
  ): Promise<void> {
    try {
      const metricDimensions = Object.entries(dimensions).map(([name, value]) => ({
        Name: name,
        Value: value
      }));

      await this.putCloudWatchMetrics([{
        MetricName: metricName,
        Value: value,
        Unit: unit as any,
        Dimensions: metricDimensions,
        Timestamp: new Date()
      }]);

      console.log(`📊 Custom metric recorded: ${metricName} = ${value} ${unit}`);
    } catch (error: any) {
      console.error('Failed to record custom metric:', error);
      throw error;
    }
  }
}