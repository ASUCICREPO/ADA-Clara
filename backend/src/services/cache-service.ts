/**
 * Cache Service for Admin Analytics
 * Provides in-memory caching with TTL and DynamoDB persistence for frequently accessed metrics
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  persistToDynamoDB?: boolean;
  compressionEnabled?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  memoryUsage: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats = {
    hits: 0,
    misses: 0
  };
  
  // Default TTL values for different metric types
  private readonly DEFAULT_TTLS = {
    dashboard: 5 * 60 * 1000,      // 5 minutes for dashboard metrics
    realtime: 30 * 1000,          // 30 seconds for real-time metrics
    conversations: 10 * 60 * 1000, // 10 minutes for conversation analytics
    questions: 15 * 60 * 1000,     // 15 minutes for question analysis
    escalations: 5 * 60 * 1000,    // 5 minutes for escalation metrics
    health: 60 * 1000,             // 1 minute for health checks
    export: 60 * 60 * 1000         // 1 hour for export data
  };

  constructor() {
    // Start cache cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get cached data or execute function if cache miss
   */
  async get<T>(
    key: string, 
    fetchFunction: () => Promise<T>, 
    options: CacheOptions = {}
  ): Promise<T> {
    const cacheKey = this.generateCacheKey(key);
    const cached = this.cache.get(cacheKey);
    
    // Check if cached data is still valid
    if (cached && this.isValidCacheEntry(cached)) {
      this.stats.hits++;
      console.log(`🎯 Cache HIT for key: ${key}`);
      return cached.data;
    }
    
    // Cache miss - fetch fresh data
    this.stats.misses++;
    console.log(`❌ Cache MISS for key: ${key}`);
    
    try {
      const data = await fetchFunction();
      await this.set(key, data, options);
      return data;
    } catch (error) {
      console.error(`Error fetching data for cache key ${key}:`, error);
      
      // Return stale data if available and error occurred
      if (cached) {
        console.log(`⚠️ Returning stale data for key: ${key}`);
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Set cache entry
   */
  async set<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    const ttl = options.ttl || this.getDefaultTTL(key);
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      key: cacheKey
    };
    
    this.cache.set(cacheKey, entry);
    console.log(`💾 Cached data for key: ${key} (TTL: ${ttl}ms)`);
    
    // Optionally persist to DynamoDB for cross-Lambda sharing
    if (options.persistToDynamoDB) {
      await this.persistToDynamoDB(entry);
    }
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): boolean {
    const cacheKey = this.generateCacheKey(key);
    const deleted = this.cache.delete(cacheKey);
    
    if (deleted) {
      console.log(`🗑️ Invalidated cache for key: ${key}`);
    }
    
    return deleted;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string): number {
    let deletedCount = 0;
    const regex = new RegExp(pattern);
    
    for (const [key] of this.cache) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    console.log(`🗑️ Invalidated ${deletedCount} cache entries matching pattern: ${pattern}`);
    return deletedCount;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    console.log(`🧹 Cleared ${size} cache entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalEntries: this.cache.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Get cache keys for debugging
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(warmUpFunctions: Array<{
    key: string;
    fetchFunction: () => Promise<any>;
    options?: CacheOptions;
  }>): Promise<void> {
    console.log(`🔥 Warming up cache with ${warmUpFunctions.length} entries`);
    
    const warmUpPromises = warmUpFunctions.map(async ({ key, fetchFunction, options }) => {
      try {
        await this.get(key, fetchFunction, options);
      } catch (error) {
        console.error(`Failed to warm up cache for key ${key}:`, error);
      }
    });
    
    await Promise.all(warmUpPromises);
    console.log(`✅ Cache warm-up completed`);
  }

  // Private methods

  private generateCacheKey(key: string): string {
    // Add prefix and normalize key
    return `ada-clara:analytics:${key}`.toLowerCase().replace(/[^a-z0-9:-]/g, '-');
  }

  private isValidCacheEntry(entry: CacheEntry<any>): boolean {
    const age = Date.now() - entry.timestamp;
    return age < entry.ttl;
  }

  private getDefaultTTL(key: string): number {
    // Determine TTL based on key pattern
    if (key.includes('dashboard')) return this.DEFAULT_TTLS.dashboard;
    if (key.includes('realtime')) return this.DEFAULT_TTLS.realtime;
    if (key.includes('conversation')) return this.DEFAULT_TTLS.conversations;
    if (key.includes('question')) return this.DEFAULT_TTLS.questions;
    if (key.includes('escalation')) return this.DEFAULT_TTLS.escalations;
    if (key.includes('health')) return this.DEFAULT_TTLS.health;
    if (key.includes('export')) return this.DEFAULT_TTLS.export;
    
    // Default TTL
    return 5 * 60 * 1000; // 5 minutes
  }

  private startCleanupInterval(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredEntries(): void {
    let cleanedCount = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage in bytes
    let totalSize = 0;
    
    for (const [key, entry] of this.cache) {
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry.data).length * 2;
      totalSize += 64; // Overhead for entry metadata
    }
    
    return totalSize;
  }

  private async persistToDynamoDB(entry: CacheEntry<any>): Promise<void> {
    // TODO: Implement DynamoDB persistence for cross-Lambda cache sharing
    // This would store cache entries in a DynamoDB table with TTL
    console.log(`📝 TODO: Persist cache entry to DynamoDB: ${entry.key}`);
  }
}

// Singleton instance for Lambda reuse
export const cacheService = new CacheService();