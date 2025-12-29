import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, PutRuleCommand, DescribeRuleCommand, DisableRuleCommand, EnableRuleCommand } from '@aws-sdk/client-eventbridge';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

/**
 * Configuration Management Service for Weekly Crawler Scheduling
 * 
 * Handles:
 * - Environment variables for schedule configuration
 * - Default values for all scheduling parameters
 * - Configuration validation with supported frequency options
 * - Dynamic schedule update capability
 * - Configuration change logging for audit purposes
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

export interface ScheduleConfiguration {
  frequency: 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek: number; // 0-6, Sunday = 0
  hour: number; // 0-23, UTC
  minute: number; // 0-59
  targetUrls: string[];
  retryAttempts: number;
  timeoutMinutes: number;
  enabled: boolean;
  notificationEmail?: string;
  retryBackoffRate: number;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigurationChangeLog {
  timestamp: string;
  executionId: string;
  action: 'create' | 'update' | 'delete' | 'enable' | 'disable';
  previousConfig?: Partial<ScheduleConfiguration>;
  newConfig: Partial<ScheduleConfiguration>;
  changedFields: string[];
  userId?: string;
  reason?: string;
  validationResult: ConfigurationValidationResult;
}

export interface ConfigurationDefaults {
  frequency: 'weekly';
  dayOfWeek: 0; // Sunday
  hour: 2; // 2 AM UTC
  minute: 0;
  targetUrls: string[];
  retryAttempts: 3;
  timeoutMinutes: 15;
  enabled: true;
  retryBackoffRate: 2.0;
}

export class ConfigurationService {
  private dynamoClient: DynamoDBClient;
  private eventBridgeClient: EventBridgeClient;
  private cloudWatchClient: CloudWatchClient;
  private configTableName: string;
  private auditTableName: string;
  private ruleName: string;
  
  // Default configuration values - Requirement 2.5: Provide default values for all scheduling parameters
  private readonly defaults: ConfigurationDefaults = {
    frequency: 'weekly',
    dayOfWeek: 0, // Sunday
    hour: 2, // 2 AM UTC
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
    retryBackoffRate: 2.0
  };

  // Supported frequency options - Requirement 2.1: Support weekly, bi-weekly, and monthly crawling frequencies
  private readonly supportedFrequencies = ['weekly', 'bi-weekly', 'monthly'] as const;

  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    // Environment variables for configuration - Requirement 2.4: Store scheduling configuration in environment variables
    this.configTableName = process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking';
    this.auditTableName = process.env.CONTENT_TRACKING_TABLE || 'ada-clara-content-tracking';
    this.ruleName = process.env.SCHEDULE_RULE_NAME || 'ada-clara-weekly-crawler-schedule';
  }

  /**
   * Get current configuration with environment variable support
   * Requirement 2.4: Store scheduling configuration in environment variables for easy modification
   */
  async getCurrentConfiguration(): Promise<ScheduleConfiguration> {
    try {
      // First try to get from DynamoDB
      const storedConfig = await this.getStoredConfiguration();
      
      if (storedConfig) {
        return storedConfig;
      }

      // Fallback to environment variables with defaults
      return this.getConfigurationFromEnvironment();
    } catch (error) {
      console.error('Error getting current configuration:', error);
      // Return defaults if all else fails
      return this.getConfigurationFromEnvironment();
    }
  }

  /**
   * Get configuration from environment variables with defaults
   * Requirement 2.5: Provide default values for all scheduling parameters
   */
  private getConfigurationFromEnvironment(): ScheduleConfiguration {
    const envFrequency = process.env.CRAWLER_FREQUENCY as 'weekly' | 'bi-weekly' | 'monthly';
    const envDayOfWeek = parseInt(process.env.CRAWLER_DAY_OF_WEEK || '0');
    const envHour = parseInt(process.env.CRAWLER_HOUR || '2');
    const envMinute = parseInt(process.env.CRAWLER_MINUTE || '0');
    const envTargetUrls = process.env.CRAWLER_TARGET_URLS?.split(',') || this.defaults.targetUrls;
    const envRetryAttempts = parseInt(process.env.RETRY_ATTEMPTS || '3');
    const envTimeoutMinutes = parseInt(process.env.CRAWLER_TIMEOUT_MINUTES || '15');
    const envEnabled = process.env.SCHEDULE_ENABLED !== 'false';
    const envNotificationEmail = process.env.NOTIFICATION_EMAIL;
    const envRetryBackoffRate = parseFloat(process.env.RETRY_BACKOFF_RATE || '2.0');

    return {
      frequency: this.supportedFrequencies.includes(envFrequency) ? envFrequency : this.defaults.frequency,
      dayOfWeek: isNaN(envDayOfWeek) || envDayOfWeek < 0 || envDayOfWeek > 6 ? this.defaults.dayOfWeek : envDayOfWeek,
      hour: isNaN(envHour) || envHour < 0 || envHour > 23 ? this.defaults.hour : envHour,
      minute: isNaN(envMinute) || envMinute < 0 || envMinute > 59 ? this.defaults.minute : envMinute,
      targetUrls: envTargetUrls.length > 0 ? envTargetUrls : this.defaults.targetUrls,
      retryAttempts: isNaN(envRetryAttempts) || envRetryAttempts < 1 || envRetryAttempts > 10 ? this.defaults.retryAttempts : envRetryAttempts,
      timeoutMinutes: isNaN(envTimeoutMinutes) || envTimeoutMinutes < 1 || envTimeoutMinutes > 60 ? this.defaults.timeoutMinutes : envTimeoutMinutes,
      enabled: envEnabled,
      notificationEmail: envNotificationEmail,
      retryBackoffRate: isNaN(envRetryBackoffRate) || envRetryBackoffRate < 1.0 || envRetryBackoffRate > 10.0 ? this.defaults.retryBackoffRate : envRetryBackoffRate
    };
  }

  /**
   * Get stored configuration from DynamoDB
   */
  private async getStoredConfiguration(): Promise<ScheduleConfiguration | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.configTableName,
        Key: {
          PK: { S: 'CONFIG#SCHEDULER' },
          SK: { S: 'CURRENT' }
        }
      });

      const result = await this.dynamoClient.send(command);
      
      if (!result.Item) {
        return null;
      }

      return {
        frequency: result.Item.frequency?.S as 'weekly' | 'bi-weekly' | 'monthly' || this.defaults.frequency,
        dayOfWeek: parseInt(result.Item.dayOfWeek?.N || '0'),
        hour: parseInt(result.Item.hour?.N || '2'),
        minute: parseInt(result.Item.minute?.N || '0'),
        targetUrls: result.Item.targetUrls?.SS || this.defaults.targetUrls,
        retryAttempts: parseInt(result.Item.retryAttempts?.N || '3'),
        timeoutMinutes: parseInt(result.Item.timeoutMinutes?.N || '15'),
        enabled: result.Item.enabled?.BOOL !== false,
        notificationEmail: result.Item.notificationEmail?.S,
        retryBackoffRate: parseFloat(result.Item.retryBackoffRate?.N || '2.0')
      };
    } catch (error) {
      console.error('Error getting stored configuration:', error);
      return null;
    }
  }

  /**
   * Validate configuration with supported frequency options
   * Requirement 2.1: Support weekly, bi-weekly, and monthly crawling frequencies
   * Requirement 2.2: Validate that all URLs belong to the diabetes.org domain
   */
  validateConfiguration(config: Partial<ScheduleConfiguration>): ConfigurationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate frequency - Requirement 2.1
    if (config.frequency && !this.supportedFrequencies.includes(config.frequency)) {
      errors.push(`Invalid frequency: ${config.frequency}. Supported frequencies: ${this.supportedFrequencies.join(', ')}`);
    }

    // Validate day of week
    if (config.dayOfWeek !== undefined && (config.dayOfWeek < 0 || config.dayOfWeek > 6)) {
      errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
    }

    // Validate hour
    if (config.hour !== undefined && (config.hour < 0 || config.hour > 23)) {
      errors.push('Hour must be between 0 and 23 (UTC)');
    }

    // Validate minute
    if (config.minute !== undefined && (config.minute < 0 || config.minute > 59)) {
      errors.push('Minute must be between 0 and 59');
    }

    // Validate target URLs - Requirement 2.2: Validate that all URLs belong to the diabetes.org domain
    if (config.targetUrls) {
      const allowedDomains = ['diabetes.org', 'www.diabetes.org'];
      const invalidUrls = config.targetUrls.filter(url => {
        try {
          const urlObj = new URL(url);
          return !allowedDomains.includes(urlObj.hostname);
        } catch {
          return true; // Invalid URL format
        }
      });

      if (invalidUrls.length > 0) {
        errors.push(`Invalid URLs (must be from diabetes.org domain): ${invalidUrls.join(', ')}`);
      }

      if (config.targetUrls.length === 0) {
        warnings.push('No target URLs specified, will use default URLs');
      }

      if (config.targetUrls.length > 50) {
        warnings.push('Large number of target URLs may impact performance');
      }
    }

    // Validate retry attempts
    if (config.retryAttempts !== undefined && (config.retryAttempts < 1 || config.retryAttempts > 10)) {
      errors.push('Retry attempts must be between 1 and 10');
    }

    // Validate timeout
    if (config.timeoutMinutes !== undefined && (config.timeoutMinutes < 1 || config.timeoutMinutes > 60)) {
      errors.push('Timeout must be between 1 and 60 minutes');
    }

    // Validate retry backoff rate
    if (config.retryBackoffRate !== undefined && (config.retryBackoffRate < 1.0 || config.retryBackoffRate > 10.0)) {
      errors.push('Retry backoff rate must be between 1.0 and 10.0');
    }

    // Validate notification email
    if (config.notificationEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(config.notificationEmail)) {
        errors.push('Invalid notification email format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Update configuration with validation and audit logging
   * Requirement 2.3: Apply changes to the next scheduled execution
   * Requirements: Configuration change logging for audit purposes
   */
  async updateConfiguration(
    newConfig: Partial<ScheduleConfiguration>,
    userId?: string,
    reason?: string
  ): Promise<{ success: boolean; validationResult: ConfigurationValidationResult; changeLog?: ConfigurationChangeLog }> {
    const executionId = `config_update_${Date.now()}`;
    
    try {
      // Validate new configuration
      const validationResult = this.validateConfiguration(newConfig);
      
      if (!validationResult.isValid) {
        return { success: false, validationResult };
      }

      // Get current configuration for comparison
      const currentConfig = await this.getCurrentConfiguration();
      
      // Merge with current configuration
      const mergedConfig: ScheduleConfiguration = {
        ...currentConfig,
        ...newConfig
      };

      // Determine changed fields
      const changedFields = this.getChangedFields(currentConfig, mergedConfig);
      
      if (changedFields.length === 0) {
        return { 
          success: true, 
          validationResult: { isValid: true, errors: [], warnings: ['No changes detected'] }
        };
      }

      // Store updated configuration
      await this.storeConfiguration(mergedConfig);

      // Update EventBridge rule if schedule-related fields changed
      const scheduleFields = ['frequency', 'dayOfWeek', 'hour', 'minute', 'enabled'];
      const scheduleChanged = changedFields.some(field => scheduleFields.includes(field));
      
      if (scheduleChanged) {
        await this.updateEventBridgeRule(mergedConfig);
      }

      // Create change log - Requirement: Configuration change logging for audit purposes
      const changeLog: ConfigurationChangeLog = {
        timestamp: new Date().toISOString(),
        executionId,
        action: 'update',
        previousConfig: this.extractChangedFields(currentConfig, changedFields),
        newConfig: this.extractChangedFields(mergedConfig, changedFields),
        changedFields,
        userId,
        reason,
        validationResult
      };

      // Store audit log
      await this.logConfigurationChange(changeLog);

      // Send CloudWatch metrics
      await this.sendConfigurationMetrics('update', changedFields.length, validationResult.isValid);

      console.log(`Configuration updated successfully. Changed fields: ${changedFields.join(', ')}`);

      return { success: true, validationResult, changeLog };

    } catch (error) {
      console.error('Error updating configuration:', error);
      
      // Log failed attempt
      const failureLog: ConfigurationChangeLog = {
        timestamp: new Date().toISOString(),
        executionId,
        action: 'update',
        newConfig: newConfig,
        changedFields: [],
        userId,
        reason,
        validationResult: {
          isValid: false,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: []
        }
      };

      await this.logConfigurationChange(failureLog);

      return { 
        success: false, 
        validationResult: {
          isValid: false,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: []
        }
      };
    }
  }

  /**
   * Dynamic schedule update capability
   * Requirement 2.3: Apply changes to the next scheduled execution
   */
  private async updateEventBridgeRule(config: ScheduleConfiguration): Promise<void> {
    try {
      // Generate cron expression based on frequency
      const cronExpression = this.generateCronExpression(config);
      
      // Update the EventBridge rule
      const putRuleCommand = new PutRuleCommand({
        Name: this.ruleName,
        ScheduleExpression: cronExpression,
        State: config.enabled ? 'ENABLED' : 'DISABLED',
        Description: `Automated crawler schedule - ${config.frequency} at ${config.hour}:${config.minute.toString().padStart(2, '0')} UTC`
      });

      await this.eventBridgeClient.send(putRuleCommand);
      
      console.log(`EventBridge rule updated: ${cronExpression}, enabled: ${config.enabled}`);

    } catch (error) {
      console.error('Error updating EventBridge rule:', error);
      throw error;
    }
  }

  /**
   * Generate cron expression based on configuration
   */
  private generateCronExpression(config: ScheduleConfiguration): string {
    const { frequency, dayOfWeek, hour, minute } = config;
    
    switch (frequency) {
      case 'weekly':
        return `cron(${minute} ${hour} ? * ${dayOfWeek === 0 ? 'SUN' : dayOfWeek === 1 ? 'MON' : dayOfWeek === 2 ? 'TUE' : dayOfWeek === 3 ? 'WED' : dayOfWeek === 4 ? 'THU' : dayOfWeek === 5 ? 'FRI' : 'SAT'} *)`;
      
      case 'bi-weekly':
        // For bi-weekly, we use a weekly schedule but the Lambda will check if it should run
        return `cron(${minute} ${hour} ? * ${dayOfWeek === 0 ? 'SUN' : dayOfWeek === 1 ? 'MON' : dayOfWeek === 2 ? 'TUE' : dayOfWeek === 3 ? 'WED' : dayOfWeek === 4 ? 'THU' : dayOfWeek === 5 ? 'FRI' : 'SAT'} *)`;
      
      case 'monthly':
        // Run on the first occurrence of the specified day of week each month
        return `cron(${minute} ${hour} ? * ${dayOfWeek === 0 ? 'SUN' : dayOfWeek === 1 ? 'MON' : dayOfWeek === 2 ? 'TUE' : dayOfWeek === 3 ? 'WED' : dayOfWeek === 4 ? 'THU' : dayOfWeek === 5 ? 'FRI' : 'SAT'}#1 *)`;
      
      default:
        throw new Error(`Unsupported frequency: ${frequency}`);
    }
  }

  /**
   * Store configuration in DynamoDB
   */
  private async storeConfiguration(config: ScheduleConfiguration): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.configTableName,
      Item: {
        PK: { S: 'CONFIG#SCHEDULER' },
        SK: { S: 'CURRENT' },
        frequency: { S: config.frequency },
        dayOfWeek: { N: config.dayOfWeek.toString() },
        hour: { N: config.hour.toString() },
        minute: { N: config.minute.toString() },
        targetUrls: { SS: config.targetUrls },
        retryAttempts: { N: config.retryAttempts.toString() },
        timeoutMinutes: { N: config.timeoutMinutes.toString() },
        enabled: { BOOL: config.enabled },
        retryBackoffRate: { N: config.retryBackoffRate.toString() },
        ...(config.notificationEmail && { notificationEmail: { S: config.notificationEmail } }),
        updatedAt: { S: new Date().toISOString() },
        ttl: { N: Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000).toString() } // 1 year TTL
      }
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Log configuration changes for audit purposes
   * Requirement: Configuration change logging for audit purposes
   */
  private async logConfigurationChange(changeLog: ConfigurationChangeLog): Promise<void> {
    try {
      const command = new PutItemCommand({
        TableName: this.auditTableName,
        Item: {
          PK: { S: 'AUDIT#CONFIG' },
          SK: { S: `${changeLog.timestamp}#${changeLog.executionId}` },
          executionId: { S: changeLog.executionId },
          action: { S: changeLog.action },
          timestamp: { S: changeLog.timestamp },
          changedFields: { SS: changeLog.changedFields },
          previousConfig: { S: JSON.stringify(changeLog.previousConfig || {}) },
          newConfig: { S: JSON.stringify(changeLog.newConfig) },
          validationResult: { S: JSON.stringify(changeLog.validationResult) },
          ...(changeLog.userId && { userId: { S: changeLog.userId } }),
          ...(changeLog.reason && { reason: { S: changeLog.reason } }),
          ttl: { N: Math.floor((Date.now() + 90 * 24 * 60 * 60 * 1000) / 1000).toString() } // 90 days TTL
        }
      });

      await this.dynamoClient.send(command);
      
      console.log(`Configuration change logged: ${changeLog.executionId}`);

    } catch (error) {
      console.error('Error logging configuration change:', error);
      // Don't throw - logging failure shouldn't break the main operation
    }
  }

  /**
   * Send CloudWatch metrics for configuration changes
   */
  private async sendConfigurationMetrics(action: string, changedFieldsCount: number, success: boolean): Promise<void> {
    try {
      const command = new PutMetricDataCommand({
        Namespace: 'ADA-Clara/Crawler/Configuration',
        MetricData: [
          {
            MetricName: 'ConfigurationChanges',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'Action', Value: action },
              { Name: 'Success', Value: success.toString() }
            ],
            Timestamp: new Date()
          },
          {
            MetricName: 'ChangedFieldsCount',
            Value: changedFieldsCount,
            Unit: 'Count',
            Dimensions: [
              { Name: 'Action', Value: action }
            ],
            Timestamp: new Date()
          }
        ]
      });

      await this.cloudWatchClient.send(command);

    } catch (error) {
      console.error('Error sending configuration metrics:', error);
      // Don't throw - metrics failure shouldn't break the main operation
    }
  }

  /**
   * Get changed fields between two configurations
   */
  private getChangedFields(oldConfig: ScheduleConfiguration, newConfig: ScheduleConfiguration): string[] {
    const changedFields: string[] = [];
    
    const fields: (keyof ScheduleConfiguration)[] = [
      'frequency', 'dayOfWeek', 'hour', 'minute', 'targetUrls', 
      'retryAttempts', 'timeoutMinutes', 'enabled', 'notificationEmail', 'retryBackoffRate'
    ];

    for (const field of fields) {
      if (field === 'targetUrls') {
        // Special handling for array comparison
        const oldUrls = oldConfig[field].sort();
        const newUrls = newConfig[field].sort();
        if (JSON.stringify(oldUrls) !== JSON.stringify(newUrls)) {
          changedFields.push(field);
        }
      } else if (oldConfig[field] !== newConfig[field]) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  /**
   * Extract only changed fields from configuration
   */
  private extractChangedFields(config: ScheduleConfiguration, changedFields: string[]): Partial<ScheduleConfiguration> {
    const result: Partial<ScheduleConfiguration> = {};
    
    for (const field of changedFields) {
      (result as any)[field] = (config as any)[field];
    }

    return result;
  }

  /**
   * Get configuration change history
   */
  async getConfigurationHistory(limit: number = 50): Promise<ConfigurationChangeLog[]> {
    try {
      const command = new QueryCommand({
        TableName: this.auditTableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: 'AUDIT#CONFIG' }
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      });

      const result = await this.dynamoClient.send(command);
      
      if (!result.Items) {
        return [];
      }

      return result.Items.map(item => ({
        timestamp: item.timestamp?.S || '',
        executionId: item.executionId?.S || '',
        action: item.action?.S as 'create' | 'update' | 'delete' | 'enable' | 'disable',
        previousConfig: item.previousConfig?.S ? JSON.parse(item.previousConfig.S) : undefined,
        newConfig: JSON.parse(item.newConfig?.S || '{}'),
        changedFields: item.changedFields?.SS || [],
        userId: item.userId?.S,
        reason: item.reason?.S,
        validationResult: JSON.parse(item.validationResult?.S || '{"isValid":false,"errors":[],"warnings":[]}')
      }));

    } catch (error) {
      console.error('Error getting configuration history:', error);
      return [];
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfiguration(): ScheduleConfiguration {
    return { ...this.defaults };
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(userId?: string, reason?: string): Promise<{ success: boolean; validationResult: ConfigurationValidationResult }> {
    return this.updateConfiguration(this.defaults, userId, reason || 'Reset to default configuration');
  }
}