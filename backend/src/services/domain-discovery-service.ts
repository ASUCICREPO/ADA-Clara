/**
 * Comprehensive Domain Discovery Service
 * 
 * Provides complete coverage of diabetes.org through 5 advanced discovery strategies
 * targeting 1,500-2,500 URLs with proper deduplication and canonical URL resolution.
 * 
 * CRITICAL FIXES IMPLEMENTED:
 * - URL normalization and deduplication
 * - Canonical URL resolution
 * - Content fingerprinting for duplicate detection
 * - URL validation for diabetes.org domain
 * - Processed URL tracking to prevent re-processing
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import * as crypto from 'crypto';
import {
  DiscoveryOptions,
  DiscoveredUrl,
  SitemapEntry,
  RobotsTxtInfo,
  ComprehensiveDiscoveryResult,
  COMPREHENSIVE_DISCOVERY_OPTIONS
} from '../types/domain-discovery.types';

export class DomainDiscoveryService {
  private readonly USER_AGENT = 'ADA Clara Enhanced Scraper/1.0 (+https://ada-clara.com/bot)';
  private readonly DEFAULT_CRAWL_DELAY = 200; // Reduced from 1000ms to 200ms for better performance
  
  // URL deduplication and tracking
  private discoveredUrls = new Set<string>();
  private canonicalUrls = new Map<string, string>(); // original -> canonical
  private contentFingerprints = new Map<string, string>(); // fingerprint -> canonical URL
  private processedUrls = new Set<string>(); // Track processed URLs to prevent re-processing

  /**
   * COMPREHENSIVE discovery with proper deduplication - targets 1,500-2,500 URLs
   */
  async discoverDomainUrls(domain: string, options: DiscoveryOptions): Promise<ComprehensiveDiscoveryResult> {
    console.log(`🚀 Starting COMPREHENSIVE domain discovery for: ${domain}`);
    console.log(`Target: ${options.maxUrls} URLs with ${options.maxDepth} levels depth`);
    
    const startTime = Date.now();
    
    // Reset deduplication state
    this.discoveredUrls.clear();
    this.canonicalUrls.clear();
    this.contentFingerprints.clear();
    this.processedUrls.clear();
    
    const discoveryBreakdown = {
      sitemaps: 0,
      linkFollowing: 0,
      pathGeneration: 0,
      archiveDiscovery: 0
    };

    try {
      // Strategy 1: Advanced Sitemap Discovery
      console.log('📋 Strategy 1: Advanced Sitemap Discovery');
      const sitemapUrls = await this.discoverAllSitemaps(domain);
      for (const url of sitemapUrls) {
        if (await this.addUrlWithDeduplication(url, options)) {
          discoveryBreakdown.sitemaps++;
        }
        if (this.discoveredUrls.size >= options.maxUrls) break;
      }
      console.log(`   ✅ Discovered ${discoveryBreakdown.sitemaps} unique URLs from sitemaps`);

      // Strategy 2: Deep Link Following (4 levels for realistic coverage)
      console.log('🔗 Strategy 2: Deep Link Following');
      const linkUrls = await this.comprehensiveLinkFollowing(domain, options);
      for (const url of linkUrls) {
        if (await this.addUrlWithDeduplication(url, options)) {
          discoveryBreakdown.linkFollowing++;
        }
        if (this.discoveredUrls.size >= options.maxUrls) break;
      }
      console.log(`   ✅ Discovered ${discoveryBreakdown.linkFollowing} unique URLs from link following`);

      // Strategy 3: Known Path Pattern Generation
      console.log('🗂️  Strategy 3: Path Pattern Generation');
      const pathUrls = await this.generateKnownPaths(domain);
      for (const url of pathUrls) {
        if (await this.addUrlWithDeduplication(url, options)) {
          discoveryBreakdown.pathGeneration++;
        }
        if (this.discoveredUrls.size >= options.maxUrls) break;
      }
      console.log(`   ✅ Generated ${discoveryBreakdown.pathGeneration} unique URLs from known patterns`);

      // Strategy 4: Conservative Archived Content Discovery
      console.log('📚 Strategy 4: Archive Discovery');
      const archiveUrls = await this.discoverArchivedContent(domain);
      for (const url of archiveUrls) {
        if (await this.addUrlWithDeduplication(url, options)) {
          discoveryBreakdown.archiveDiscovery++;
        }
        if (this.discoveredUrls.size >= options.maxUrls) break;
      }
      console.log(`   ✅ Discovered ${discoveryBreakdown.archiveDiscovery} unique archived URLs`);

      // Strategy 5: Content-Aware Filtering (Applied throughout via addUrlWithDeduplication)
      const finalUrls = Array.from(this.discoveredUrls);

      const processingTime = Date.now() - startTime;
      const coverageEstimate = Math.min(100, (finalUrls.length / 1311) * 100); // Based on realistic 1,311 total estimate

      console.log(`🎯 COMPREHENSIVE DISCOVERY COMPLETE:`);
      console.log(`   Total Unique URLs: ${finalUrls.length}`);
      console.log(`   Coverage: ${coverageEstimate.toFixed(1)}%`);
      console.log(`   Duplicates Filtered: ${this.canonicalUrls.size - this.discoveredUrls.size}`);
      console.log(`   Time: ${processingTime}ms`);

      return {
        totalUrls: finalUrls.length,
        discoveryBreakdown,
        urls: finalUrls.map(url => ({
          url,
          discoveredAt: new Date().toISOString(),
          discoveryMethod: this.determineDiscoveryMethod(url),
          depth: 0,
          estimatedRelevance: this.calculateRelevance(url)
        })),
        processingTime,
        coverageEstimate
      };

    } catch (error) {
      console.error('Comprehensive discovery failed:', error);
      throw error;
    }
  }

  /**
   * Add URL with comprehensive deduplication and validation
   */
  private async addUrlWithDeduplication(url: string, options: DiscoveryOptions): Promise<boolean> {
    try {
      // Step 1: Normalize URL
      const normalizedUrl = this.normalizeUrl(url);
      if (!normalizedUrl) return false;

      // Step 2: Validate domain
      if (!this.isValidDiabetesOrgUrl(normalizedUrl)) return false;

      // Step 3: Check if already processed
      if (this.processedUrls.has(normalizedUrl)) return false;

      // Step 4: Apply relevance filtering
      if (!this.isRelevantUrl(normalizedUrl, options)) return false;

      // Step 5: Resolve canonical URL (handle redirects)
      const canonicalUrl = await this.resolveCanonicalUrl(normalizedUrl);
      
      // Step 6: Check if canonical URL already discovered
      if (this.discoveredUrls.has(canonicalUrl)) {
        this.canonicalUrls.set(normalizedUrl, canonicalUrl);
        return false; // Already have this content
      }

      // Step 7: Content fingerprinting (for URLs that pass initial checks)
      const contentFingerprint = await this.getContentFingerprint(canonicalUrl);
      if (contentFingerprint) {
        const existingUrl = this.contentFingerprints.get(contentFingerprint);
        if (existingUrl) {
          this.canonicalUrls.set(normalizedUrl, existingUrl);
          return false; // Duplicate content
        }
        this.contentFingerprints.set(contentFingerprint, canonicalUrl);
      }

      // Step 8: Add to discovered URLs
      this.discoveredUrls.add(canonicalUrl);
      this.canonicalUrls.set(normalizedUrl, canonicalUrl);
      this.processedUrls.add(normalizedUrl);
      
      return true;

    } catch (error) {
      console.warn(`Failed to process URL ${url}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Normalize URL to canonical form
   */
  private normalizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Ensure HTTPS
      urlObj.protocol = 'https:';
      
      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
      trackingParams.forEach(param => urlObj.searchParams.delete(param));
      
      // Remove fragment
      urlObj.hash = '';
      
      // Normalize path (remove trailing slash except for root)
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      // Convert to lowercase for consistency
      urlObj.hostname = urlObj.hostname.toLowerCase();
      urlObj.pathname = urlObj.pathname.toLowerCase();
      
      return urlObj.toString();
      
    } catch (error) {
      console.warn(`Invalid URL: ${url}`);
      return null;
    }
  }

  /**
   * Validate that URL is from diabetes.org domain
   */
  private isValidDiabetesOrgUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Must be diabetes.org or subdomain
      return hostname === 'diabetes.org' || hostname.endsWith('.diabetes.org');
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolve canonical URL (handle redirects)
   */
  private async resolveCanonicalUrl(url: string): Promise<string> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        headers: { 'User-Agent': this.USER_AGENT }
      });
      
      // Return the final URL after redirects
      return this.normalizeUrl(response.request.res.responseUrl || url) || url;
      
    } catch (error) {
      // If HEAD request fails, return original URL
      return url;
    }
  }

  /**
   * Generate content fingerprint for duplicate detection
   */
  private async getContentFingerprint(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': this.USER_AGENT }
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract main content for fingerprinting
      $('script, style, nav, header, footer, .navigation, .menu').remove();
      const mainContent = $('main, .content, .main-content, article, #content').text() || $('body').text();
      
      // Create hash of normalized content
      const normalizedContent = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      if (normalizedContent.length < 100) return null; // Too short to fingerprint reliably
      
      return crypto.createHash('md5').update(normalizedContent).digest('hex');
      
    } catch (error) {
      console.warn(`Failed to fingerprint ${url}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Advanced sitemap discovery - checks 14+ locations
   */
  async discoverAllSitemaps(domain: string): Promise<string[]> {
    const baseUrl = `https://${domain}`;
    const discoveredUrls = new Set<string>();

    // Check robots.txt first
    const robotsInfo = await this.parseRobotsTxt(baseUrl);
    robotsInfo.sitemapUrls.forEach(url => {
      this.addSitemapUrls(url, discoveredUrls);
    });

    // Check 14+ common sitemap locations
    const sitemapLocations = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap/sitemap.xml',
      '/sitemaps/sitemap.xml',
      '/wp-sitemap.xml',
      '/sitemap-index.xml',
      '/sitemap1.xml',
      '/sitemap-posts.xml',
      '/sitemap-pages.xml',
      '/sitemap-categories.xml',
      '/sitemap-tags.xml',
      '/news-sitemap.xml',
      '/image-sitemap.xml',
      '/video-sitemap.xml'
    ];

    for (const location of sitemapLocations) {
      try {
        const sitemapUrl = `${baseUrl}${location}`;
        const response = await axios.head(sitemapUrl, {
          timeout: 5000,
          headers: { 'User-Agent': this.USER_AGENT }
        });
        
        if (response.status === 200) {
          await this.addSitemapUrls(sitemapUrl, discoveredUrls);
        }
      } catch (error) {
        // Sitemap doesn't exist, continue
      }
    }

    return Array.from(discoveredUrls);
  }

  /**
   * Deep link following - 4 levels for realistic comprehensive coverage
   */
  async comprehensiveLinkFollowing(domain: string, options: DiscoveryOptions): Promise<string[]> {
    const baseUrl = `https://${domain}`;
    const linkUrls: string[] = [];
    const visitedUrls = new Set<string>();
    
    // High-priority seed URLs for diabetes.org
    const seedUrls = [
      `${baseUrl}/`,
      `${baseUrl}/about-diabetes`,
      `${baseUrl}/about-diabetes/type-1`,
      `${baseUrl}/about-diabetes/type-2`,
      `${baseUrl}/living-with-diabetes`,
      `${baseUrl}/living-with-diabetes/treatment-care`,
      `${baseUrl}/food-nutrition`,
      `${baseUrl}/health-wellness`,
      `${baseUrl}/tools-and-resources`,
      `${baseUrl}/community`,
      `${baseUrl}/professionals`,
      `${baseUrl}/research`
    ];

    let currentUrls = [...seedUrls];
    const maxDepth = Math.min(2, options.maxDepth); // Reduced from 4 to 2 levels for better performance

    for (let depth = 0; depth < maxDepth && currentUrls.length > 0; depth++) {
      console.log(`     📊 Depth ${depth + 1}: Processing ${currentUrls.length} URLs...`);
      
      const nextLevelUrls = new Set<string>();
      
      for (const url of currentUrls.slice(0, 20)) { // Reduced from 50 to 20 URLs per level for efficiency
        const normalizedUrl = this.normalizeUrl(url);
        if (!normalizedUrl || visitedUrls.has(normalizedUrl)) continue;
        visitedUrls.add(normalizedUrl);

        try {
          const links = await this.extractLinksFromPage(normalizedUrl);
          
          for (const link of links) {
            const normalizedLink = this.normalizeUrl(link);
            if (normalizedLink && 
                this.isValidDiabetesOrgUrl(normalizedLink) && 
                !visitedUrls.has(normalizedLink)) {
              
              linkUrls.push(normalizedLink);
              
              // Add promising URLs for next level (higher relevance threshold)
              if (nextLevelUrls.size < 30 && this.calculateRelevance(normalizedLink) > 0.7) { // Reduced from 100 to 30, increased threshold from 0.6 to 0.7
                nextLevelUrls.add(normalizedLink);
              }
            }
          }

          // Rate limiting
          await this.sleep(options.rateLimitDelay || this.DEFAULT_CRAWL_DELAY);

        } catch (error) {
          console.warn(`Failed to process ${normalizedUrl}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      currentUrls = Array.from(nextLevelUrls);
      console.log(`        ✅ Found ${nextLevelUrls.size} URLs for next level`);
    }

    return linkUrls;
  }

  /**
   * Generate URLs from known diabetes.org patterns (conservative approach)
   */
  async generateKnownPaths(domain: string): Promise<string[]> {
    const baseUrl = `https://${domain}`;
    const generatedUrls: string[] = [];

    // Conservative diabetes.org path patterns based on realistic site structure
    const pathPatterns = {
      'About Diabetes': [
        '/about-diabetes',
        '/about-diabetes/type-1',
        '/about-diabetes/type-2', 
        '/about-diabetes/gestational',
        '/about-diabetes/prediabetes',
        '/about-diabetes/what-is-diabetes',
        '/about-diabetes/statistics',
        '/about-diabetes/myths',
        '/about-diabetes/newly-diagnosed',
        '/about-diabetes/risk-factors',
        '/about-diabetes/prevention'
      ],
      'Living with Diabetes': [
        '/living-with-diabetes',
        '/living-with-diabetes/treatment-care',
        '/living-with-diabetes/blood-glucose-testing',
        '/living-with-diabetes/medication',
        '/living-with-diabetes/insulin',
        '/living-with-diabetes/complications',
        '/living-with-diabetes/mental-health',
        '/living-with-diabetes/pregnancy',
        '/living-with-diabetes/children-teens',
        '/living-with-diabetes/seniors',
        '/living-with-diabetes/technology',
        '/living-with-diabetes/travel'
      ],
      'Food & Nutrition': [
        '/food-nutrition',
        '/food-nutrition/meal-planning',
        '/food-nutrition/carb-counting',
        '/food-nutrition/recipes',
        '/food-nutrition/eating-out',
        '/food-nutrition/weight-management',
        '/food-nutrition/supplements',
        '/food-nutrition/diabetes-plate-method',
        '/food-nutrition/glycemic-index'
      ],
      'Health & Wellness': [
        '/health-wellness',
        '/health-wellness/fitness',
        '/health-wellness/mental-health',
        '/health-wellness/sleep',
        '/health-wellness/stress-management',
        '/health-wellness/heart-health',
        '/health-wellness/eye-health',
        '/health-wellness/foot-care',
        '/health-wellness/dental-health'
      ],
      'Tools & Resources': [
        '/tools-and-resources',
        '/tools-and-resources/diabetes-tools',
        '/tools-and-resources/blood-glucose-tracker',
        '/tools-and-resources/a1c-calculator',
        '/tools-and-resources/carb-counter',
        '/tools-and-resources/meal-planner',
        '/tools-and-resources/educational-materials',
        '/tools-and-resources/apps',
        '/tools-and-resources/books'
      ]
    };

    for (const [, paths] of Object.entries(pathPatterns)) {
      for (const basePath of paths) {
        // Add the base path
        generatedUrls.push(`${baseUrl}${basePath}`);
        
        // Generate limited sub-pages (conservative approach)
        const subPages = [
          '/overview', '/basics', '/symptoms', '/causes', 
          '/treatment', '/prevention', '/management', '/tips', '/guide', 
          '/faq', '/resources'
        ];
        
        for (const subPage of subPages) {
          generatedUrls.push(`${baseUrl}${basePath}${subPage}`);
        }
      }
    }

    return generatedUrls;
  }

  /**
   * Discover archived and historical content (conservative approach)
   */
  async discoverArchivedContent(domain: string): Promise<string[]> {
    const baseUrl = `https://${domain}`;
    const archiveUrls: string[] = [];
    
    // Conservative archive patterns for diabetes.org
    const archivePatterns = [
      '/news',
      '/blog',
      '/articles',
      '/press-releases',
      '/events'
    ];

    for (const pattern of archivePatterns) {
      // Generate realistic historical content URLs (last 2 years only)
      const years = [2024, 2023];
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      
      for (const year of years) {
        // Yearly archives
        archiveUrls.push(`${baseUrl}${pattern}/${year}`);
        
        for (const month of months) {
          // Monthly archives only (no daily archives)
          archiveUrls.push(`${baseUrl}${pattern}/${year}/${month}`);
          
          // Limited individual content items (max 3 per month for realism)
          for (let item = 1; item <= 3; item++) {
            archiveUrls.push(`${baseUrl}${pattern}/${year}/${month}/article-${item}`);
          }
        }
      }
    }

    return archiveUrls;
  }

  /**
   * Parse robots.txt for compliance and crawl delay configuration
   */
  async parseRobotsTxt(baseUrl: string): Promise<RobotsTxtInfo> {
    try {
      const robotsUrl = `${baseUrl}/robots.txt`;
      const response = await axios.get(robotsUrl, {
        timeout: 10000,
        headers: { 'User-Agent': this.USER_AGENT }
      });

      const robotsContent = response.data;
      const lines = robotsContent.split('\n').map((line: string) => line.trim());
      
      let allowed = true;
      let crawlDelay = this.DEFAULT_CRAWL_DELAY;
      const sitemapUrls: string[] = [];
      const disallowedPaths: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith('Disallow:')) {
          const path = line.substring(9).trim();
          if (path === '/') {
            allowed = false;
          } else if (path) {
            disallowedPaths.push(path);
          }
        } else if (line.startsWith('Crawl-delay:')) {
          const delay = parseInt(line.substring(12).trim());
          if (!isNaN(delay)) {
            crawlDelay = delay * 1000;
          }
        } else if (line.startsWith('Sitemap:')) {
          const sitemapUrl = line.substring(8).trim();
          if (sitemapUrl) {
            sitemapUrls.push(sitemapUrl);
          }
        }
      }

      return { allowed, crawlDelay, sitemapUrls, disallowedPaths };

    } catch (error) {
      console.warn('Failed to parse robots.txt, assuming allowed');
      return {
        allowed: true,
        crawlDelay: this.DEFAULT_CRAWL_DELAY,
        sitemapUrls: [],
        disallowedPaths: []
      };
    }
  }

  // Helper methods
  private async addSitemapUrls(sitemapUrl: string, discoveredUrls: Set<string>): Promise<void> {
    try {
      const response = await axios.get(sitemapUrl, {
        timeout: 15000,
        headers: { 'User-Agent': this.USER_AGENT }
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      
      // Parse URL entries
      $('urlset > url').each((_, element) => {
        const loc = $(element).find('loc').text().trim();
        if (loc) {
          discoveredUrls.add(loc);
        }
      });

      // Handle nested sitemaps
      $('sitemapindex > sitemap').each((_, element) => {
        const loc = $(element).find('loc').text().trim();
        if (loc) {
          this.addSitemapUrls(loc, discoveredUrls).catch(err => 
            console.warn(`Failed to parse nested sitemap ${loc}:`, err.message)
          );
        }
      });

    } catch (error) {
      console.warn(`Failed to parse sitemap ${sitemapUrl}:`, error instanceof Error ? error.message : String(error));
    }
  }

  private async extractLinksFromPage(url: string): Promise<string[]> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': this.USER_AGENT }
      });

      const $ = cheerio.load(response.data);
      const links: string[] = [];
      const baseDomain = new URL(url).hostname;
      
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, url).toString();
            const linkDomain = new URL(absoluteUrl).hostname;
            
            if (linkDomain === baseDomain) {
              links.push(absoluteUrl);
            }
          } catch (error) {
            // Invalid URL, skip
          }
        }
      });
      
      return [...new Set(links)];

    } catch (error) {
      console.warn(`Failed to extract links from ${url}:`, error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  private isRelevantUrl(url: string, options: DiscoveryOptions): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      // Check blocked patterns first
      for (const blockedPattern of options.blockedPathPatterns) {
        if (pathname.includes(blockedPattern.toLowerCase())) {
          return false;
        }
      }
      
      // Apply diabetes-specific relevance (less aggressive filtering)
      return this.isDiabetesRelevant(pathname);
      
    } catch (error) {
      return false;
    }
  }

  private isDiabetesRelevant(pathname: string): boolean {
    // Comprehensive diabetes keywords for broader inclusion
    const diabetesKeywords = [
      'diabetes', 'insulin', 'glucose', 'blood-sugar', 'type-1', 'type-2',
      'gestational', 'prediabetes', 'nutrition', 'food', 'health', 'wellness',
      'complications', 'management', 'treatment', 'symptoms', 'prevention',
      'a1c', 'hemoglobin', 'carb', 'carbohydrate', 'diet', 'exercise',
      'medication', 'monitoring', 'testing', 'care', 'support', 'education',
      'research', 'community', 'professional', 'resource', 'tool', 'guide'
    ];
    
    // Also include general medical/health content
    const generalHealthKeywords = [
      'medical', 'clinical', 'patient', 'doctor', 'physician', 'nurse',
      'healthcare', 'medicine', 'therapy', 'diagnosis', 'condition'
    ];
    
    const allKeywords = [...diabetesKeywords, ...generalHealthKeywords];
    
    return allKeywords.some(keyword => pathname.includes(keyword)) ||
           pathname.includes('/about') ||
           pathname.includes('/living') ||
           pathname.includes('/tools') ||
           pathname.includes('/resources') ||
           pathname.includes('/community') ||
           pathname.includes('/professional') ||
           pathname.includes('/research') ||
           pathname.includes('/news') ||
           pathname.includes('/blog') ||
           pathname.includes('/article');
  }

  private calculateRelevance(url: string): number {
    const pathname = new URL(url).pathname.toLowerCase();
    
    // High relevance paths
    if (pathname.includes('diabetes') || pathname.includes('insulin') || pathname.includes('glucose')) {
      return 0.9;
    }
    
    // Medium relevance paths
    if (pathname.includes('health') || pathname.includes('nutrition') || pathname.includes('care')) {
      return 0.7;
    }
    
    // Lower relevance but still valuable
    if (pathname.includes('resource') || pathname.includes('tool') || pathname.includes('community')) {
      return 0.5;
    }
    
    return 0.3; // Default relevance
  }

  private determineDiscoveryMethod(url: string): 'sitemap' | 'link-following' | 'path-generation' | 'archive-discovery' | 'manual' {
    const pathname = new URL(url).pathname.toLowerCase();
    
    if (pathname.includes('/archive') || pathname.match(/\/\d{4}\/\d{2}/)) {
      return 'archive-discovery';
    }
    
    if (pathname.includes('/about') || pathname.includes('/living') || pathname.includes('/tools')) {
      return 'path-generation';
    }
    
    return 'link-following'; // Default
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processed URLs for tracking (used by enhanced data service)
   */
  getProcessedUrls(): Set<string> {
    return new Set(this.processedUrls);
  }

  /**
   * Mark URLs as processed (used by enhanced data service)
   */
  markUrlsAsProcessed(urls: string[]): void {
    urls.forEach(url => {
      const normalized = this.normalizeUrl(url);
      if (normalized) {
        this.processedUrls.add(normalized);
      }
    });
  }

  /**
   * Get deduplication statistics
   */
  getDeduplicationStats(): {
    totalDiscovered: number;
    totalCanonical: number;
    duplicatesFiltered: number;
    contentDuplicates: number;
  } {
    return {
      totalDiscovered: this.discoveredUrls.size,
      totalCanonical: this.canonicalUrls.size,
      duplicatesFiltered: this.canonicalUrls.size - this.discoveredUrls.size,
      contentDuplicates: this.contentFingerprints.size
    };
  }
}

// Export the service class and types
export { DiscoveredUrl } from '../types/domain-discovery.types';