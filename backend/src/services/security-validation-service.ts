/**
 * Security Validation Service
 * 
 * Provides comprehensive security validation for web crawling operations
 * including URL validation, rate limiting, robots.txt compliance, and encryption validation.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

export interface URLValidationResult {
  isValid: boolean;
  domain: string;
  reason?: string;
  securityLevel: 'low' | 'medium' | 'high';
}

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  currentRequests: number;
  windowStart: Date;
}

export interface EncryptionValidationResult {
  compliance: {
    meetsRequirements: boolean;
    encryptionType: string;
    issues: string[];
  };
  details: {
    serverSideEncryption: boolean;
    encryptionAlgorithm?: string;
    keyManagement?: string;
  };
}

export interface RobotsTxtValidation {
  compliant: boolean;
  crawlDelay?: number;
  rules: string[];
  userAgent: string;
}

export interface AuditLogEntry {
  timestamp: string;
  executionId: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'warning';
  details: any;
  securityLevel: 'low' | 'medium' | 'high';
}

export class SecurityValidationService {
  private s3Client: S3Client;
  private dynamoClient: DynamoDBDocumentClient;
  private rateLimitTable: string;
  private auditLogTable: string;
  private allowedDomains: Set<string>;
  private rateLimitWindow: number; // milliseconds
  private maxRequestsPerWindow: number;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    
    this.rateLimitTable = process.env.RATE_LIMIT_TABLE || 'ada-clara-rate-limits';
    this.auditLogTable = process.env.AUDIT_LOG_TABLE || 'ada-clara-audit-logs';
    
    // Configure allowed domains (diabetes.org and subdomains)
    this.allowedDomains = new Set([
      'diabetes.org',
      'www.diabetes.org',
      'professional.diabetes.org',
      'shop.diabetes.org'
    ]);
    
    // Rate limiting configuration
    this.rateLimitWindow = 60 * 1000; // 1 minute
    this.maxRequestsPerWindow = 10; // 10 requests per minute per domain
  }

  /**
   * Validate URL against security policies
   */
  async validateURL(url: string): Promise<URLValidationResult> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      
      // Check if domain is in allowlist
      if (!this.allowedDomains.has(domain)) {
        return {
          isValid: false,
          domain,
          reason: `Domain ${domain} is not in the allowed domains list`,
          securityLevel: 'high'
        };
      }
      
      // Check for suspicious URL patterns
      const suspiciousPatterns = [
        /admin/i,
        /login/i,
        /password/i,
        /private/i,
        /internal/i,
        /\.php$/i,
        /\.asp$/i,
        /\.jsp$/i
      ];
      
      const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
        pattern.test(url)
      );
      
      if (hasSuspiciousPattern) {
        return {
          isValid: false,
          domain,
          reason: 'URL contains suspicious patterns that may indicate sensitive areas',
          securityLevel: 'medium'
        };
      }
      
      // Check protocol
      if (urlObj.protocol !== 'https:') {
        return {
          isValid: false,
          domain,
          reason: 'Only HTTPS URLs are allowed for security',
          securityLevel: 'medium'
        };
      }
      
      return {
        isValid: true,
        domain,
        securityLevel: 'low'
      };
      
    } catch (error) {
      return {
        isValid: false,
        domain: 'invalid',
        reason: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        securityLevel: 'high'
      };
    }
  }

  /**
   * Check rate limiting for a domain
   */
  async checkRateLimit(domain: string): Promise<RateLimitResult> {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.rateLimitWindow);
      
      // Get current rate limit record
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.rateLimitTable,
        Key: {
          pk: `DOMAIN#${domain}`,
          sk: 'RATE_LIMIT'
        }
      }));
      
      let currentRequests = 0;
      let recordWindowStart = windowStart;
      
      if (result.Item) {
        const lastWindowStart = new Date(result.Item.windowStart);
        
        // If we're still in the same window, use existing count
        if (lastWindowStart > windowStart) {
          currentRequests = result.Item.currentRequests || 0;
          recordWindowStart = lastWindowStart;
        }
        // Otherwise, start a new window
      }
      
      const allowed = currentRequests < this.maxRequestsPerWindow;
      const remainingRequests = Math.max(0, this.maxRequestsPerWindow - currentRequests);
      const resetTime = new Date(recordWindowStart.getTime() + this.rateLimitWindow);
      
      // Update the rate limit record if request is allowed
      if (allowed) {
        await this.dynamoClient.send(new PutCommand({
          TableName: this.rateLimitTable,
          Item: {
            pk: `DOMAIN#${domain}`,
            sk: 'RATE_LIMIT',
            domain,
            currentRequests: currentRequests + 1,
            windowStart: recordWindowStart.toISOString(),
            lastRequest: now.toISOString(),
            updatedAt: now.toISOString()
          }
        }));
      }
      
      return {
        allowed,
        remainingRequests: allowed ? remainingRequests - 1 : remainingRequests,
        resetTime,
        currentRequests: allowed ? currentRequests + 1 : currentRequests,
        windowStart: recordWindowStart
      };
      
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Default to allowing the request if rate limiting fails
      return {
        allowed: true,
        remainingRequests: this.maxRequestsPerWindow - 1,
        resetTime: new Date(Date.now() + this.rateLimitWindow),
        currentRequests: 1,
        windowStart: new Date()
      };
    }
  }

  /**
   * Validate robots.txt compliance
   */
  async validateRobotsTxt(domain: string): Promise<RobotsTxtValidation> {
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'ADA-Clara-Bot/1.0'
        }
      });
      
      const robotsContent = response.data;
      const lines = robotsContent.split('\n').map((line: string) => line.trim());
      
      let currentUserAgent = '';
      let crawlDelay: number | undefined;
      const rules: string[] = [];
      let compliant = true;
      
      for (const line of lines) {
        if (line.startsWith('User-agent:')) {
          currentUserAgent = line.substring(11).trim().toLowerCase();
        } else if (line.startsWith('Crawl-delay:') && 
                  (currentUserAgent === '*' || currentUserAgent === 'ada-clara-bot')) {
          crawlDelay = parseInt(line.substring(12).trim());
        } else if (line.startsWith('Disallow:') && 
                  (currentUserAgent === '*' || currentUserAgent === 'ada-clara-bot')) {
          const disallowPath = line.substring(9).trim();
          rules.push(`Disallow: ${disallowPath}`);
          
          // Check if our typical crawl paths are disallowed
          if (disallowPath === '/' || disallowPath === '*') {
            compliant = false;
          }
        }
      }
      
      return {
        compliant,
        crawlDelay,
        rules,
        userAgent: 'ADA-Clara-Bot/1.0'
      };
      
    } catch (error) {
      console.warn(`Could not fetch robots.txt for ${domain}:`, error);
      // If robots.txt is not accessible, assume compliance
      return {
        compliant: true,
        rules: [],
        userAgent: 'ADA-Clara-Bot/1.0'
      };
    }
  }

  /**
   * Validate encryption for stored content
   */
  async validateEncryption(bucketName: string, objectKey: string): Promise<EncryptionValidationResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      });
      
      const response = await this.s3Client.send(command);
      
      const serverSideEncryption = !!response.ServerSideEncryption;
      const encryptionAlgorithm = response.ServerSideEncryption;
      const keyManagement = response.SSEKMSKeyId ? 'KMS' : 'S3';
      
      const issues: string[] = [];
      let meetsRequirements = true;
      
      if (!serverSideEncryption) {
        issues.push('No server-side encryption detected');
        meetsRequirements = false;
      }
      
      if (encryptionAlgorithm && encryptionAlgorithm !== 'AES256' && encryptionAlgorithm !== 'aws:kms') {
        issues.push(`Unsupported encryption algorithm: ${encryptionAlgorithm}`);
        meetsRequirements = false;
      }
      
      return {
        compliance: {
          meetsRequirements,
          encryptionType: encryptionAlgorithm || 'none',
          issues
        },
        details: {
          serverSideEncryption,
          encryptionAlgorithm,
          keyManagement
        }
      };
      
    } catch (error) {
      return {
        compliance: {
          meetsRequirements: false,
          encryptionType: 'unknown',
          issues: [`Encryption validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
        },
        details: {
          serverSideEncryption: false
        }
      };
    }
  }

  /**
   * Log security audit events
   */
  async logAuditEvent(entry: AuditLogEntry): Promise<void> {
    try {
      const auditRecord = {
        pk: `AUDIT#${entry.executionId}`,
        sk: `EVENT#${entry.timestamp}`,
        ...entry,
        createdAt: new Date().toISOString()
      };
      
      await this.dynamoClient.send(new PutCommand({
        TableName: this.auditLogTable,
        Item: auditRecord
      }));
      
      console.log(`Security audit event logged: ${entry.action} - ${entry.result}`);
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw error to avoid breaking main operation
    }
  }

  /**
   * Get security configuration
   */
  getSecurityConfig(): {
    allowedDomains: string[];
    rateLimitWindow: number;
    maxRequestsPerWindow: number;
  } {
    return {
      allowedDomains: Array.from(this.allowedDomains),
      rateLimitWindow: this.rateLimitWindow,
      maxRequestsPerWindow: this.maxRequestsPerWindow
    };
  }

  /**
   * Update allowed domains (for configuration management)
   */
  updateAllowedDomains(domains: string[]): void {
    this.allowedDomains = new Set(domains.map(d => d.toLowerCase()));
    console.log('Updated allowed domains:', Array.from(this.allowedDomains));
  }

  /**
   * Update rate limiting configuration
   */
  updateRateLimitConfig(windowMs: number, maxRequests: number): void {
    this.rateLimitWindow = windowMs;
    this.maxRequestsPerWindow = maxRequests;
    console.log(`Updated rate limit config: ${maxRequests} requests per ${windowMs}ms`);
  }
}