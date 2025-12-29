import { Handler } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ErrorResilienceService, PartialSuccessReport } from '../../src/services/error-resilience-service';
import { ContentDetectionService } from '../../src/services/content-detection-service';
import { SecurityValidationService, URLValidationResult, RateLimitResult, EncryptionValidationResult } from '../../src/services/security-validation-service';
import { ConfigurationService } from '../../src/services/configuration-service';
import { 
  CrawlerError, 
  ErrorContext, 
  RetryConfig,
  CrawlerExecutionResult,
  ContentChangesSummary 
} from '../../src/types/index';

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  extractedAt: string;
  contentType: 'article' | 'faq' | 'resource' | 'event';
  wordCount: number;
  links: string[];
  success: boolean;
  error?: string;
  metadata?: {
    keyTopics?: string[];
    medicalFacts?: string[];
    bedrockConfidence?: number;
    enhancedWithBedrock?: boolean;
    bedrockError?: string;
  };
}

interface BedrockCrawlRequest {
  urls?: string[];
  maxPages?: number;
  testMode?: boolean;
  // EventBridge scheduling support
  source?: 'eventbridge' | 'manual';
  'detail-type'?: string;
  detail?: {
    scheduleId?: string;
    targetUrls?: string[];
    executionId?: string;
    retryAttempt?: number;
  };
}

interface EnhancedCrawlResult extends CrawlResult {
  processingMetrics: {
    networkTime: number;
    bedrockTime: number;
    storageTime: number;
    totalTime: number;
  };
  retryAttempts: number;
  circuitBreakerTriggered: boolean;
  rateLimited: boolean;
}

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Initialize error resilience service
const errorResilienceService = new ErrorResilienceService();
const contentDetectionService = new ContentDetectionService();
const securityValidationService = new SecurityValidationService();
const configurationService = new ConfigurationService();

const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';
const FAILURE_NOTIFICATION_TOPIC = process.env.FAILURE_NOTIFICATION_TOPIC;
const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || '3');
const RETRY_BACKOFF_RATE = parseFloat(process.env.RETRY_BACKOFF_RATE || '2.0');

/**
 * Check if execution should proceed based on frequency configuration
 * For bi-weekly: only execute every other week
 * For monthly: only execute on first occurrence of day in month
 */
function shouldExecuteBasedOnFrequency(config: any): boolean {
  const now = new Date();
  
  switch (config.frequency) {
    case 'weekly':
      return true; // Always execute for weekly
      
    case 'bi-weekly':
      // Execute every other week - use week number modulo 2
      const weekNumber = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      return weekNumber % 2 === 0;
      
    case 'monthly':
      // Execute only on first occurrence of the day in the month
      const dayOfMonth = now.getDate();
      const dayOfWeek = now.getDay();
      const targetDayOfWeek = config.dayOfWeek;
      
      // Check if this is the first occurrence of the target day in the month
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstTargetDay = new Date(firstDayOfMonth);
      firstTargetDay.setDate(1 + (targetDayOfWeek - firstDayOfMonth.getDay() + 7) % 7);
      
      return dayOfMonth === firstTargetDay.getDate() && dayOfWeek === targetDayOfWeek;
      
    default:
      return true; // Default to execute
  }
}

// Test URLs from diabetes.org to evaluate crawler performance
const TEST_URLS = [
  'https://diabetes.org/about-diabetes/type-1',
  'https://diabetes.org/about-diabetes/type-2',
  'https://diabetes.org/about-diabetes/gestational',
  'https://diabetes.org/about-diabetes/prediabetes',
  'https://diabetes.org/living-with-diabetes',
  'https://diabetes.org/tools-and-resources',
  'https://diabetes.org/community',
  'https://diabetes.org/professionals'
];

