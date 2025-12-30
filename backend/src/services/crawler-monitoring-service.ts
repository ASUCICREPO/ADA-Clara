/**
 * Crawler Monitoring Service
 * 
 * Provides comprehensive monitoring, metrics collection, and alerting
 * for the web crawler system.
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { 
  CrawlerExecutionResult,
  CrawlerError,
  ExecutionMetrics as CrawlerExecutionMetrics
} from '../types/index';

export interface ExecutionMetrics {
  executionId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  totalUrls: number;
  processedUrls: number;
  failedUrls: number;
  skippedUrls: number;
  successRate: number;
  averageProcessingTime: number;
  throughput: number;
  errors: CrawlerError[];
}

export interface AlertConfiguration {
  successRateThreshold: number;
  errorRateThreshold: number;
  performanceThreshold: number;
  executionFailureThreshold: number;
  highLatencyThreshold: number;
  lowEfficiencyThreshold: number;
  notificationTopic?: string;
  notificationTopicArn?: string;
  enableAlerts: boolean;
}

export class CrawlerMonitoringService {
  private cloudWatchClient: CloudWatchClient;
  private snsClient: SNSClient;
  private dynamoClient: DynamoDBDocumentClient;
  private executionHistoryTable: string;
  private alertConfig: AlertConfiguration;

  constructor(
    executionHistoryTable: string,
    alertConfig: AlertConfiguration,
    cloudWatchClient?: CloudWatchClient
  ) {
    this.cloudWatchClient = cloudWatchClient || new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    
    this.executionHistoryTable = executionHistoryTable;
    this.alertConfig = alertConfig;
  }

  /**
   * Record execution start
   */
  async recordExecutionStart(executionId: string, targetUrls: string[]): Promise<void> {
    try {
      const executionRecord = {
        pk: `EXECUTION#${executionId}`,
        sk: 'METADATA',
        executionId,
        startTime: new Date().toISOString(),
        status: 'running',
        targetUrls,
        totalUrls: targetUrls.length,
        createdAt: new Date().toISOString()
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.executionHistoryTable,
        Item: executionRecord
      }));

      // Record CloudWatch metric
      await this.recordMetric('ExecutionStarted', 1, 'Count');

      console.log(`Execution start recorded: ${executionId}`);
    } catch (error) {
      console.error('Failed to record execution start:', error);
    }
  }

  /**
   * Record execution completion
   */
  async recordExecutionCompletion(result: CrawlerExecutionResult): Promise<void> {
    try {
      // Update execution record
      const executionRecord = {
        pk: `EXECUTION#${result.executionId}`,
        sk: 'METADATA',
        executionId: result.executionId,
        startTime: result.startTime,
        endTime: result.endTime,
        duration: result.duration,
        status: 'completed',
        totalUrls: result.totalUrls,
        processedUrls: result.processedUrls,
        failedUrls: result.failedUrls,
        successRate: (result.processedUrls / result.totalUrls) * 100,
        errors: result.errors,
        performance: result.performance,
        updatedAt: new Date().toISOString()
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.executionHistoryTable,
        Item: executionRecord
      }));

      // Record CloudWatch metrics
      await this.recordExecutionMetrics(result);

      // Check alert conditions
      await this.checkAlertConditions(result);

      console.log(`Execution completion recorded: ${result.executionId}`);
    } catch (error) {
      console.error('Failed to record execution completion:', error);
    }
  }

  /**
   * Record execution failure
   */
  async recordExecutionFailure(executionId: string, error: Error): Promise<void> {
    try {
      const executionRecord = {
        pk: `EXECUTION#${executionId}`,
        sk: 'METADATA',
        executionId,
        endTime: new Date().toISOString(),
        status: 'failed',
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        updatedAt: new Date().toISOString()
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.executionHistoryTable,
        Item: executionRecord
      }));

      // Record CloudWatch metric
      await this.recordMetric('ExecutionFailed', 1, 'Count');

      // Send alert if enabled
      if (this.alertConfig.enableAlerts && this.alertConfig.notificationTopic) {
        await this.sendFailureAlert(executionId, error);
      }

      console.log(`Execution failure recorded: ${executionId}`);
    } catch (recordError) {
      console.error('Failed to record execution failure:', recordError);
    }
  }

  /**
   * Record custom metrics
   */
  async recordCustomMetric(
    metricName: string, 
    value: number, 
    unit: string = 'Count',
    dimensions?: Record<string, string>
  ): Promise<void> {
    try {
      const metricData: MetricDatum = {
        MetricName: metricName,
        Value: value,
        Unit: unit as any,
        Timestamp: new Date()
      };

      if (dimensions) {
        metricData.Dimensions = Object.entries(dimensions).map(([name, value]) => ({
          Name: name,
          Value: value
        }));
      }

      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'ADA-Clara/Crawler',
        MetricData: [metricData]
      }));

      console.log(`Custom metric recorded: ${metricName} = ${value}`);
    } catch (error) {
      console.error(`Failed to record custom metric ${metricName}:`, error);
    }
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(limit: number = 10): Promise<ExecutionMetrics[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.executionHistoryTable,
        IndexName: 'GSI1', // Assuming GSI on status
        KeyConditionExpression: 'sk = :sk',
        ExpressionAttributeValues: {
          ':sk': 'METADATA'
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      }));

      return (result.Items || []).map(item => ({
        executionId: item.executionId,
        startTime: item.startTime,
        endTime: item.endTime,
        duration: item.duration,
        totalUrls: item.totalUrls || 0,
        processedUrls: item.processedUrls || 0,
        failedUrls: item.failedUrls || 0,
        skippedUrls: item.skippedUrls || 0,
        successRate: item.successRate || 0,
        averageProcessingTime: item.performance?.averageProcessingTime || 0,
        throughput: item.performance?.throughput || 0,
        errors: item.errors || []
      }));
    } catch (error) {
      console.error('Failed to get execution history:', error);
      return [];
    }
  }

  /**
   * Get system health summary
   */
  async getSystemHealthSummary(): Promise<{
    recentExecutions: number;
    averageSuccessRate: number;
    averagePerformance: number;
    recentErrors: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    try {
      const recentExecutions = await this.getExecutionHistory(10);
      
      if (recentExecutions.length === 0) {
        return {
          recentExecutions: 0,
          averageSuccessRate: 0,
          averagePerformance: 0,
          recentErrors: 0,
          status: 'healthy'
        };
      }

      const averageSuccessRate = recentExecutions.reduce((sum, exec) => sum + exec.successRate, 0) / recentExecutions.length;
      const averagePerformance = recentExecutions.reduce((sum, exec) => sum + exec.averageProcessingTime, 0) / recentExecutions.length;
      const recentErrors = recentExecutions.reduce((sum, exec) => sum + exec.errors.length, 0);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (averageSuccessRate < this.alertConfig.successRateThreshold) {
        status = 'unhealthy';
      } else if (averagePerformance > this.alertConfig.performanceThreshold) {
        status = 'degraded';
      }

      return {
        recentExecutions: recentExecutions.length,
        averageSuccessRate,
        averagePerformance,
        recentErrors,
        status
      };
    } catch (error) {
      console.error('Failed to get system health summary:', error);
      return {
        recentExecutions: 0,
        averageSuccessRate: 0,
        averagePerformance: 0,
        recentErrors: 0,
        status: 'unhealthy'
      };
    }
  }

  /**
   * Record execution metrics to CloudWatch
   */
  private async recordExecutionMetrics(result: CrawlerExecutionResult): Promise<void> {
    const metrics: MetricDatum[] = [
      {
        MetricName: 'ExecutionDuration',
        Value: result.duration,
        Unit: 'Milliseconds',
        Timestamp: new Date()
      },
      {
        MetricName: 'SuccessRate',
        Value: (result.processedUrls / result.totalUrls) * 100,
        Unit: 'Percent',
        Timestamp: new Date()
      },
      {
        MetricName: 'ProcessedUrls',
        Value: result.processedUrls,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'FailedUrls',
        Value: result.failedUrls,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'Throughput',
        Value: result.performance.throughput,
        Unit: 'Count/Second',
        Timestamp: new Date()
      }
    ];

    await this.cloudWatchClient.send(new PutMetricDataCommand({
      Namespace: 'ADA-Clara/Crawler',
      MetricData: metrics
    }));
  }

  /**
   * Check alert conditions and send notifications
   */
  private async checkAlertConditions(result: CrawlerExecutionResult): Promise<void> {
    if (!this.alertConfig.enableAlerts || !this.alertConfig.notificationTopic) {
      return;
    }

    const successRate = (result.processedUrls / result.totalUrls) * 100;
    const errorRate = (result.failedUrls / result.totalUrls) * 100;

    // Check success rate threshold
    if (successRate < this.alertConfig.successRateThreshold) {
      await this.sendAlert(
        'Low Success Rate Alert',
        `Crawler execution ${result.executionId} has a success rate of ${successRate.toFixed(2)}%, which is below the threshold of ${this.alertConfig.successRateThreshold}%`,
        result
      );
    }

    // Check error rate threshold
    if (errorRate > this.alertConfig.errorRateThreshold) {
      await this.sendAlert(
        'High Error Rate Alert',
        `Crawler execution ${result.executionId} has an error rate of ${errorRate.toFixed(2)}%, which exceeds the threshold of ${this.alertConfig.errorRateThreshold}%`,
        result
      );
    }

    // Check performance threshold
    if (result.performance.averageProcessingTime > this.alertConfig.performanceThreshold) {
      await this.sendAlert(
        'Performance Degradation Alert',
        `Crawler execution ${result.executionId} has an average processing time of ${result.performance.averageProcessingTime}ms, which exceeds the threshold of ${this.alertConfig.performanceThreshold}ms`,
        result
      );
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(subject: string, message: string, result: CrawlerExecutionResult): Promise<void> {
    try {
      const alertMessage = {
        subject,
        message,
        executionId: result.executionId,
        timestamp: new Date().toISOString(),
        metrics: {
          successRate: (result.processedUrls / result.totalUrls) * 100,
          errorRate: (result.failedUrls / result.totalUrls) * 100,
          averageProcessingTime: result.performance.averageProcessingTime,
          throughput: result.performance.throughput
        },
        errors: result.errors.slice(0, 5) // Include first 5 errors
      };

      await this.snsClient.send(new PublishCommand({
        TopicArn: this.alertConfig.notificationTopic,
        Subject: subject,
        Message: JSON.stringify(alertMessage, null, 2)
      }));

      console.log(`Alert sent: ${subject}`);
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  /**
   * Send failure alert
   */
  private async sendFailureAlert(executionId: string, error: Error): Promise<void> {
    try {
      const alertMessage = {
        subject: `Crawler Execution Failure - ${executionId}`,
        executionId,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        }
      };

      await this.snsClient.send(new PublishCommand({
        TopicArn: this.alertConfig.notificationTopic!,
        Subject: alertMessage.subject,
        Message: JSON.stringify(alertMessage, null, 2)
      }));

      console.log(`Failure alert sent for execution: ${executionId}`);
    } catch (alertError) {
      console.error('Failed to send failure alert:', alertError);
    }
  }

  /**
   * Record a single metric
   */
  private async recordMetric(metricName: string, value: number, unit: string): Promise<void> {
    try {
      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'ADA-Clara/Crawler',
        MetricData: [{
          MetricName: metricName,
          Value: value,
          Unit: unit as any,
          Timestamp: new Date()
        }]
      }));
    } catch (error) {
      console.error(`Failed to record metric ${metricName}:`, error);
    }
  }
}