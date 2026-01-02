/**
 * Domain Discovery Types
 * 
 * Type definitions for comprehensive domain discovery targeting 15,000-20,000+ URLs
 * with advanced strategies for complete diabetes.org coverage.
 */

export interface DiscoveryOptions {
  maxUrls: number; // Target: 15,000-20,000+ for comprehensive coverage
  maxDepth: number; // Target: 5+ levels for deep discovery
  respectRobotsTxt: boolean;
  includeExternalLinks: boolean;
  relevanceThreshold: number; // 0-1, minimum relevance score
  allowedPathPatterns: string[];
  blockedPathPatterns: string[];
  medicalKeywords?: string[];
  fileExtensionBlacklist?: string[];
  rateLimitDelay?: number; // ms between requests
}

export interface DiscoveredUrl {
  url: string;
  discoveredAt: string;
  discoveryMethod: 'sitemap' | 'link-following' | 'path-generation' | 'archive-discovery' | 'manual';
  depth: number;
  parentUrl?: string;
  estimatedRelevance: number; // 0-1 score
  contentType?: string;
  lastModified?: string;
  changeFrequency?: string;
  priority?: number;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface RobotsTxtInfo {
  allowed: boolean;
  crawlDelay: number;
  sitemapUrls: string[];
  disallowedPaths: string[];
}

export interface ComprehensiveDiscoveryResult {
  totalUrls: number;
  discoveryBreakdown: {
    sitemaps: number;
    linkFollowing: number;
    pathGeneration: number;
    archiveDiscovery: number;
  };
  urls: DiscoveredUrl[];
  processingTime: number;
  coverageEstimate: number; // Percentage of estimated total coverage
}

export interface DiscoveryMetrics {
  urlsPerSecond: number;
  averageDepth: number;
  averageRelevance: number;
  duplicatesFiltered: number;
  errorRate: number;
  memoryUsage: number;
}

export interface DiscoveryEvent {
  eventType: 'url_discovered' | 'strategy_completed' | 'error_occurred' | 'rate_limited';
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string;
  metadata?: Record<string, any>;
}

// Strategy-specific configurations
export interface SitemapDiscoveryConfig {
  checkRobotsTxt: boolean;
  followNestedSitemaps: boolean;
  maxSitemapDepth: number;
  sitemapLocations: string[];
  timeout: number;
}

export interface LinkFollowingConfig {
  maxDepth: number;
  maxUrlsPerLevel: number;
  seedUrls: string[];
  followExternalLinks: boolean;
  respectNoFollow: boolean;
  extractFromJavaScript: boolean;
}

export interface PathGenerationConfig {
  useKnownPatterns: boolean;
  generateVariations: boolean;
  includeArchivePaths: boolean;
  maxPathDepth: number;
  pathTemplates: string[];
}

export interface ArchiveDiscoveryConfig {
  includeHistoricalContent: boolean;
  yearRange: [number, number];
  archivePatterns: string[];
  maxItemsPerArchive: number;
}

// Content analysis for URL relevance
export interface UrlRelevanceAnalysis {
  pathRelevance: number;
  keywordMatches: string[];
  medicalTermDensity: number;
  structuralIndicators: string[];
  estimatedContentType: string;
  confidenceScore: number;
}

// Performance monitoring
export interface DiscoveryPerformance {
  startTime: number;
  endTime: number;
  totalProcessingTime: number;
  urlsProcessed: number;
  urlsPerSecond: number;
  memoryPeakMB: number;
  networkRequests: number;
  cacheHitRate: number;
}

// Quality assessment
export interface DiscoveryQuality {
  coverageCompleteness: number; // 0-1 score
  urlQualityScore: number; // Average relevance
  duplicateRate: number;
  errorRate: number;
  strategyEffectiveness: Record<string, number>;
  recommendedImprovements: string[];
}

// Default configurations for comprehensive discovery
// Default comprehensive options for diabetes.org (realistic targets)
export const COMPREHENSIVE_DISCOVERY_OPTIONS: DiscoveryOptions = {
  maxUrls: 2500, // Realistic comprehensive coverage
  maxDepth: 4, // Balanced depth for good coverage
  respectRobotsTxt: true,
  includeExternalLinks: false,
  relevanceThreshold: 0.3, // Balanced threshold for good coverage
  allowedPathPatterns: [
    '/about-diabetes',
    '/living-with-diabetes',
    '/food-nutrition',
    '/health-wellness',
    '/tools-and-resources',
    '/community',
    '/professionals',
    '/research',
    '/news',
    '/blog',
    '/articles'
  ],
  blockedPathPatterns: [
    '/admin',
    '/login',
    '/api/internal',
    '/private',
    '/wp-admin',
    '/wp-content/uploads',
    '/search',
    '/cart',
    '/checkout',
    '/account',
    '/donate/payment',
    '/unsubscribe'
  ],
  medicalKeywords: [
    'diabetes', 'blood-sugar', 'insulin', 'glucose', 'health',
    'nutrition', 'food', 'exercise', 'medication', 'treatment',
    'symptoms', 'prevention', 'management', 'care', 'wellness'
  ],
  fileExtensionBlacklist: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
  rateLimitDelay: 1000 // 1 second between requests
};

export const FAST_DISCOVERY_OPTIONS: DiscoveryOptions = {
  maxUrls: 1000,
  maxDepth: 3,
  respectRobotsTxt: true,
  includeExternalLinks: false,
  relevanceThreshold: 0.5,
  allowedPathPatterns: ['/about-diabetes', '/living-with-diabetes', '/tools-and-resources'],
  blockedPathPatterns: ['/admin', '/login', '/search', '/cart'],
  rateLimitDelay: 500
};

export const MEDICAL_FOCUSED_OPTIONS: DiscoveryOptions = {
  maxUrls: 5000,
  maxDepth: 4,
  respectRobotsTxt: true,
  includeExternalLinks: false,
  relevanceThreshold: 0.6,
  allowedPathPatterns: [
    '/about-diabetes',
    '/living-with-diabetes',
    '/health-wellness',
    '/professionals'
  ],
  blockedPathPatterns: ['/admin', '/login', '/search', '/cart', '/donate'],
  medicalKeywords: [
    'diabetes', 'insulin', 'glucose', 'a1c', 'symptoms', 'treatment',
    'medication', 'complications', 'management', 'monitoring'
  ],
  rateLimitDelay: 800
};

// Strategy effectiveness tracking
export interface StrategyEffectiveness {
  strategyName: string;
  urlsDiscovered: number;
  uniqueUrls: number;
  averageRelevance: number;
  processingTime: number;
  successRate: number;
  costEffectiveness: number; // URLs per second
}

// Discovery validation
export interface DiscoveryValidation {
  isValid: boolean;
  coverageAdequate: boolean; // >= 15,000 URLs for comprehensive
  qualityAcceptable: boolean;
  performanceAcceptable: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  recommendations: string[];
}

// Export utility types
export type DiscoveryStrategy = 'sitemap' | 'link-following' | 'path-generation' | 'archive-discovery' | 'comprehensive';

export type DiscoveryEventHandler = (event: DiscoveryEvent) => void;

export type UrlRelevanceFunction = (url: string, options: DiscoveryOptions) => number;

export type DiscoveryValidationFunction = (result: ComprehensiveDiscoveryResult) => DiscoveryValidation;

// Export medical domain configurations
export const MEDICAL_DOMAIN_CONFIGS = {
  COMPREHENSIVE_DISCOVERY_OPTIONS,
  FAST_DISCOVERY_OPTIONS,
  MEDICAL_FOCUSED_OPTIONS
};