export const handler: Handler = async (event: BedrockCrawlRequest) => {
  const executionId = event.detail?.executionId || `exec_${Date.now()}`;
  const isScheduledExecution = event.source === 'eventbridge';
  
  console.log('Starting enhanced Bedrock web crawler with error resilience', { 
    event, 
    executionId,
    isScheduledExecution 
  });
  
  // Configuration Management Integration - Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
  let currentConfig;
  try {
    currentConfig = await configurationService.getCurrentConfiguration();
    console.log('Current crawler configuration:', JSON.stringify(currentConfig, null, 2));
    
    // Check if this execution should proceed based on frequency
    if (isScheduledExecution && !shouldExecuteBasedOnFrequency(currentConfig)) {
      console.log(`Skipping execution due to ${currentConfig.frequency} frequency check`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Execution skipped due to frequency configuration',
          frequency: currentConfig.frequency,
          executionId,
          skipped: true
        })
      };
    }
    
    // Validate current configuration
    const validationResult = configurationService.validateConfiguration(currentConfig);
    if (!validationResult.isValid) {
      console.error('Current configuration is invalid:', validationResult.errors);
      throw new Error(`Invalid configuration: ${validationResult.errors.join(', ')}`);
    }
    
    if (validationResult.warnings.length > 0) {
      console.warn('Configuration warnings:', validationResult.warnings);
    }
    
  } catch (configError) {
    console.error('Configuration service error, using fallback configuration:', configError);
    // Use environment variables as fallback
    currentConfig = {
      frequency: (process.env.CRAWLER_FREQUENCY as 'weekly' | 'bi-weekly' | 'monthly') || 'weekly',
      dayOfWeek: parseInt(process.env.CRAWLER_DAY_OF_WEEK || '0'),
      hour: parseInt(process.env.CRAWLER_HOUR || '2'),
      minute: parseInt(process.env.CRAWLER_MINUTE || '0'),
      targetUrls: process.env.CRAWLER_TARGET_URLS?.split(',') || TEST_URLS,
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      timeoutMinutes: parseInt(process.env.CRAWLER_TIMEOUT_MINUTES || '15'),
      enabled: process.env.SCHEDULE_ENABLED !== 'false',
      retryBackoffRate: parseFloat(process.env.RETRY_BACKOFF_RATE || '2.0')
    };
  }
  
  // Use configuration-driven URLs and parameters
  const urlsToTest = event.urls || event.detail?.targetUrls || currentConfig.targetUrls;
  const maxPages = event.maxPages || urlsToTest.length;
  const testMode = event.testMode !== false; // Default to test mode
  
  const results: EnhancedCrawlResult[] = [];
  const errors: CrawlerError[] = [];
  const contentChanges: ContentChangesSummary[] = [];
  let successfulOperations = 0;
  
  try {
    // Create error context for this execution
    const errorContext: ErrorContext = {
      requestId: executionId,
      endpoint: 'bedrock-crawler',
      method: isScheduledExecution ? 'scheduled-crawl' : 'manual-crawl',
      parameters: { urls: urlsToTest, maxPages, testMode },
      timestamp: new Date().toISOString(),
      additionalInfo: {
        isScheduledExecution,
        retryAttempt: event.detail?.retryAttempt || 0
      }
    };

    // Process each URL with comprehensive error handling and security validation
    for (let i = 0; i < Math.min(maxPages, urlsToTest.length); i++) {
      const url = urlsToTest[i];
      console.log(`Processing URL ${i + 1}/${maxPages}: ${url}`);
      
      try {
        // SECURITY VALIDATION - Requirement 6.2: URL domain whitelist validation
        console.log(`Validating URL security: ${url}`);
        const urlValidation = await securityValidationService.validateURL(url);
        
        if (!urlValidation.isValid) {
          console.warn(`URL validation failed for ${url}: ${urlValidation.reason}`);
          
          const crawlerError: CrawlerError = {
            url,
            errorType: 'security',
            errorMessage: `URL validation failed: ${urlValidation.reason}`,
            timestamp: new Date().toISOString(),
            retryAttempt: event.detail?.retryAttempt || 0,
            recoverable: false // Security violations are not recoverable
          };
          
          errors.push(crawlerError);
          
          // Add blocked result
          results.push({
            url,
            title: '',
            content: '',
            extractedAt: new Date().toISOString(),
            contentType: 'article',
            wordCount: 0,
            links: [],
            success: false,
            error: crawlerError.errorMessage,
            processingMetrics: {
              networkTime: 0,
              bedrockTime: 0,
              storageTime: 0,
              totalTime: 0
            },
            retryAttempts: 0,
            circuitBreakerTriggered: false,
            rateLimited: false
          });

          // Record content change as blocked
          contentChanges.push({
            url,
            changeType: 'new',
            currentHash: 'blocked',
            processingDecision: 'blocked'
          });
          
          continue; // Skip to next URL
        }

        // RATE LIMITING - Requirement 6.4: Rate limiting compliance
        console.log(`Checking rate limits for ${url}`);
        const rateLimitCheck = await securityValidationService.checkRateLimit(urlValidation.domain);
        
        if (!rateLimitCheck.allowed) {
          console.warn(`Rate limit exceeded for ${url}. Remaining: ${rateLimitCheck.remainingRequests}, Reset: ${rateLimitCheck.resetTime}`);
          
          // Wait until rate limit resets (with maximum wait time)
          const waitTime = Math.min(rateLimitCheck.resetTime.getTime() - Date.now(), 60000); // Max 1 minute wait
          if (waitTime > 0) {
            console.log(`Waiting ${waitTime}ms for rate limit reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          
          // Recheck rate limit after waiting
          const recheckResult = await securityValidationService.checkRateLimit(urlValidation.domain);
          if (!recheckResult.allowed) {
            console.error(`Rate limit still exceeded after waiting for ${url}`);
            
            const crawlerError: CrawlerError = {
              url,
              errorType: 'rate_limit',
              errorMessage: `Rate limit exceeded. Remaining: ${recheckResult.remainingRequests}`,
              timestamp: new Date().toISOString(),
              retryAttempt: event.detail?.retryAttempt || 0,
              recoverable: true // Rate limits are recoverable
            };
            
            errors.push(crawlerError);
            
            // Add rate limited result
            results.push({
              url,
              title: '',
              content: '',
              extractedAt: new Date().toISOString(),
              contentType: 'article',
              wordCount: 0,
              links: [],
              success: false,
              error: crawlerError.errorMessage,
              processingMetrics: {
                networkTime: 0,
                bedrockTime: 0,
                storageTime: 0,
                totalTime: 0
              },
              retryAttempts: 0,
              circuitBreakerTriggered: false,
              rateLimited: true
            });

            // Record content change as rate limited
            contentChanges.push({
              url,
              changeType: 'new',
              currentHash: 'rate_limited',
              processingDecision: 'rate_limited'
            });
            
            continue; // Skip to next URL
          }
        }

        // ROBOTS.TXT VALIDATION - Requirement 6.4: Robots.txt compliance
        console.log(`Validating robots.txt compliance for ${urlValidation.domain}`);
        const robotsValidation = await securityValidationService.validateRobotsTxt(urlValidation.domain);
        
        if (!robotsValidation.compliant) {
          console.warn(`Robots.txt compliance failed for ${url}`);
          
          const crawlerError: CrawlerError = {
            url,
            errorType: 'compliance',
            errorMessage: `Robots.txt compliance violation: ${robotsValidation.rules.join(', ')}`,
            timestamp: new Date().toISOString(),
            retryAttempt: event.detail?.retryAttempt || 0,
            recoverable: false // Compliance violations are not recoverable
          };
          
          errors.push(crawlerError);
          
          // Add compliance blocked result
          results.push({
            url,
            title: '',
            content: '',
            extractedAt: new Date().toISOString(),
            contentType: 'article',
            wordCount: 0,
            links: [],
            success: false,
            error: crawlerError.errorMessage,
            processingMetrics: {
              networkTime: 0,
              bedrockTime: 0,
              storageTime: 0,
              totalTime: 0
            },
            retryAttempts: 0,
            circuitBreakerTriggered: false,
            rateLimited: false
          });

          // Record content change as compliance blocked
          contentChanges.push({
            url,
            changeType: 'new',
            currentHash: 'compliance_blocked',
            processingDecision: 'compliance_blocked'
          });
          
          continue; // Skip to next URL
        }

        // Apply crawl delay if specified in robots.txt
        if (robotsValidation.crawlDelay && robotsValidation.crawlDelay > 0) {
          const delayMs = robotsValidation.crawlDelay * 1000;
          console.log(`Applying robots.txt crawl delay: ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // Check for content changes first (graceful degradation)
        const changeResult = await errorResilienceService.executeWithGracefulDegradation(
          () => contentDetectionService.detectChanges(url, ''), // Will fetch content internally
          () => Promise.resolve({ hasChanged: true, changeType: 'new' as const, currentHash: 'fallback' }), // Fallback: assume changed
          'content-detection',
          errorContext
        );

        // Skip processing if content hasn't changed
        if (!changeResult.hasChanged && !event.detail?.retryAttempt) {
          console.log(`Skipping ${url} - no content changes detected`);
          contentChanges.push({
            url,
            changeType: 'unchanged',
            currentHash: changeResult.currentHash,
            processingDecision: 'skipped'
          });
          continue;
        }

        // Process URL with retry logic and circuit breaker protection
        const crawlResult = await processSingleUrl(url, errorContext);
        
        if (crawlResult.success) {
          successfulOperations++;
          
          // Record content changes
          contentChanges.push({
            url,
            changeType: changeResult.changeType,
            previousHash: changeResult.previousHash,
            currentHash: changeResult.currentHash,
            processingDecision: 'processed'
          });
        }
        
        results.push(crawlResult);
        
        // Store result in S3 if not in test mode (with encryption validation)
        if (!testMode) {
          await storeContentInS3WithResilience(crawlResult, errorContext);
        }
        
        // Add delay to be respectful to the target site (rate limiting)
        await errorResilienceService.applyRateLimit('network-requests');
        
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        
        const crawlerError: CrawlerError = {
          url,
          errorType: 'network',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          retryAttempt: event.detail?.retryAttempt || 0,
          recoverable: true
        };
        
        errors.push(crawlerError);
        
        // Add failed result
        results.push({
          url,
          title: '',
          content: '',
          extractedAt: new Date().toISOString(),
          contentType: 'article',
          wordCount: 0,
          links: [],
          success: false,
          error: crawlerError.errorMessage,
          processingMetrics: {
            networkTime: 0,
            bedrockTime: 0,
            storageTime: 0,
            totalTime: 0
          },
          retryAttempts: 0,
          circuitBreakerTriggered: false,
          rateLimited: false
        });

        // Record content change as failed
        contentChanges.push({
          url,
          changeType: 'new',
          currentHash: 'error',
          processingDecision: 'failed'
        });
      }
    }
    
    // Create partial success report
    const partialSuccessReport = errorResilienceService.createPartialSuccessReport(
      urlsToTest.length,
      successfulOperations,
      errors,
      executionId
    );

    // Generate comprehensive crawl report
    const report = generateEnhancedCrawlReport(results, partialSuccessReport, contentChanges);
    console.log('Enhanced Crawl Report:', JSON.stringify(report, null, 2));

    // Send failure notifications if needed
    if (errors.length > 0 && FAILURE_NOTIFICATION_TOPIC) {
      await sendFailureNotification(partialSuccessReport, errorContext);
    }

    // Create execution result
    const executionResult: CrawlerExecutionResult = {
      executionId,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - Date.now(), // Will be calculated properly in real implementation
      totalUrls: urlsToTest.length,
      processedUrls: successfulOperations,
      skippedUrls: contentChanges.filter(c => c.processingDecision === 'skipped').length,
      failedUrls: errors.length,
      newContent: contentChanges.filter(c => c.changeType === 'new').length,
      modifiedContent: contentChanges.filter(c => c.changeType === 'modified').length,
      unchangedContent: contentChanges.filter(c => c.changeType === 'unchanged').length,
      vectorsCreated: successfulOperations, // Simplified for now
      vectorsUpdated: 0,
      errors,
      performance: {
        averageProcessingTime: results.reduce((sum, r) => sum + r.processingMetrics.totalTime, 0) / results.length,
        throughput: results.length > 0 ? results.length / (results.reduce((sum, r) => sum + r.processingMetrics.totalTime, 0) / 1000) : 0,
        changeDetectionTime: results.reduce((sum, r) => sum + r.processingMetrics.networkTime, 0) / 10, // Approximate
        embeddingGenerationTime: results.reduce((sum, r) => sum + r.processingMetrics.bedrockTime, 0),
        vectorStorageTime: results.reduce((sum, r) => sum + r.processingMetrics.storageTime, 0)
      },
      contentChanges
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Enhanced Bedrock crawler execution completed',
        executionResult,
        partialSuccessReport,
        results,
        report,
        testMode,
        systemHealth: errorResilienceService.getSystemHealthSummary()
      })
    };
    
  } catch (error) {
    console.error('Crawler execution failed:', error);
    
    // Send critical failure notification
    if (FAILURE_NOTIFICATION_TOPIC) {
      await sendCriticalFailureNotification(error as Error, executionId);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Crawler execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        executionId,
        systemHealth: errorResilienceService.getSystemHealthSummary()
      })
    };
  }
};

