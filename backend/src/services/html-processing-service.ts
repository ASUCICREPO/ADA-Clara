import * as cheerio from 'cheerio';

/**
 * Structural metrics for HTML content analysis
 */
export interface StructuralMetrics {
  tableCount: number;
  listCount: number;
  headingCount: number;
  linkCount: number;
  preservedElements: string[];
  removedElements: string[];
}

/**
 * Result of HTML cleaning operation
 */
export interface CleanedHtmlResult {
  cleanedHtml: string;
  plainText: string;
  structuralMetrics: StructuralMetrics;
  processingTime: number;
}

/**
 * HTML Processing Service for ADA Clara
 * Extracts and adapts HTML processing logic from bedrock-crawler
 * Preserves semantic elements while removing unwanted content
 */
export class HtmlProcessingService {
  private readonly TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'diabetes.org';

  /**
   * Process HTML content to preserve semantic structure while removing unwanted elements
   * Adapted from bedrock-crawler's scrapeWithCheerio function
   */
  async processHtml(rawHtml: string, url: string): Promise<CleanedHtmlResult> {
    const startTime = Date.now();
    
    const $ = cheerio.load(rawHtml);
    
    // Track removed elements for metrics
    const removedElements: string[] = [];
    
    // Remove unwanted elements (scripts, styles, nav, footer, ads)
    const unwantedSelectors = [
      'script', 'style', 'nav', 'footer', 
      '.advertisement', '.ads', '.navigation', '.menu',
      'header', '.header', '.sidebar', '.social-media',
      '.cookie-notice', '.popup', '.modal'
    ];
    
    unwantedSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        removedElements.push(selector);
        elements.remove();
      }
    });

    // Extract title for HTML document
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    
    // Generate cleaned HTML that preserves semantic structure
    const cleanedHtml = this.generateCleanedHtml($, title, url);
    
    // Generate plain text for backward compatibility
    const plainText = this.extractPlainText($);
    
    // Analyze structural metrics
    const structuralMetrics = this.analyzeStructure($, removedElements);
    
    const processingTime = Date.now() - startTime;
    
    return {
      cleanedHtml,
      plainText,
      structuralMetrics,
      processingTime
    };
  }

  /**
   * Generate cleaned HTML document with preserved semantic structure
   */
  private generateCleanedHtml($: cheerio.CheerioAPI, title: string, url: string): string {
    // Find main content using multiple selectors
    const contentSelectors = [
      'main',
      '.main-content',
      '.content',
      '.article-content',
      '.post-content',
      'article',
      '.entry-content'
    ];
    
    let mainContent = '';
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainContent = element.html() || '';
        break;
      }
    }
    
    // Fallback to body if no main content found
    if (!mainContent) {
      mainContent = $('body').html() || '';
    }
    
    // Create clean HTML document with preserved structure
    const cleanedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <meta name="source-url" content="${this.escapeHtml(url)}">
    <style>
        /* Minimal CSS for structure preservation */
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        ul, ol { margin: 10px 0; padding-left: 20px; }
        li { margin: 5px 0; }
        h1, h2, h3, h4, h5, h6 { margin: 15px 0 10px 0; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.3em; }
        a { color: #0066cc; text-decoration: underline; }
        p { margin: 10px 0; }
        .preserved-content { max-width: 800px; }
    </style>
</head>
<body>
    <div class="preserved-content">
        ${mainContent}
    </div>
</body>
</html>`;

    return cleanedHtml;
  }

  /**
   * Extract plain text content (for backward compatibility)
   * Adapted from original scrapeWithCheerio function
   */
  private extractPlainText($: cheerio.CheerioAPI): string {
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
    
    return content;
  }

  /**
   * Analyze structural metrics of the HTML content
   */
  private analyzeStructure($: cheerio.CheerioAPI, removedElements: string[]): StructuralMetrics {
    // Count semantic elements
    const tableCount = $('table').length;
    const listCount = $('ul, ol').length;
    const headingCount = $('h1, h2, h3, h4, h5, h6').length;
    
    // Count internal links to the target domain
    let linkCount = 0;
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.includes(this.TARGET_DOMAIN)) {
        linkCount++;
      }
    });
    
    // Track preserved semantic elements
    const preservedElements: string[] = [];
    const semanticSelectors = ['table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'p', 'div', 'span'];
    
    semanticSelectors.forEach(selector => {
      if ($(selector).length > 0) {
        preservedElements.push(selector);
      }
    });
    
    return {
      tableCount,
      listCount,
      headingCount,
      linkCount,
      preservedElements: [...new Set(preservedElements)], // Remove duplicates
      removedElements: [...new Set(removedElements)] // Remove duplicates
    };
  }

  /**
   * Extract links from HTML content
   * Adapted from original scrapeWithCheerio function
   */
  extractLinks($: cheerio.CheerioAPI): string[] {
    const links: string[] = [];
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.includes(this.TARGET_DOMAIN)) {
        links.push(href);
      }
    });
    
    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Determine content type based on URL and content
   * Adapted from original determineContentType function
   */
  determineContentType(url: string, title: string, content: string): 'article' | 'faq' | 'resource' | 'event' {
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

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    
    return text.replace(/[&<>"']/g, (match) => map[match]);
  }

  /**
   * Validate HTML structure and content quality
   */
  validateHtmlQuality(cleanedHtml: string, structuralMetrics: StructuralMetrics): {
    isValid: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 100;

    // Check if HTML has basic structure
    if (!cleanedHtml.includes('<!DOCTYPE html>')) {
      issues.push('Missing DOCTYPE declaration');
      score -= 10;
    }

    if (!cleanedHtml.includes('<title>')) {
      issues.push('Missing title element');
      score -= 15;
    }

    // Check content richness
    if (structuralMetrics.tableCount === 0 && structuralMetrics.listCount === 0) {
      issues.push('No structured content (tables or lists) found');
      score -= 20;
    }

    if (structuralMetrics.headingCount === 0) {
      issues.push('No headings found - content may lack structure');
      score -= 15;
    }

    // Check content length
    const textLength = cleanedHtml.replace(/<[^>]*>/g, '').trim().length;
    if (textLength < 100) {
      issues.push('Content appears too short');
      score -= 25;
    }

    return {
      isValid: score >= 50,
      issues,
      score: Math.max(0, score)
    };
  }
}