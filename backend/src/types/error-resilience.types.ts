/**
 * Error Resilience Types
 * 
 * Type definitions for error handling, circuit breakers, rate limiting,
 * and resilience patterns in the web scraper.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface CircuitBreakerState {
  serviceName: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount?: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

export interface ErrorContext {
  requestId: string;
  endpoint: string;
  method: string;
  parameters?: Record<string, any>;
  timestamp: string;
  additionalInfo?: Record<string, any>;
}

export interface CrawlerError {
  errorType: 'network' | 'storage' | 'embedding' | 'parsing' | 'validation' | 'unknown';
  message: string;
  url?: string;
  timestamp: string;
  recoverable: boolean;
  context?: ErrorContext;
  retryCount?: number;
  stackTrace?: string;
}

export interface HealthCheckResult {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  responseTime?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstAllowance?: number;
}

export interface ResilienceMetrics {
  serviceName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  circuitBreakerTrips: number;
  rateLimitHits: number;
  retryAttempts: number;
  timestamp: string;
}

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

export interface GracefulDegradationConfig {
  enableFallback: boolean;
  fallbackTimeout: number;
  fallbackRetries: number;
  degradationThreshold: number; // Failure rate threshold to trigger degradation
}

export interface ErrorRecoveryStrategy {
  errorType: string;
  strategy: 'retry' | 'circuit-breaker' | 'fallback' | 'skip';
  config: RetryConfig | CircuitBreakerState | GracefulDegradationConfig;
}

// Event types for monitoring and alerting
export interface ResilienceEvent {
  eventType: 'circuit_breaker_opened' | 'circuit_breaker_closed' | 'rate_limit_exceeded' | 'retry_exhausted' | 'fallback_triggered';
  serviceName: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string;
  metadata?: Record<string, any>;
}

export type ResilienceEventHandler = (event: ResilienceEvent) => void;