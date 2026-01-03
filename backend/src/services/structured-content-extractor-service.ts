/**
 * Structured Content Extractor Service
 * 
 * Extracts semantic structure from web content, identifies medical facts,
 * and organizes content hierarchically for optimal processing.
 */

import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import {
  SemanticSection,
  SemanticType,
  MedicalFact,
  MedicalFactCategory,
  ContentMetadata,
  StructuredContent,
  ExtractionOptions,
  ExtractionResult,
  ExtractionMetrics,
  MEDICAL_CONTENT_PATTERNS,
  DIABETES_MEDICAL_KEYWORDS,
  DEFAULT_EXTRACTION_OPTIONS
} from '../types/structured-content.types';

export class StructuredContentExtractorService {
  private readonly options: ExtractionOptions;

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
  }

  /**
   * Extract structured content from HTML
   */
  async extractStructuredContent(
    html: string, 
    url: string, 
    title: string
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      console.log(`Extracting structured content from: ${url}`);
      
      const $ = cheerio.load(html);
      
      // Remove unwanted elements
      this.cleanHtml($);
      
      // Extract semantic sections
      const sections = await this.extractSemanticSections($, url);
      
      if (sections.length === 0) {
        warnings.push('No semantic sections found');
      }

      // Generate content summary
      const summary = this.generateContentSummary($, sections);
      
      // Extract metadata
      const metadata = this.extractContentMetadata($, url, sections);
      
      // Calculate metrics
      const processingTime = Date.now() - startTime;
      const totalFacts = sections.reduce((sum, s) => sum + s.medicalFacts.length, 0);
      const hierarchyDepth = this.calculateHierarchyDepth(sections);
      
      const structuredContent: StructuredContent = {
        url,
        title,
        summary,
        sections,
        metadata,
        extractedAt: new Date().toISOString(),
        processingTime,
        totalFacts,
        totalSections: sections.length,
        hierarchyDepth
      };

      const metrics: ExtractionMetrics = {
        processingTime,
        sectionsFound: sections.length,
        factsExtracted: totalFacts,
        keyTermsIdentified: sections.reduce((sum, s) => sum + s.keyTerms.length, 0),
        averageRelevanceScore: this.calculateAverageRelevance(sections),
        qualityScore: metadata.qualityScore,
        hierarchyComplexity: hierarchyDepth
      };

      console.log(`Content extraction completed: ${sections.length} sections, ${totalFacts} facts`);

      return {
        success: true,
        content: structuredContent,
        warnings,
        metrics
      };

    } catch (error) {
      console.error('Content extraction failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
        warnings,
        metrics: {
          processingTime: Date.now() - startTime,
          sectionsFound: 0,
          factsExtracted: 0,
          keyTermsIdentified: 0,
          averageRelevanceScore: 0,
          qualityScore: 0,
          hierarchyComplexity: 0
        }
      };
    }
  }

  /**
   * Extract semantic sections from HTML
   */
  private async extractSemanticSections($: CheerioAPI, url: string): Promise<SemanticSection[]> {
    const sections: SemanticSection[] = [];
    let sectionId = 0;

    // Find all heading elements and their content
    const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    
    for (const selector of headingSelectors) {
      const depth = parseInt(selector.charAt(1));
      
      $(selector).each((index, element) => {
        const $heading = $(element);
        const heading = $heading.text().trim();
        
        if (heading.length < 3) return; // Skip very short headings
        
        // Extract content following this heading
        const content = this.extractSectionContent($, $heading, selector);
        
        if (content.length < this.options.minSectionLength) return;
        
        // Determine semantic type
        const semanticType = this.determineSemanticType(heading, content);
        
        // Extract key terms
        const keyTerms = this.extractKeyTerms(heading + ' ' + content);
        
        // Extract medical facts
        const medicalFacts = this.options.extractMedicalFacts ? 
          this.extractMedicalFacts(content, semanticType) : [];
        
        // Assess patient relevance
        const patientRelevance = this.assessPatientRelevance(content);
        
        // Extract subsections (if enabled and not too deep)
        const subsections = this.options.includeSubsections && depth < this.options.maxDepth ?
          this.extractSubsections($, $heading, depth + 1) : [];

        const section: SemanticSection = {
          id: `section-${sectionId++}`,
          heading,
          content,
          semanticType,
          depth,
          position: index,
          keyTerms,
          medicalFacts,
          patientRelevance,
          subsections,
          wordCount: content.split(/\s+/).length,
          readabilityScore: this.options.calculateReadability ? 
            this.calculateReadabilityScore(content) : undefined
        };

        sections.push(section);
      });
    }

    // If no headings found, try to extract content by paragraphs
    if (sections.length === 0) {
      const fallbackSection = this.extractFallbackSection($);
      if (fallbackSection) {
        sections.push(fallbackSection);
      }
    }

    return sections.filter(section => section.content.length >= this.options.minSectionLength);
  }

  /**
   * Extract content following a heading
   */
  private extractSectionContent($: CheerioAPI, $heading: cheerio.Cheerio<any>, headingSelector: string): string {
    const content: string[] = [];
    let $current = $heading.next();
    
    const currentLevel = parseInt(headingSelector.charAt(1));
    
    while ($current.length > 0) {
      const tagName = $current.prop('tagName')?.toLowerCase();
      
      // Stop if we hit another heading of same or higher level
      if (tagName && /^h[1-6]$/.test(tagName)) {
        const level = parseInt(tagName.charAt(1));
        if (level <= currentLevel) {
          break;
        }
      }
      
      // Extract text content from relevant elements
      if (tagName === 'p' || tagName === 'div' || tagName === 'li' || tagName === 'span') {
        const text = $current.text().trim();
        if (text.length > 10) {
          content.push(text);
        }
      }
      
      $current = $current.next();
    }
    
    return content.join(' ').trim();
  }

  /**
   * Extract subsections
   */
  private extractSubsections($: CheerioAPI, $parentHeading: cheerio.Cheerio<any>, targetDepth: number): SemanticSection[] {
    const subsections: SemanticSection[] = [];
    const targetSelector = `h${targetDepth}`;
    let $current = $parentHeading.next();
    let subsectionId = 0;
    
    while ($current.length > 0) {
      const tagName = $current.prop('tagName')?.toLowerCase();
      
      // Stop if we hit a heading of same or higher level than parent
      if (tagName && /^h[1-6]$/.test(tagName)) {
        const level = parseInt(tagName.charAt(1));
        if (level < targetDepth) {
          break;
        }
        
        if (level === targetDepth) {
          const heading = $current.text().trim();
          const content = this.extractSectionContent($, $current, targetSelector);
          
          if (content.length >= this.options.minSectionLength) {
            const semanticType = this.determineSemanticType(heading, content);
            const keyTerms = this.extractKeyTerms(heading + ' ' + content);
            const medicalFacts = this.options.extractMedicalFacts ? 
              this.extractMedicalFacts(content, semanticType) : [];
            const patientRelevance = this.assessPatientRelevance(content);
            
            subsections.push({
              id: `subsection-${subsectionId++}`,
              heading,
              content,
              semanticType,
              depth: targetDepth,
              position: subsectionId,
              keyTerms,
              medicalFacts,
              patientRelevance,
              subsections: [], // No nested subsections for now
              wordCount: content.split(/\s+/).length
            });
          }
        }
      }
      
      $current = $current.next();
    }
    
    return subsections;
  }

  /**
   * Determine semantic type of content
   */
  private determineSemanticType(heading: string, content: string): SemanticType {
    const combinedText = (heading + ' ' + content).toLowerCase();
    
    // Check against predefined patterns
    for (const pattern of MEDICAL_CONTENT_PATTERNS) {
      if (pattern.pattern.test(combinedText)) {
        return pattern.semanticType;
      }
    }
    
    // Additional diabetes-specific patterns
    if (/(?:what is|definition|about).*diabetes/i.test(combinedText)) {
      return 'medical-definition';
    }
    
    if (/(?:faq|frequently asked|questions)/i.test(combinedText)) {
      return 'faq';
    }
    
    if (/(?:research|studies|clinical)/i.test(combinedText)) {
      return 'research';
    }
    
    if (/(?:statistics|numbers|data|prevalence)/i.test(combinedText)) {
      return 'statistics';
    }
    
    return 'general-info';
  }

  /**
   * Extract key terms from text
   */
  private extractKeyTerms(text: string): string[] {
    const terms = new Set<string>();
    const textLower = text.toLowerCase();
    
    // Extract medical keywords
    for (const keywordSet of DIABETES_MEDICAL_KEYWORDS) {
      for (const keyword of keywordSet.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          terms.add(keyword);
        }
      }
      
      // Check patterns
      for (const pattern of keywordSet.patterns) {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => terms.add(match.trim()));
        }
      }
    }
    
    // Extract additional medical terms using simple patterns
    const medicalTermPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, // Proper nouns (potential medical terms)
      /\b\d+(?:\.\d+)?\s*(?:mg|ml|units?|percent|%)\b/gi, // Medical measurements
      /\b(?:type\s+[12]|gestational|prediabetes)\b/gi // Diabetes types
    ];
    
    for (const pattern of medicalTermPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const term = match.trim();
          if (term.length > 3 && term.length < 50) {
            terms.add(term);
          }
        });
      }
    }
    
    return Array.from(terms).slice(0, 20); // Limit to top 20 terms
  }

  /**
   * Extract medical facts from content
   */
  private extractMedicalFacts(content: string, semanticType: SemanticType): MedicalFact[] {
    const facts: MedicalFact[] = [];
    let factId = 0;
    
    // Split content into sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      // Skip very short or very long sentences
      if (trimmedSentence.length < 20 || trimmedSentence.length > 300) {
        continue;
      }
      
      // Determine if sentence contains medical information
      const confidence = this.calculateFactConfidence(trimmedSentence, semanticType);
      
      if (confidence >= this.options.factConfidenceThreshold) {
        const category = this.categorizeMedicalFact(trimmedSentence, semanticType);
        const keyTerms = this.extractKeyTerms(trimmedSentence);
        const evidenceLevel = this.assessEvidenceLevel(trimmedSentence);
        
        facts.push({
          id: `fact-${factId++}`,
          statement: trimmedSentence,
          confidence,
          category,
          evidenceLevel,
          keyTerms,
          relatedFacts: [] // Could be populated with similarity analysis
        });
      }
    }
    
    return facts;
  }

  /**
   * Calculate confidence score for medical fact
   */
  private calculateFactConfidence(sentence: string, semanticType: SemanticType): number {
    let confidence = 0.3; // Base confidence
    
    // Boost confidence based on semantic type
    const semanticBoosts: Record<SemanticType, number> = {
      'medical-definition': 0.4,
      'symptoms': 0.3,
      'treatment': 0.35,
      'diagnosis': 0.35,
      'medication': 0.4,
      'complications': 0.3,
      'prevention': 0.25,
      'causes': 0.25,
      'management': 0.3,
      'monitoring': 0.3,
      'lifestyle': 0.2,
      'nutrition': 0.25,
      'exercise': 0.2,
      'support': 0.15,
      'research': 0.2,
      'statistics': 0.25,
      'faq': 0.15,
      'general-info': 0.1,
      'other': 0.1
    };
    
    confidence += semanticBoosts[semanticType] || 0.1;
    
    // Boost for medical keywords
    for (const keywordSet of DIABETES_MEDICAL_KEYWORDS) {
      for (const keyword of keywordSet.keywords) {
        if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
          confidence += keywordSet.weight * 0.1;
        }
      }
    }
    
    // Boost for authoritative language
    const authoritativePatterns = [
      /(?:studies show|research indicates|according to)/i,
      /(?:doctors recommend|physicians suggest)/i,
      /(?:clinical trials|evidence shows)/i,
      /(?:american diabetes association|ada recommends)/i
    ];
    
    for (const pattern of authoritativePatterns) {
      if (pattern.test(sentence)) {
        confidence += 0.2;
        break;
      }
    }
    
    // Reduce confidence for uncertain language
    const uncertainPatterns = [
      /(?:may|might|could|possibly|perhaps)/i,
      /(?:some people|in some cases)/i
    ];
    
    for (const pattern of uncertainPatterns) {
      if (pattern.test(sentence)) {
        confidence -= 0.1;
        break;
      }
    }
    
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Categorize medical fact
   */
  private categorizeMedicalFact(sentence: string, semanticType: SemanticType): MedicalFactCategory {
    const sentenceLower = sentence.toLowerCase();
    
    // Direct mapping from semantic type
    const semanticToCategory: Partial<Record<SemanticType, MedicalFactCategory>> = {
      'medical-definition': 'definition',
      'symptoms': 'symptom',
      'treatment': 'treatment-option',
      'diagnosis': 'diagnostic-criteria',
      'medication': 'medication-info',
      'complications': 'complication',
      'prevention': 'prevention-method',
      'monitoring': 'monitoring-guideline',
      'lifestyle': 'lifestyle-recommendation',
      'statistics': 'statistical-data',
      'research': 'research-finding'
    };
    
    if (semanticToCategory[semanticType]) {
      return semanticToCategory[semanticType]!;
    }
    
    // Pattern-based categorization
    if (/(?:risk factor|increases risk|causes)/i.test(sentenceLower)) {
      return 'risk-factor';
    }
    
    if (/(?:prevent|avoid|reduce risk)/i.test(sentenceLower)) {
      return 'prevention-method';
    }
    
    if (/(?:symptom|sign|experience|feel)/i.test(sentenceLower)) {
      return 'symptom';
    }
    
    if (/(?:treatment|therapy|medication|insulin)/i.test(sentenceLower)) {
      return 'treatment-option';
    }
    
    return 'definition'; // Default category
  }

  /**
   * Assess evidence level
   */
  private assessEvidenceLevel(sentence: string): 'high' | 'medium' | 'low' {
    // High evidence indicators
    const highEvidencePatterns = [
      /(?:clinical trial|randomized|peer-reviewed|meta-analysis)/i,
      /(?:american diabetes association|ada|medical association)/i,
      /(?:proven|established|demonstrated)/i
    ];
    
    for (const pattern of highEvidencePatterns) {
      if (pattern.test(sentence)) {
        return 'high';
      }
    }
    
    // Medium evidence indicators
    const mediumEvidencePatterns = [
      /(?:study|research|studies show)/i,
      /(?:doctors|physicians|experts)/i,
      /(?:evidence suggests|data shows)/i
    ];
    
    for (const pattern of mediumEvidencePatterns) {
      if (pattern.test(sentence)) {
        return 'medium';
      }
    }
    
    return 'low';
  }

  /**
   * Extract fallback section when no headings are found
   */
  private extractFallbackSection($: CheerioAPI): SemanticSection | null {
    // Try to extract main content
    const contentSelectors = [
      'main',
      '.content',
      '.main-content',
      'article',
      '.article-content',
      '#content'
    ];
    
    for (const selector of contentSelectors) {
      const $element = $(selector);
      if ($element.length > 0) {
        const content = $element.text().trim();
        if (content.length >= this.options.minSectionLength) {
          return {
            id: 'fallback-section',
            heading: 'Main Content',
            content,
            semanticType: 'general-info',
            depth: 1,
            position: 0,
            keyTerms: this.extractKeyTerms(content),
            medicalFacts: this.options.extractMedicalFacts ? 
              this.extractMedicalFacts(content, 'general-info') : [],
            patientRelevance: this.assessPatientRelevance(content),
            subsections: [],
            wordCount: content.split(/\s+/).length
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Clean HTML by removing unwanted elements
   */
  private cleanHtml($: CheerioAPI): void {
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Remove navigation and footer elements
    $('nav, header, footer, .navigation, .menu, .sidebar').remove();
    
    // Remove ads and promotional content
    $('.ad, .advertisement, .promo, .banner').remove();
    
    // Remove social media widgets
    $('.social, .share, .facebook, .twitter, .instagram').remove();
    
    // Remove comments
    $('.comments, .comment-section').remove();
  }

  /**
   * Calculate readability score (simplified Flesch Reading Ease)
   */
  private calculateReadabilityScore(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);
    
    if (sentences.length === 0 || words.length === 0) {
      return 0;
    }
    
    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    
    // Simplified Flesch Reading Ease formula
    const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in a word (simplified)
   */
  private countSyllables(word: string): number {
    const vowels = 'aeiouy';
    let count = 0;
    let previousWasVowel = false;
    
    for (const char of word.toLowerCase()) {
      const isVowel = vowels.includes(char);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }
    
    // Handle silent 'e'
    if (word.toLowerCase().endsWith('e') && count > 1) {
      count--;
    }
    
    return Math.max(1, count);
  }

  /**
   * Calculate hierarchy depth
   */
  private calculateHierarchyDepth(sections: SemanticSection[]): number {
    let maxDepth = 0;
    
    const calculateDepth = (section: SemanticSection): number => {
      let depth = section.depth;
      for (const subsection of section.subsections) {
        depth = Math.max(depth, calculateDepth(subsection));
      }
      return depth;
    };
    
    for (const section of sections) {
      maxDepth = Math.max(maxDepth, calculateDepth(section));
    }
    
    return maxDepth;
  }

  /**
   * Calculate average relevance score
   */
  private calculateAverageRelevance(sections: SemanticSection[]): number {
    if (sections.length === 0) return 0;
    
    const relevanceScores: number[] = sections.map(section => {
      switch (section.patientRelevance) {
        case 'high': return 1.0;
        case 'medium': return 0.6;
        case 'low': return 0.2;
        default: return 0;
      }
    });
    
    return relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
  }

  /**
   * Extract medical review date from HTML
   */
  private extractMedicalReviewDate($: CheerioAPI): string | undefined {
    const dateSelectors = [
      '.medical-review-date',
      '.last-reviewed',
      '.review-date',
      '[data-review-date]'
    ];
    
    for (const selector of dateSelectors) {
      const $element = $(selector);
      if ($element.length > 0) {
        const dateText = $element.text().trim();
        const dateMatch = dateText.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          return dateMatch[0];
        }
      }
    }
    
    return undefined;
  }

  private assessPatientRelevance(content: string): 'high' | 'medium' | 'low' {
    const contentLower = content.toLowerCase();
    
    // High relevance indicators
    if (contentLower.includes('symptoms') || 
        contentLower.includes('treatment') ||
        contentLower.includes('management') ||
        contentLower.includes('daily care')) {
      return 'high';
    }
    
    // Medium relevance indicators
    if (contentLower.includes('causes') || 
        contentLower.includes('prevention') ||
        contentLower.includes('diagnosis')) {
      return 'medium';
    }
    
    return 'low';
  }

  private generateContentSummary($: CheerioAPI, sections: SemanticSection[]): string {
    // Extract first paragraph or create summary from sections
    const firstParagraph = $('p').first().text().trim();
    
    if (firstParagraph.length > 50 && firstParagraph.length < 300) {
      return firstParagraph;
    }
    
    // Generate summary from section headings
    const headings = sections.map(s => s.heading).slice(0, 3);
    return `Content covering: ${headings.join(', ')}.`;
  }

  private extractContentMetadata($: CheerioAPI, url: string, sections: SemanticSection[]): ContentMetadata {
    const categories = this.inferContentCategories(sections);
    const relatedTopics = this.extractRelatedTopics(sections);
    
    return {
      contentCategories: categories,
      relatedTopics,
      targetAudience: ['patients', 'caregivers', 'general-public'],
      medicalAccuracy: 'peer-reviewed',
      lastFactCheck: this.extractMedicalReviewDate($),
      qualityScore: this.calculateQualityScore(sections)
    };
  }

  private inferContentCategories(sections: SemanticSection[]): string[] {
    const categories = new Set<string>();
    
    sections.forEach(section => {
      switch (section.semanticType) {
        case 'medical-definition':
          categories.add('medical-information');
          break;
        case 'symptoms':
          categories.add('symptom-guide');
          break;
        case 'treatment':
          categories.add('treatment-information');
          break;
        case 'prevention':
          categories.add('prevention-guide');
          break;
        default:
          categories.add('patient-education');
      }
    });
    
    categories.add('diabetes-information');
    return Array.from(categories);
  }

  private extractRelatedTopics(sections: SemanticSection[]): string[] {
    const topics = new Set<string>();
    
    sections.forEach(section => {
      section.keyTerms.forEach(term => {
        if (term.length > 3) {
          topics.add(term);
        }
      });
    });
    
    return Array.from(topics).slice(0, 10);
  }

  private calculateQualityScore(sections: SemanticSection[]): number {
    let score = 0.5; // Base score
    
    // Increase score for structured content
    if (sections.length > 1) score += 0.1;
    if (sections.length > 3) score += 0.1;
    
    // Increase score for medical facts
    const totalFacts = sections.reduce((sum, s) => sum + s.medicalFacts.length, 0);
    if (totalFacts > 0) score += 0.1;
    if (totalFacts > 5) score += 0.1;
    
    // Increase score for semantic diversity
    const semanticTypes = new Set(sections.map(s => s.semanticType));
    if (semanticTypes.size > 2) score += 0.1;
    
    return Math.min(score, 1.0);
  }
}