async function processSingleUrl(url: string, errorContext: ErrorContext): Promise<EnhancedCrawlResult> {
  const startTime = Date.now();
  let networkTime = 0;
  let bedrockTime = 0;
  let storageTime = 0;
  let retryAttempts = 0;
  let circuitBreakerTriggered = false;
  let rateLimited = false;

  // Custom retry configuration for network operations
  const networkRetryConfig: RetryConfig = {
    maxRetries: RETRY_ATTEMPTS,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: RETRY_BACKOFF_RATE,
    jitter: true
  };

  try {
    // Step 1: Scrape content with network resilience
    const networkStart = Date.now();
    const directResult = await errorResilienceService.executeWithRetry(
      () => scrapeWithCheerio(url),
      'network-requests',
      networkRetryConfig,
      errorContext
    );
    networkTime = Date.now() - networkStart;

    // Step 2: Enhance with Bedrock (with graceful degradation)
    const bedrockStart = Date.now();
    const enhancedResult = await errorResilienceService.executeWithGracefulDegradation(
      () => enhanceContentWithBedrock(directResult),
      () => Promise.resolve(directResult), // Fallback: use original content without Bedrock enhancement
      'bedrock-embeddings',
      errorContext
    );
    bedrockTime = Date.now() - bedrockStart;

    const totalTime = Date.now() - startTime;

    return {
      ...enhancedResult,
      processingMetrics: {
        networkTime,
        bedrockTime,
        storageTime,
        totalTime
      },
      retryAttempts,
      circuitBreakerTriggered,
      rateLimited
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    return {
      url,
      title: '',
      content: '',
      extractedAt: new Date().toISOString(),
      contentType: 'article',
      wordCount: 0,
      links: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingMetrics: {
        networkTime,
        bedrockTime,
        storageTime,
        totalTime
      },
      retryAttempts,
      circuitBreakerTriggered,
      rateLimited
    };
  }
}

async function storeContentInS3WithResilience(result: CrawlResult, errorContext: ErrorContext): Promise<void> {
  const storageStart = Date.now();
  
  try {
    await errorResilienceService.executeWithCircuitBreaker(
      () => storeContentInS3(result),
      's3-vectors',
      errorContext
    );
    
    console.log(`Content stored successfully for ${result.url} in ${Date.now() - storageStart}ms`);
    
    // ENCRYPTION VALIDATION - Requirement 6.3: Validate encryption for stored content
    const objectKey = `scraped-content/${new Date().toISOString().split('T')[0]}/${encodeURIComponent(result.url)}.json`;
    
    try {
      console.log(`Validating encryption for stored content: ${objectKey}`);
      const encryptionValidation = await securityValidationService.validateEncryption(CONTENT_BUCKET, objectKey);
      
      if (!encryptionValidation.compliance.meetsRequirements) {
        console.error(`Encryption validation failed for ${objectKey}:`, encryptionValidation.compliance.issues);
        
        // Log security event but don't fail the operation
        await securityValidationService.logAuditEvent({
          timestamp: new Date().toISOString(),
          executionId: errorContext.requestId,
          action: 'encryption_compliance_failure',
          resource: `s3://${CONTENT_BUCKET}/${objectKey}`,
          result: 'failure',
          details: {
            encryptionValidation,
            url: result.url
          },
          securityLevel: 'high'
        });
      } else {
        console.log(`Encryption validation passed for ${objectKey}`);
      }
    } catch (encryptionError) {
      console.error(`Encryption validation error for ${objectKey}:`, encryptionError);
      // Don't fail the main operation for encryption validation errors
    }
    
  } catch (error) {
    console.error(`Failed to store content for ${result.url}:`, error);
    throw error;
  }
}

async function sendFailureNotification(partialSuccessReport: PartialSuccessReport, errorContext: ErrorContext): Promise<void> {
  try {
    const message = {
      subject: `ADA Clara Crawler Partial Failure - ${partialSuccessReport.executionId}`,
      executionId: partialSuccessReport.executionId,
      timestamp: partialSuccessReport.timestamp,
      successRate: partialSuccessReport.successRate,
      totalOperations: partialSuccessReport.totalOperations,
      failedOperations: partialSuccessReport.failedOperations,
      errorSummary: partialSuccessReport.errors.byType,
      recommendations: partialSuccessReport.recommendations,
      systemHealth: partialSuccessReport.systemHealth,
      retryableOperations: partialSuccessReport.retryableOperations
    };

    await sns.send(new PublishCommand({
      TopicArn: FAILURE_NOTIFICATION_TOPIC,
      Subject: message.subject,
      Message: JSON.stringify(message, null, 2)
    }));

    console.log('Failure notification sent successfully');

  } catch (error) {
    console.error('Failed to send failure notification:', error);
  }
}

async function sendCriticalFailureNotification(error: Error, executionId: string): Promise<void> {
  try {
    const message = {
      subject: `ADA Clara Crawler Critical Failure - ${executionId}`,
      executionId,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      systemHealth: errorResilienceService.getSystemHealthSummary()
    };

    await sns.send(new PublishCommand({
      TopicArn: FAILURE_NOTIFICATION_TOPIC,
      Subject: message.subject,
      Message: JSON.stringify(message, null, 2)
    }));

    console.log('Critical failure notification sent successfully');

  } catch (notificationError) {
    console.error('Failed to send critical failure notification:', notificationError);
  }
}

function generateEnhancedCrawlReport(
  results: EnhancedCrawlResult[], 
  partialSuccessReport: PartialSuccessReport,
  contentChanges: ContentChangesSummary[]
) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const contentTypes = successful.reduce((acc, r) => {
    acc[r.contentType] = (acc[r.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgWordCount = successful.length > 0 
    ? successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length 
    : 0;
  
  const totalLinks = successful.reduce((sum, r) => sum + r.links.length, 0);
  
  // Performance metrics
  const avgProcessingTime = results.length > 0
    ? results.reduce((sum, r) => sum + r.processingMetrics.totalTime, 0) / results.length
    : 0;
  
  const avgNetworkTime = results.length > 0
    ? results.reduce((sum, r) => sum + r.processingMetrics.networkTime, 0) / results.length
    : 0;
  
  const avgBedrockTime = results.length > 0
    ? results.reduce((sum, r) => sum + r.processingMetrics.bedrockTime, 0) / results.length
    : 0;

  // Content change analysis
  const changesByType = contentChanges.reduce((acc, change) => {
    acc[change.changeType] = (acc[change.changeType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    // Basic metrics
    totalUrls: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    
    // Content metrics
    contentTypes,
    averageWordCount: Math.round(avgWordCount),
    totalLinksFound: totalLinks,
    
    // Performance metrics
    performance: {
      averageProcessingTime: Math.round(avgProcessingTime),
      averageNetworkTime: Math.round(avgNetworkTime),
      averageBedrockTime: Math.round(avgBedrockTime),
      totalRetryAttempts: results.reduce((sum, r) => sum + r.retryAttempts, 0),
      circuitBreakerTriggered: results.some(r => r.circuitBreakerTriggered),
      rateLimitingApplied: results.some(r => r.rateLimited)
    },
    
    // Content change analysis
    contentChanges: {
      total: contentChanges.length,
      byType: changesByType,
      processed: contentChanges.filter(c => c.processingDecision === 'processed').length,
      skipped: contentChanges.filter(c => c.processingDecision === 'skipped').length,
      failed: contentChanges.filter(c => c.processingDecision === 'failed').length
    },
    
    // Error analysis
    errors: failed.map(r => ({ url: r.url, error: r.error })),
    bedrockEnhanced: successful.filter(r => r.metadata?.enhancedWithBedrock).length,
    bedrockErrors: successful.filter(r => r.metadata?.bedrockError).length,
    
    // Resilience metrics
    partialSuccessReport,
    systemHealth: errorResilienceService.getSystemHealthSummary()
  };
}

async function scrapeWithCheerio(url: string): Promise<CrawlResult> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'ADA-Clara-Bot/1.0 (Educational/Medical Content Crawler)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 30000,
  });
  
  const $ = cheerio.load(response.data);
  
  // Remove script and style elements
  $('script, style, nav, footer, .advertisement, .ads').remove();
  
  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
  
  // Extract main content - try multiple selectors
  const contentSelectors = [
    'main',
    '.main-content',
    '.content',
    '.article-content',
    '.post-content',
    'article',
    '.entry-content'
  ];
  
  let content = '';
  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text().trim();
      break;
    }
  }
  
  // Fallback to body if no main content found
  if (!content) {
    content = $('body').text().trim();
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  // Extract links
  const links: string[] = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && href.includes(TARGET_DOMAIN)) {
      links.push(href);
    }
  });
  
  // Determine content type based on URL and content
  const contentType = determineContentType(url, title, content);
  
  return {
    url,
    title,
    content,
    extractedAt: new Date().toISOString(),
    contentType,
    wordCount: content.split(/\s+/).length,
    links: [...new Set(links)], // Remove duplicates
    success: true
  };
}

