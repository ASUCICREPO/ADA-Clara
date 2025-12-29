/**
 * Configuration Service
 * 
 * Provides centralized configuration management for the web crawler system
 * including scheduling, retry policies, and operational parameters.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export interface CrawlerConfiguration {
  frequency: 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0-23
  minute: number; // 0-59
  targetUrls: string[];
  retryAttempts: number;
  timeoutMinutes: number;
  enabled: boolean;
  retryBackoffRate: number;
  maxConcurrentRequests?: number;
  changeDetectionEnabled?: boolean;
  skipUnchangedContent?: boolean;
  forceRefresh?: boolean;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigurationHistory {
  configurationId: string;
  timestamp: string;
  configuration: CrawlerConfiguration;
  updatedBy: string;
  reason?: string;
}

export class ConfigurationService {
  private dynamoClient: DynamoDBDocumentClient;
  private configTable: string;
  private defaultConfiguration: CrawlerConfiguration;

  constructor() {
    const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    this.configTable = process.env.CONFIGURATION_TABLE || 'ada-clara-configuration';
    
    // Default configuration
    this.defaultConfiguration = {
      frequency: 'weekly',
      dayOfWeek: 0, // Sunday
      hour: 2, // 2 AM
      minute: 0,
      targetUrls: [
        'https://diabetes.org/about-diabetes/type-1',
        'https://diabetes.org/about-diabetes/type-2',
        'https://diabetes.org/about-diabetes/gestational',
        'https://diabetes.org/about-diabetes/prediabetes',
        'https://diabetes.org/living-with-diabetes',
        'https://diabetes.org/tools-and-resources',
        'https://diabetes.org/community',
        'https://diabetes.org/professionals'
      ],
      retryAttempts: 3,
      timeoutMinutes: 15,
      enabled: true,
      retryBackoffRate: 2.0,
      maxConcurrentRequests: 5,
      changeDetectionEnabled: true,
      skipUnchangedContent: true,
      forceRefresh: false
    };
  }

  /**
   * Get current configuration
   */
  async getCurrentConfiguration(): Promise<CrawlerConfiguration> {
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.configTable,
        Key: {
          pk: 'CONFIG',
          sk: 'CURRENT'
        }
      }));

      if (result.Item && result.Item.configuration) {
        return {
          ...this.defaultConfiguration,
          ...result.Item.configuration
        };
      }

      // Return default configuration if none exists
      return this.defaultConfiguration;
    } catch (error) {
      console.error('Failed to get current configuration:', error);
      return this.defaultConfiguration;
    }
  }

  /**
   * Update configuration
   */
  async updateConfiguration(
    newConfig: Partial<CrawlerConfiguration>, 
    updatedBy: string = 'system',
    reason?: string
  ): Promise<void> {
    try {
      // Get current configuration
      const currentConfig = await this.getCurrentConfiguration();
      
      // Merge with new configuration
      const updatedConfig: CrawlerConfiguration = {
        ...currentConfig,
        ...newConfig
      };

      // Validate configuration
      const validation = this.validateConfiguration(updatedConfig);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      const timestamp = new Date().toISOString();
      const configurationId = `config-${Date.now()}`;

      // Save new configuration
      await this.dynamoClient.send(new PutCommand({
        TableName: this.configTable,
        Item: {
          pk: 'CONFIG',
          sk: 'CURRENT',
          configuration: updatedConfig,
          configurationId,
          updatedAt: timestamp,
          updatedBy,
          reason
        }
      }));

      // Save configuration history
      await this.dynamoClient.send(new PutCommand({
        TableName: this.configTable,
        Item: {
          pk: 'HISTORY',
          sk: timestamp,
          configurationId,
          configuration: updatedConfig,
          updatedBy,
          reason,
          timestamp
        }
      }));

      console.log(`Configuration updated by ${updatedBy}: ${reason || 'No reason provided'}`);
    } catch (error) {
      console.error('Failed to update configuration:', error);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validateConfiguration(config: CrawlerConfiguration): ConfigurationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate frequency
    if (!['weekly', 'bi-weekly', 'monthly'].includes(config.frequency)) {
      errors.push('Frequency must be weekly, bi-weekly, or monthly');
    }

    // Validate day of week
    if (config.dayOfWeek < 0 || config.dayOfWeek > 6) {
      errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
    }

    // Validate hour
    if (config.hour < 0 || config.hour > 23) {
      errors.push('Hour must be between 0 and 23');
    }

    // Validate minute
    if (config.minute < 0 || config.minute > 59) {
      errors.push('Minute must be between 0 and 59');
    }

    // Validate target URLs
    if (!config.targetUrls || config.targetUrls.length === 0) {
      errors.push('At least one target URL must be specified');
    } else {
      config.targetUrls.forEach((url, index) => {
        try {
          new URL(url);
          if (!url.startsWith('https://')) {
            warnings.push(`URL ${index + 1} should use HTTPS: ${url}`);
          }
        } catch {
          errors.push(`Invalid URL format at index ${index + 1}: ${url}`);
        }
      });
    }

    // Validate retry attempts
    if (config.retryAttempts < 0 || config.retryAttempts > 10) {
      errors.push('Retry attempts must be between 0 and 10');
    }

    // Validate timeout
    if (config.timeoutMinutes < 1 || config.timeoutMinutes > 60) {
      errors.push('Timeout must be between 1 and 60 minutes');
    }

    // Validate retry backoff rate
    if (config.retryBackoffRate < 1.0 || config.retryBackoffRate > 5.0) {
      errors.push('Retry backoff rate must be between 1.0 and 5.0');
    }

    // Validate max concurrent requests
    if (config.maxConcurrentRequests && (config.maxConcurrentRequests < 1 || config.maxConcurrentRequests > 20)) {
      warnings.push('Max concurrent requests should be between 1 and 20 for optimal performance');
    }

    // Validate scheduling for off-peak hours
    if (config.hour >= 8 && config.hour <= 18) {
      warnings.push('Consider scheduling during off-peak hours (outside 8 AM - 6 PM) to reduce server load');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get configuration history
   */
  async getConfigurationHistory(limit: number = 10): Promise<ConfigurationHistory[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.configTable,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': 'HISTORY'
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      }));

      return (result.Items || []).map(item => ({
        configurationId: item.configurationId,
        timestamp: item.timestamp,
        configuration: item.configuration,
        updatedBy: item.updatedBy,
        reason: item.reason
      }));
    } catch (error) {
      console.error('Failed to get configuration history:', error);
      return [];
    }
  }

  /**
   * Reset to default configuration
   */
  async resetToDefault(updatedBy: string = 'system', reason: string = 'Reset to default'): Promise<void> {
    await this.updateConfiguration(this.defaultConfiguration, updatedBy, reason);
  }

  /**
   * Get default configuration
   */
  getDefaultConfiguration(): CrawlerConfiguration {
    return { ...this.defaultConfiguration };
  }

  /**
   * Check if crawler should run based on current configuration and time
   */
  async shouldCrawlerRun(): Promise<{
    shouldRun: boolean;
    reason: string;
    nextScheduledRun?: Date;
  }> {
    try {
      const config = await this.getCurrentConfiguration();
      
      if (!config.enabled) {
        return {
          shouldRun: false,
          reason: 'Crawler is disabled in configuration'
        };
      }

      const now = new Date();
      const currentDay = now.getDay();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Check if it's the right day of week
      if (currentDay !== config.dayOfWeek) {
        const nextRun = this.calculateNextRun(config);
        return {
          shouldRun: false,
          reason: `Not scheduled day (current: ${currentDay}, scheduled: ${config.dayOfWeek})`,
          nextScheduledRun: nextRun
        };
      }

      // Check if it's the right time (within 5 minute window)
      const scheduledMinutes = config.hour * 60 + config.minute;
      const currentMinutes = currentHour * 60 + currentMinute;
      const timeDiff = Math.abs(currentMinutes - scheduledMinutes);

      if (timeDiff > 5) {
        const nextRun = this.calculateNextRun(config);
        return {
          shouldRun: false,
          reason: `Not scheduled time (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, scheduled: ${config.hour}:${config.minute.toString().padStart(2, '0')})`,
          nextScheduledRun: nextRun
        };
      }

      // Additional frequency checks
      if (config.frequency === 'bi-weekly') {
        const weekNumber = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekNumber % 2 !== 0) {
          return {
            shouldRun: false,
            reason: 'Bi-weekly schedule: not the scheduled week',
            nextScheduledRun: this.calculateNextRun(config)
          };
        }
      } else if (config.frequency === 'monthly') {
        // Check if this is the first occurrence of the day in the month
        const firstOccurrence = this.getFirstOccurrenceOfDayInMonth(now, config.dayOfWeek);
        if (now.getDate() !== firstOccurrence.getDate()) {
          return {
            shouldRun: false,
            reason: 'Monthly schedule: not the first occurrence of the day in the month',
            nextScheduledRun: this.calculateNextRun(config)
          };
        }
      }

      return {
        shouldRun: true,
        reason: 'All scheduling conditions met'
      };
    } catch (error) {
      console.error('Failed to check if crawler should run:', error);
      return {
        shouldRun: false,
        reason: `Error checking schedule: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Calculate next scheduled run time
   */
  private calculateNextRun(config: CrawlerConfiguration): Date {
    const now = new Date();
    const nextRun = new Date();
    
    // Set to scheduled time
    nextRun.setHours(config.hour, config.minute, 0, 0);
    
    // Calculate days until next scheduled day
    const currentDay = now.getDay();
    let daysUntilNext = config.dayOfWeek - currentDay;
    
    if (daysUntilNext <= 0) {
      daysUntilNext += 7; // Next week
    }
    
    // Apply frequency multiplier
    if (config.frequency === 'bi-weekly') {
      daysUntilNext += 7; // Add extra week for bi-weekly
    } else if (config.frequency === 'monthly') {
      // Find next month's first occurrence
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const firstOccurrence = this.getFirstOccurrenceOfDayInMonth(nextMonth, config.dayOfWeek);
      return new Date(firstOccurrence.getFullYear(), firstOccurrence.getMonth(), firstOccurrence.getDate(), config.hour, config.minute);
    }
    
    nextRun.setDate(now.getDate() + daysUntilNext);
    return nextRun;
  }

  /**
   * Get first occurrence of a specific day in a month
   */
  private getFirstOccurrenceOfDayInMonth(date: Date, targetDay: number): Date {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDayOfWeek = firstDay.getDay();
    const daysToAdd = (targetDay - firstDayOfWeek + 7) % 7;
    return new Date(date.getFullYear(), date.getMonth(), 1 + daysToAdd);
  }

  /**
   * Get configuration summary for monitoring
   */
  async getConfigurationSummary(): Promise<{
    enabled: boolean;
    frequency: string;
    nextRun?: Date;
    targetUrlCount: number;
    lastUpdated?: string;
  }> {
    try {
      const config = await this.getCurrentConfiguration();
      const scheduleCheck = await this.shouldCrawlerRun();
      
      return {
        enabled: config.enabled,
        frequency: config.frequency,
        nextRun: scheduleCheck.nextScheduledRun,
        targetUrlCount: config.targetUrls.length,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get configuration summary:', error);
      return {
        enabled: false,
        frequency: 'unknown',
        targetUrlCount: 0
      };
    }
  }
}