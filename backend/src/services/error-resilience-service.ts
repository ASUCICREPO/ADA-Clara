import { 
  RetryConfig, 
  CircuitBreakerState, 
  ErrorContext, 
  CrawlerError,
  HealthCheckResult 
} from '../types/index';

/**
 * Error Handling and Resilience Service for Weekly Crawler Scheduling
 * 
 * Implements comprehensive error handling patterns:
 * - Exponential backoff retry logic for network failures
 * - Circuit breaker pattern for S3 Vectors storage failures  
 * - Rate limiting for Bedrock embedding API calls
 * - Partial success reporting with detailed failure information
 * - Graceful degradation for content detection failures
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export class ErrorResilienceService {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private healthChecks: Map<string, HealthCheckResult> = new Map();

  // Default retry configuration
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2.0,
    jitter: true
  };

  // Circuit breaker thresholds
  private readonly CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 3;

  constructor() {
    // Initialize circuit breakers for key services
    this.initializeCircuitBreaker('s3-vectors');
    this.initializeCircuitBreaker('bedrock-embeddings');
    this.initializeCircuitBreaker('content-detection');
    this.initializeCircuitBreaker('network-requests');

    // Initialize rate limiters
    this.initializeRateLimiter('bedrock-embeddings', 10, 1000); // 10 requests per second
    this.initializeRateLimiter('network-requests', 5, 1000); // 5 requests per second
    this.initializeRateLimiter('s3-vectors', 100, 1000); // 100 requests per second
  }

  /**
   * Execute operation with exponential backoff retry logic
   * Requirement 5.1: Exponential backoff retry logic for network failures
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    serviceName: string,
    config: Partial<RetryConfig> = {},
    context?: ErrorContext
  ): Promise<T> {
    const retryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Check circuit breaker before attempting operation
        if (!this.isCircuitBreakerClosed(serviceName)) {
          throw new Error(`Circuit breaker is open for service: ${serviceName}`);
        }

        // Apply rate limiting
        await this.applyRateLimit(serviceName);

        // Execute the operation
        const result = await operation();
        
        // Record success for circuit breaker
        this.recordSuccess(serviceName);
        
        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Record failure for circuit breaker
        this.recordFailure(serviceName);

        // Log error with context
        this.logError(error as Error, serviceName, attempt, context);

        // Don't retry on final attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateBackoffDelay(attempt, retryConfig);
        
        console.log(`Retrying ${serviceName} operation in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`);
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    if (!lastError) {
      throw new Error(`Operation failed after ${retryConfig.maxRetries} retries: Unknown error`);
    }
    throw new Error(`Operation failed after ${retryConfig.maxRetries} retries: ${lastError.message}`);
  }

  /**
   * Execute operation with circuit breaker protection
   * Requirement 5.2: Circuit breaker pattern for S3 Vectors storage failures
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string,
    context?: ErrorContext
  ): Promise<T> {
    // Initialize circuit breaker if it doesn't exist
    if (!this.circuitBreakers.has(serviceName)) {
      this.initializeCircuitBreaker(serviceName);
    }
    
    const circuitBreaker = this.circuitBreakers.get(serviceName)!;

    // Check circuit breaker state
    if (circuitBreaker.state === 'open') {
      const now = Date.now();
      if (now < (circuitBreaker.nextAttemptTime || 0)) {
        throw new Error(`Circuit breaker is open for ${serviceName}. Next attempt at ${new Date(circuitBreaker.nextAttemptTime!)}`);
      }
      
      // Transition to half-open state
      circuitBreaker.state = 'half-open';
      circuitBreaker.successCount = 0;
    }

    try {
      const result = await operation();
      
      // Record success
      this.recordSuccess(serviceName);
      
      return result;

    } catch (error) {
      // Record failure
      this.recordFailure(serviceName);
      
      // Log error with context
      this.logError(error as Error, serviceName, 0, context);
      
      throw error;
    }
  }

  /**
   * Apply rate limiting for API calls
   * Requirement 5.3: Rate limiting for Bedrock embedding API calls
   */
  async applyRateLimit(serviceName: string): Promise<void> {
    const rateLimiter = this.rateLimiters.get(serviceName);
    
    if (!rateLimiter) {
      return; // No rate limiting configured for this service
    }

    await rateLimiter.acquire();
  }

  /**
   * Create partial success report with detailed failure information
   * Requirement 5.4: Partial success reporting with detailed failure information
   */
  createPartialSuccessReport(
    totalOperations: number,
    successfulOperations: number,
    errors: CrawlerError[],
    executionId: string
  ): PartialSuccessReport {
    const failedOperations = totalOperations - successfulOperations;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    // Categorize errors by type
    const errorsByType = errors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Identify recoverable vs non-recoverable errors
    const recoverableErrors = errors.filter(e => e.recoverable);
    const nonRecoverableErrors = errors.filter(e => !e.recoverable);

    return {
      executionId,
      timestamp: new Date().toISOString(),
      totalOperations,
      successfulOperations,
      failedOperations,
      successRate,
      partialSuccess: successfulOperations > 0 && failedOperations > 0,
      errors: {
        total: errors.length,
        byType: errorsByType,
        recoverable: recoverableErrors.length,
        nonRecoverable: nonRecoverableErrors.length,
        details: errors
      },
      recommendations: this.generateRecoveryRecommendations(errors),
      retryableOperations: recoverableErrors.map(e => e.url),
      systemHealth: this.getSystemHealthSummary()
    };
  }

  /**
   * Implement graceful degradation for content detection failures
   * Requirement 5.5: Graceful degradation for content detection failures
   */
  async executeWithGracefulDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    serviceName: string,
    context?: ErrorContext
  ): Promise<T> {
    try {
      // Try primary operation first
      return await this.executeWithCircuitBreaker(primaryOperation, serviceName, context);
      
    } catch (primaryError) {
      const primaryErr = primaryError as Error;
      console.warn(`Primary operation failed for ${serviceName}, attempting fallback:`, primaryErr.message);
      
      try {
        // Attempt fallback operation
        const result = await fallbackOperation();
        
        // Log successful degradation
        console.log(`Graceful degradation successful for ${serviceName}`);
        
        return result;
        
      } catch (fallbackError) {
        const fallbackErr = fallbackError as Error;
        // Both operations failed
        console.error(`Both primary and fallback operations failed for ${serviceName}`);
        
        // Create comprehensive error context
        const enhancedContext: ErrorContext = {
          ...context,
          requestId: context?.requestId || `req_${Date.now()}`,
          endpoint: serviceName,
          method: 'graceful-degradation',
          parameters: { primaryError: primaryErr.message, fallbackError: fallbackErr.message },
          timestamp: new Date().toISOString(),
          additionalInfo: {
            primaryError: primaryErr.message,
            fallbackError: fallbackErr.message,
            circuitBreakerState: this.circuitBreakers.get(serviceName)?.state,
            systemHealth: this.getSystemHealthSummary()
          }
        };
        
        this.logError(fallbackErr, serviceName, 0, enhancedContext);
        
        throw new Error(`Graceful degradation failed for ${serviceName}: ${fallbackErr.message}`);
      }
    }
  }

  /**
   * Get health status for all monitored services
   */
  getSystemHealthSummary(): SystemHealthSummary {
    const services = Array.from(this.circuitBreakers.keys());
    const healthyServices = services.filter(service => this.isServiceHealthy(service));
    const degradedServices = services.filter(service => this.isServiceDegraded(service));
    const unhealthyServices = services.filter(service => !this.isServiceHealthy(service) && !this.isServiceDegraded(service));

    return {
      timestamp: new Date().toISOString(),
      overallStatus: unhealthyServices.length > 0 ? 'unhealthy' : 
                   degradedServices.length > 0 ? 'degraded' : 'healthy',
      totalServices: services.length,
      healthyServices: healthyServices.length,
      degradedServices: degradedServices.length,
      unhealthyServices: unhealthyServices.length,
      serviceDetails: services.map(service => ({
        name: service,
        status: this.getServiceStatus(service),
        circuitBreakerState: this.circuitBreakers.get(service)?.state || 'unknown',
        failureCount: this.circuitBreakers.get(service)?.failureCount || 0,
        lastFailureTime: this.circuitBreakers.get(service)?.lastFailureTime
      }))
    };
  }

  /**
   * Initialize circuit breaker for a service
   */
  private initializeCircuitBreaker(serviceName: string): void {
    this.circuitBreakers.set(serviceName, {
      serviceName,
      state: 'closed',
      failureCount: 0,
      successCount: 0
    });
  }

  /**
   * Initialize rate limiter for a service
   */
  private initializeRateLimiter(serviceName: string, maxRequests: number, windowMs: number): void {
    this.rateLimiters.set(serviceName, new RateLimiter(maxRequests, windowMs));
  }

  /**
   * Check if circuit breaker is closed (allowing requests)
   */
  private isCircuitBreakerClosed(serviceName: string): boolean {
    // Initialize circuit breaker if it doesn't exist
    if (!this.circuitBreakers.has(serviceName)) {
      this.initializeCircuitBreaker(serviceName);
    }
    
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    return circuitBreaker?.state === 'closed' || circuitBreaker?.state === 'half-open';
  }

  /**
   * Record successful operation for circuit breaker
   */
  private recordSuccess(serviceName: string): void {
    // Initialize circuit breaker if it doesn't exist
    if (!this.circuitBreakers.has(serviceName)) {
      this.initializeCircuitBreaker(serviceName);
    }
    
    const circuitBreaker = this.circuitBreakers.get(serviceName)!;

    if (circuitBreaker.state === 'half-open') {
      circuitBreaker.successCount = (circuitBreaker.successCount || 0) + 1;
      
      if (circuitBreaker.successCount >= this.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
        // Transition back to closed state
        circuitBreaker.state = 'closed';
        circuitBreaker.failureCount = 0;
        circuitBreaker.successCount = 0;
        console.log(`Circuit breaker for ${serviceName} transitioned to CLOSED state`);
      }
    } else if (circuitBreaker.state === 'closed') {
      // Reset failure count on success
      circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record failed operation for circuit breaker
   */
  private recordFailure(serviceName: string): void {
    // Initialize circuit breaker if it doesn't exist
    if (!this.circuitBreakers.has(serviceName)) {
      this.initializeCircuitBreaker(serviceName);
    }
    
    const circuitBreaker = this.circuitBreakers.get(serviceName)!;

    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();

    if (circuitBreaker.state === 'closed' && 
        circuitBreaker.failureCount >= this.CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      // Transition to open state
      circuitBreaker.state = 'open';
      circuitBreaker.nextAttemptTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
      console.log(`Circuit breaker for ${serviceName} transitioned to OPEN state`);
    } else if (circuitBreaker.state === 'half-open') {
      // Transition back to open state
      circuitBreaker.state = 'open';
      circuitBreaker.nextAttemptTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
      console.log(`Circuit breaker for ${serviceName} transitioned back to OPEN state`);
    }
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    if (config.jitter) {
      // Add random jitter (±25% of the delay)
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log error with enhanced context
   */
  private logError(error: Error, serviceName: string, attempt: number, context?: ErrorContext): void {
    const errorLog = {
      timestamp: new Date().toISOString(),
      serviceName,
      attempt,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      context,
      circuitBreakerState: this.circuitBreakers.get(serviceName)?.state,
      systemHealth: this.getSystemHealthSummary()
    };

    console.error('Service error:', JSON.stringify(errorLog, null, 2));
  }

  /**
   * Generate recovery recommendations based on error patterns
   */
  private generateRecoveryRecommendations(errors: CrawlerError[]): string[] {
    const recommendations: string[] = [];
    const errorsByType = errors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Network error recommendations
    if (errorsByType.network > 0) {
      recommendations.push('Check network connectivity and DNS resolution');
      recommendations.push('Verify target URLs are accessible');
      if (errorsByType.network > 5) {
        recommendations.push('Consider implementing longer retry delays for network operations');
      }
    }

    // Storage error recommendations
    if (errorsByType.storage > 0) {
      recommendations.push('Verify S3 Vectors service availability and permissions');
      recommendations.push('Check AWS service health dashboard');
      if (errorsByType.storage > 3) {
        recommendations.push('Consider implementing circuit breaker for S3 Vectors operations');
      }
    }

    // Embedding error recommendations
    if (errorsByType.embedding > 0) {
      recommendations.push('Check Bedrock service limits and quotas');
      recommendations.push('Verify embedding model availability');
      if (errorsByType.embedding > 10) {
        recommendations.push('Implement more aggressive rate limiting for Bedrock API calls');
      }
    }

    // Parsing error recommendations
    if (errorsByType.parsing > 0) {
      recommendations.push('Review content structure and parsing logic');
      recommendations.push('Implement more robust content extraction methods');
    }

    // Validation error recommendations
    if (errorsByType.validation > 0) {
      recommendations.push('Review input validation rules and data quality');
      recommendations.push('Implement data sanitization and normalization');
    }

    // General recommendations
    if (errors.length > 10) {
      recommendations.push('Consider reducing batch size to improve success rate');
      recommendations.push('Implement progressive backoff for high error rates');
    }

    return recommendations;
  }

  /**
   * Check if service is healthy
   */
  private isServiceHealthy(serviceName: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    return circuitBreaker?.state === 'closed' && (circuitBreaker.failureCount || 0) < 2;
  }

  /**
   * Check if service is degraded
   */
  private isServiceDegraded(serviceName: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    return circuitBreaker?.state === 'closed' && (circuitBreaker.failureCount || 0) >= 2 && (circuitBreaker.failureCount || 0) < this.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
  }

  /**
   * Get service status
   */
  private getServiceStatus(serviceName: string): 'healthy' | 'degraded' | 'unhealthy' {
    if (this.isServiceHealthy(serviceName)) return 'healthy';
    if (this.isServiceDegraded(serviceName)) return 'degraded';
    return 'unhealthy';
  }
}

/**
 * Rate Limiter implementation using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.refillRate = maxRequests / windowMs;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Wait for next token
    const waitTime = (1 - this.tokens) / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.refillTokens();
    this.tokens--;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Partial Success Report interface
 */
export interface PartialSuccessReport {
  executionId: string;
  timestamp: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  partialSuccess: boolean;
  errors: {
    total: number;
    byType: Record<string, number>;
    recoverable: number;
    nonRecoverable: number;
    details: CrawlerError[];
  };
  recommendations: string[];
  retryableOperations: string[];
  systemHealth: SystemHealthSummary;
}

/**
 * System Health Summary interface
 */
export interface SystemHealthSummary {
  timestamp: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  unhealthyServices: number;
  serviceDetails: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    circuitBreakerState: string;
    failureCount: number;
    lastFailureTime?: number;
  }>;
}