async function enhanceContentWithBedrock(crawlResult: CrawlResult): Promise<CrawlResult> {
  if (!crawlResult.success || !crawlResult.content) {
    return crawlResult;
  }
  
  try {
    // Use Bedrock to clean and structure the content
    const prompt = `
You are a content processor for a medical information system. Please analyze and clean the following web content from diabetes.org:

Title: ${crawlResult.title}
URL: ${crawlResult.url}
Raw Content: ${crawlResult.content.substring(0, 4000)}...

Please:
1. Extract the main medical/educational content, removing navigation, ads, and boilerplate text
2. Identify the content type (article, FAQ, resource, event)
3. Provide a clean, structured version of the content
4. Maintain all important medical information and facts

Respond in JSON format:
{
  "cleanedContent": "cleaned content here",
  "contentType": "article|faq|resource|event",
  "keyTopics": ["topic1", "topic2"],
  "medicalFacts": ["fact1", "fact2"],
  "confidence": 0.95
}
`;

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    
    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Parse Bedrock response
    let bedrockAnalysis;
    try {
      bedrockAnalysis = JSON.parse(responseBody.content[0].text);
    } catch {
      // If JSON parsing fails, use the raw response
      bedrockAnalysis = {
        cleanedContent: responseBody.content[0].text,
        contentType: crawlResult.contentType,
        keyTopics: [],
        medicalFacts: [],
        confidence: 0.5
      };
    }
    
    // Update the crawl result with Bedrock enhancements
    return {
      ...crawlResult,
      content: bedrockAnalysis.cleanedContent || crawlResult.content,
      contentType: bedrockAnalysis.contentType || crawlResult.contentType,
      wordCount: (bedrockAnalysis.cleanedContent || crawlResult.content).split(/\s+/).length,
      // Add metadata from Bedrock analysis
      metadata: {
        keyTopics: bedrockAnalysis.keyTopics || [],
        medicalFacts: bedrockAnalysis.medicalFacts || [],
        bedrockConfidence: bedrockAnalysis.confidence || 0,
        enhancedWithBedrock: true
      }
    };
    
  } catch (error) {
    console.error('Bedrock enhancement failed:', error);
    // Return original result if Bedrock fails
    return {
      ...crawlResult,
      metadata: {
        enhancedWithBedrock: false,
        bedrockError: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

function determineContentType(url: string, title: string, content: string): 'article' | 'faq' | 'resource' | 'event' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  if (urlLower.includes('faq') || titleLower.includes('faq') || 
      contentLower.includes('frequently asked') || contentLower.includes('common questions')) {
    return 'faq';
  }
  
  if (urlLower.includes('event') || urlLower.includes('calendar') || 
      titleLower.includes('event') || contentLower.includes('register')) {
    return 'event';
  }
  
  if (urlLower.includes('resource') || urlLower.includes('tool') || 
      titleLower.includes('resource') || titleLower.includes('tool')) {
    return 'resource';
  }
  
  return 'article';
}

async function storeContentInS3(result: CrawlResult): Promise<void> {
  const key = `scraped-content/${new Date().toISOString().split('T')[0]}/${encodeURIComponent(result.url)}.json`;
  
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: key,
    Body: JSON.stringify(result, null, 2),
    ContentType: 'application/json',
    Metadata: {
      url: result.url,
      contentType: result.contentType,
      extractedAt: result.extractedAt,
      wordCount: result.wordCount.toString(),
    }
  });
  
  await s3.send(command);
  console.log(`Stored content in S3: ${key}`);
}

function generateCrawlReport(results: CrawlResult[]) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const contentTypes = successful.reduce((acc, r) => {
    acc[r.contentType] = (acc[r.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgWordCount = successful.length > 0 
    ? successful.reduce((sum, r) => sum + r.wordCount, 0) / successful.length 
    : 0;
  
  const totalLinks = successful.reduce((sum, r) => sum + r.links.length, 0);
  
  return {
    totalUrls: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    contentTypes,
    averageWordCount: Math.round(avgWordCount),
    totalLinksFound: totalLinks,
    errors: failed.map(r => ({ url: r.url, error: r.error })),
    bedrockEnhanced: successful.filter(r => r.metadata?.enhancedWithBedrock).length,
    bedrockErrors: successful.filter(r => r.metadata?.bedrockError).length
  };
}