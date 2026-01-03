import { ErrorResilienceService } from '../src/services/error-resilience-service';
import { CrawlerError, ErrorContext } from '../src/types/index';

describe('ErrorResilienceService', () => {
  let errorResilienceService: ErrorResilienceService;

  beforeEach(() => {
    errorResilienceService = new ErrorResilienceService();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt when operation succeeds', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorResilienceService.executeWithRetry(
        mockOperation,
        'test-service'
      );
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const result = await errorResilienceService.executeWithRetry(
        mockOperation,
        'test-service',
        { maxRetries: 3, baseDelay: 10, maxDelay: 100, backoffMultiplier: 2, jitter: false }
      );
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting all retries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(
        errorResilienceService.executeWithRetry(
          mockOperation,
          'test-service',
          { maxRetries: 2, baseDelay: 10, maxDelay: 100, backoffMultiplier: 2, jitter: false }
        )
      ).rejects.toThrow('Operation failed after 2 retries');
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('executeWithCircuitBreaker', () => {
    it('should execute operation when circuit breaker is closed', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorResilienceService.executeWithCircuitBreaker(
        mockOperation,
        'test-service'
      );
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should record failures and open circuit breaker after threshold', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Execute multiple failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await errorResilienceService.executeWithCircuitBreaker(mockOperation, 'test-service');
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Circuit breaker should now be open
      await expect(
        errorResilienceService.executeWithCircuitBreaker(mockOperation, 'test-service')
      ).rejects.toThrow('Circuit breaker is open');
    });
  });

  describe('createPartialSuccessReport', () => {
    it('should create comprehensive partial success report', () => {
      const errors: CrawlerError[] = [
        {
          url: 'https://example.com/1',
          errorType: 'network',
          errorMessage: 'Connection timeout',
          timestamp: new Date().toISOString(),
          retryAttempt: 1,
          recoverable: true
        },
        {
          url: 'https://example.com/2',
          errorType: 'parsing',
          errorMessage: 'Invalid HTML',
          timestamp: new Date().toISOString(),
          retryAttempt: 0,
          recoverable: false
        }
      ];

      const report = errorResilienceService.createPartialSuccessReport(
        10, // total operations
        8,  // successful operations
        errors,
        'test-execution-123'
      );

      expect(report.executionId).toBe('test-execution-123');
      expect(report.totalOperations).toBe(10);
      expect(report.successfulOperations).toBe(8);
      expect(report.failedOperations).toBe(2);
      expect(report.successRate).toBe(80);
      expect(report.partialSuccess).toBe(true);
      expect(report.errors.total).toBe(2);
      expect(report.errors.byType.network).toBe(1);
      expect(report.errors.byType.parsing).toBe(1);
      expect(report.errors.recoverable).toBe(1);
      expect(report.errors.nonRecoverable).toBe(1);
      expect(report.retryableOperations).toEqual(['https://example.com/1']);
      expect(report.recommendations).toContain('Check network connectivity and DNS resolution');
    });
  });

  describe('executeWithGracefulDegradation', () => {
    it('should use primary operation when it succeeds', async () => {
      const primaryOperation = jest.fn().mockResolvedValue('primary-success');
      const fallbackOperation = jest.fn().mockResolvedValue('fallback-success');
      
      const result = await errorResilienceService.executeWithGracefulDegradation(
        primaryOperation,
        fallbackOperation,
        'test-service'
      );
      
      expect(result).toBe('primary-success');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).not.toHaveBeenCalled();
    });

    it('should use fallback operation when primary fails', async () => {
      const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failure'));
      const fallbackOperation = jest.fn().mockResolvedValue('fallback-success');
      
      const result = await errorResilienceService.executeWithGracefulDegradation(
        primaryOperation,
        fallbackOperation,
        'test-service'
      );
      
      expect(result).toBe('fallback-success');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });

    it('should fail when both primary and fallback operations fail', async () => {
      const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failure'));
      const fallbackOperation = jest.fn().mockRejectedValue(new Error('Fallback failure'));
      
      await expect(
        errorResilienceService.executeWithGracefulDegradation(
          primaryOperation,
          fallbackOperation,
          'test-service'
        )
      ).rejects.toThrow('Graceful degradation failed for test-service');
      
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSystemHealthSummary', () => {
    it('should return system health summary', () => {
      const healthSummary = errorResilienceService.getSystemHealthSummary();
      
      expect(healthSummary).toHaveProperty('timestamp');
      expect(healthSummary).toHaveProperty('overallStatus');
      expect(healthSummary).toHaveProperty('totalServices');
      expect(healthSummary).toHaveProperty('healthyServices');
      expect(healthSummary).toHaveProperty('degradedServices');
      expect(healthSummary).toHaveProperty('unhealthyServices');
      expect(healthSummary).toHaveProperty('serviceDetails');
      expect(Array.isArray(healthSummary.serviceDetails)).toBe(true);
    });
  });

  describe('applyRateLimit', () => {
    it('should apply rate limiting for configured services', async () => {
      const startTime = Date.now();
      
      // Apply rate limit multiple times quickly
      await errorResilienceService.applyRateLimit('bedrock-embeddings');
      await errorResilienceService.applyRateLimit('bedrock-embeddings');
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take some time due to rate limiting
      expect(duration).toBeGreaterThan(50); // At least 50ms delay
    });

    it('should not apply rate limiting for unconfigured services', async () => {
      const startTime = Date.now();
      
      await errorResilienceService.applyRateLimit('unconfigured-service');
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should be immediate for unconfigured services
      expect(duration).toBeLessThan(10);
    });
  });
});