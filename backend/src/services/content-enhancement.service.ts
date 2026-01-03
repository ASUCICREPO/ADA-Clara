/**
 * Content Enhancement Service
 * 
 * AI-powered content enhancement using Bedrock models for medical accuracy,
 * clarity improvement, and embedding optimization.
 */

import {
  ContentEnhancementOptions,
  EnhancementRequest,
  EnhancementResult,
  BatchEnhancementResult,
  Enhancement,
  EnhancementGoal,
  MedicalValidationResult,
  MedicalIssue,
  EnhancementMetrics,
  EnhancementEvent,
  DEFAULT_ENHANCEMENT_OPTIONS,
  MEDICAL_ENHANCEMENT_OPTIONS,
  FAST_ENHANCEMENT_OPTIONS,
  ENHANCEMENT_PROMPTS,
  DEFAULT_QUALITY_CRITERIA,
  QualityAssessmentCriteria
} from '../types/content-enhancement.types';

export class ContentEnhancementService {
  private readonly options: ContentEnhancementOptions;
  private events: EnhancementEvent[] = [];

  constructor(options: Partial<ContentEnhancementOptions> = {}) {
    this.options = { ...DEFAULT_ENHANCEMENT_OPTIONS, ...options };
  }

  /**
   * Enhance a single piece of content
   */
  async enhanceContent(request: EnhancementRequest): Promise<EnhancementResult> {
    const startTime = Date.now();
    this.events = [];

    try {
      console.log(`Starting content enhancement for: ${request.sourceUrl}`);
      
      this.logEvent('info', 'enhancement_started', `Enhancing ${request.contentType} content`);
      
      // Validate input
      if (!request.content || request.content.trim().length === 0) {
        throw new Error('Content cannot be empty');
      }
      
      // Determine enhancement strategy based on content type and goals
      const enhancementStrategy = this.selectEnhancementStrategy(request);
      
      // Apply enhancements
      const enhancedContent = await this.applyEnhancements(request, enhancementStrategy);
      
      // Create embedding-optimized text
      const embeddingOptimizedText = this.createEmbeddingOptimizedText(enhancedContent);
      
      // Validate medical accuracy if enabled
      let medicalValidation: MedicalValidationResult | undefined;
      if (this.options.enableMedicalValidation) {
        medicalValidation = await this.validateMedicalAccuracy(enhancedContent, request);
      }
      
      // Calculate quality scores
      const qualityScore = this.calculateQualityScore(request.content, enhancedContent, request);
      const medicalAccuracyScore = medicalValidation ? medicalValidation.confidence : 0.8; // Default if not validated
      
      // Identify improvements made
      const improvements = this.identifyImprovements(request.content, enhancedContent, request.enhancementGoals);
      
      const processingTime = Date.now() - startTime;
      const tokensUsed = this.estimateTokensUsed(request.content, enhancedContent);
      
      this.logEvent('info', 'enhancement_completed', `Enhancement completed in ${processingTime}ms`);
      
      return {
        success: true,
        originalContent: request.content,
        enhancedContent,
        embeddingOptimizedText,
        improvements,
        qualityScore,
        medicalAccuracyScore,
        processingTime,
        tokensUsed,
        warnings: this.events.filter(e => e.severity === 'warning').map(e => e.message)
      };

    } catch (error) {
      console.error('Content enhancement failed:', error);
      
      return {
        success: false,
        originalContent: request.content,
        enhancedContent: request.content, // Return original on failure
        embeddingOptimizedText: this.createEmbeddingOptimizedText(request.content),
        improvements: [],
        qualityScore: 0.5, // Neutral score for failed enhancement
        medicalAccuracyScore: 0.5,
        processingTime: Date.now() - startTime,
        tokensUsed: 0,
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown enhancement error'
      };
    }
  }

  /**
   * Enhance multiple pieces of content in batch
   */
  async enhanceContentBatch(requests: EnhancementRequest[]): Promise<BatchEnhancementResult> {
    const startTime = Date.now();
    console.log(`Starting batch enhancement for ${requests.length} items`);
    
    const results: EnhancementResult[] = [];
    const errors: string[] = [];
    let totalTokensUsed = 0;
    let successfulCount = 0;
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < requests.length; i += this.options.batchSize) {
      const batch = requests.slice(i, i + this.options.batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(request => this.enhanceContent(request));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          totalTokensUsed += result.value.tokensUsed;
          if (result.value.success) {
            successfulCount++;
          }
        } else {
          const errorMsg = `Enhancement failed: ${result.reason}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      // Rate limiting between batches
      if (i + this.options.batchSize < requests.length) {
        await this.sleep(1000); // 1 second delay between batches
      }
    }
    
    const totalProcessingTime = Date.now() - startTime;
    const averageQualityScore = results.length > 0 ? 
      results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length : 0;
    const averageMedicalAccuracyScore = results.length > 0 ? 
      results.reduce((sum, r) => sum + r.medicalAccuracyScore, 0) / results.length : 0;
    
    return {
      success: errors.length === 0,
      results,
      totalProcessed: requests.length,
      totalSuccessful: successfulCount,
      totalFailed: requests.length - successfulCount,
      totalTokensUsed,
      totalProcessingTime,
      averageQualityScore,
      averageMedicalAccuracyScore,
      warnings: results.flatMap(r => r.warnings),
      errors
    };
  }

  /**
   * Select enhancement strategy based on content type and goals
   */
  private selectEnhancementStrategy(request: EnhancementRequest): string {
    const { contentType, enhancementGoals } = request;
    
    // Medical accuracy is always priority for medical content
    if (enhancementGoals.includes('enhance-medical-accuracy') || 
        ['symptoms', 'treatment', 'facts'].includes(contentType)) {
      return 'medical-accuracy';
    }
    
    // Patient-friendly for general content
    if (enhancementGoals.includes('simplify-language') || 
        request.targetAudience.includes('newly-diagnosed')) {
      return 'patient-friendly';
    }
    
    // Embedding optimization for search content
    if (enhancementGoals.includes('optimize-for-search') || 
        this.options.enhanceForEmbeddings) {
      return 'embedding-optimization';
    }
    
    // Structure improvement for complex content
    if (enhancementGoals.includes('improve-structure') || 
        contentType === 'faq') {
      return 'structure-improvement';
    }
    
    // Default to general enhancement
    return 'general-enhancement';
  }

  /**
   * Apply enhancements using Bedrock models
   */
  private async applyEnhancements(
    request: EnhancementRequest, 
    strategy: string
  ): Promise<string> {
    // Select appropriate prompt based on strategy
    let systemPrompt = ENHANCEMENT_PROMPTS.EMBEDDING_OPTIMIZATION;
    
    switch (strategy) {
      case 'medical-accuracy':
        systemPrompt = ENHANCEMENT_PROMPTS.MEDICAL_ACCURACY;
        break;
      case 'patient-friendly':
        systemPrompt = ENHANCEMENT_PROMPTS.PATIENT_FRIENDLY;
        break;
      case 'embedding-optimization':
        systemPrompt = ENHANCEMENT_PROMPTS.EMBEDDING_OPTIMIZATION;
        break;
      case 'structure-improvement':
        systemPrompt = ENHANCEMENT_PROMPTS.STRUCTURE_IMPROVEMENT;
        break;
    }
    
    // Create enhancement prompt
    const enhancementPrompt = this.createEnhancementPrompt(request, systemPrompt);
    
    // For now, return enhanced content with simulated improvements
    // In a real implementation, this would call Bedrock API
    return this.simulateEnhancement(request.content, strategy);
  }

  /**
   * Create enhancement prompt for Bedrock
   */
  private createEnhancementPrompt(request: EnhancementRequest, systemPrompt: string): string {
    const contextInfo = [
      `Content Type: ${request.contentType}`,
      `Source: ${request.sourceUrl}`,
      `Target Audience: ${request.targetAudience.join(', ')}`,
      `Medical Keywords: ${request.medicalKeywords.join(', ')}`,
      `Enhancement Goals: ${request.enhancementGoals.join(', ')}`
    ].join('\n');
    
    return `${systemPrompt}

Context Information:
${contextInfo}

Content to enhance:
${request.content}

Please provide the enhanced content while preserving the original structure and ensuring medical accuracy.`;
  }

  /**
   * Simulate content enhancement (placeholder for Bedrock integration)
   */
  private simulateEnhancement(content: string, strategy: string): string {
    // This is a simulation - in real implementation, this would call Bedrock
    let enhanced = content;
    
    switch (strategy) {
      case 'medical-accuracy':
        // Add medical disclaimers and clarifications
        enhanced = this.addMedicalContext(content);
        break;
      case 'patient-friendly':
        // Simplify language and add explanations
        enhanced = this.simplifyLanguage(content);
        break;
      case 'embedding-optimization':
        // Optimize for search and embedding
        enhanced = this.optimizeForEmbedding(content);
        break;
      case 'structure-improvement':
        // Improve structure and organization
        enhanced = this.improveStructure(content);
        break;
    }
    
    return enhanced;
  }

  /**
   * Add medical context and disclaimers
   */
  private addMedicalContext(content: string): string {
    // Add medical context where appropriate
    let enhanced = content;
    
    // Add disclaimer for medical advice
    if (content.toLowerCase().includes('treatment') || content.toLowerCase().includes('medication')) {
      enhanced += '\n\n*Always consult with your healthcare provider before making any changes to your treatment plan.*';
    }
    
    // Add context for symptoms
    if (content.toLowerCase().includes('symptom')) {
      enhanced += '\n\n*If you experience any of these symptoms, contact your healthcare provider for proper evaluation and diagnosis.*';
    }
    
    return enhanced;
  }

  /**
   * Simplify language for patient-friendly content
   */
  private simplifyLanguage(content: string): string {
    return content
      .replace(/\bhemoglobin A1C\b/gi, 'hemoglobin A1C (a blood test that shows average blood sugar levels)')
      .replace(/\bglucose\b/gi, 'glucose (blood sugar)')
      .replace(/\binsulin\b/gi, 'insulin (a hormone that helps control blood sugar)')
      .replace(/\bcarbohydrates\b/gi, 'carbohydrates (carbs - sugars and starches in food)');
  }

  /**
   * Optimize content for embedding generation
   */
  private optimizeForEmbedding(content: string): string {
    // Add relevant context and keywords
    let enhanced = content;
    
    // Add diabetes context if not present
    if (!content.toLowerCase().includes('diabetes')) {
      enhanced = `Diabetes Information: ${enhanced}`;
    }
    
    // Ensure key concepts are well-defined
    enhanced = enhanced.replace(/\btype 1\b/gi, 'type 1 diabetes');
    enhanced = enhanced.replace(/\btype 2\b/gi, 'type 2 diabetes');
    
    return enhanced;
  }

  /**
   * Improve content structure and organization
   */
  private improveStructure(content: string): string {
    // Add clear headings and improve organization
    const lines = content.split('\n');
    const enhanced: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Convert questions to proper headings
      if (trimmed.endsWith('?') && trimmed.length > 10) {
        enhanced.push(`## ${trimmed}`);
      } else {
        enhanced.push(line);
      }
    }
    
    return enhanced.join('\n');
  }

  /**
   * Create embedding-optimized text
   */
  private createEmbeddingOptimizedText(content: string): string {
    return content
      // Remove markdown formatting for embedding
      .replace(/#{1,6}\s+/g, '') // Remove heading markers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markers
      .replace(/\*(.*?)\*/g, '$1') // Remove italic markers
      .replace(/•\s+/g, '') // Remove bullet points
      .replace(/\n\s*\n/g, '. ') // Replace double newlines with periods
      .replace(/\n/g, ' ') // Replace single newlines with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Validate medical accuracy (placeholder for real validation)
   */
  private async validateMedicalAccuracy(
    content: string, 
    request: EnhancementRequest
  ): Promise<MedicalValidationResult> {
    // This is a simulation - in real implementation, this would use medical validation APIs
    const issues: MedicalIssue[] = [];
    
    // Check for common medical accuracy issues
    if (content.toLowerCase().includes('cure diabetes')) {
      issues.push({
        type: 'inaccuracy',
        severity: 'high',
        description: 'Diabetes cannot be cured, only managed',
        location: 'cure diabetes',
        suggestion: 'Replace with "manage diabetes" or "treat diabetes"'
      });
    }
    
    const confidence = issues.length === 0 ? 0.9 : Math.max(0.5, 0.9 - (issues.length * 0.2));
    
    return {
      isValid: issues.length === 0,
      confidence,
      issues,
      suggestions: issues.map(issue => issue.suggestion)
    };
  }

  /**
   * Calculate quality score for enhanced content
   */
  private calculateQualityScore(
    original: string, 
    enhanced: string, 
    request: EnhancementRequest
  ): number {
    let score = 0.5; // Base score
    
    // Length improvement (moderate increase is good)
    const lengthRatio = enhanced.length / original.length;
    if (lengthRatio >= 1.1 && lengthRatio <= 1.5) {
      score += 0.2;
    }
    
    // Medical keyword density
    const keywordCount = request.medicalKeywords.reduce((count, keyword) => {
      return count + (enhanced.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
    }, 0);
    
    if (keywordCount > 0) {
      score += Math.min(0.2, keywordCount * 0.05);
    }
    
    // Structure improvements (presence of headings, lists, etc.)
    if (enhanced.includes('##') || enhanced.includes('•') || enhanced.includes('*')) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Identify improvements made during enhancement
   */
  private identifyImprovements(
    original: string, 
    enhanced: string, 
    goals: EnhancementGoal[]
  ): Enhancement[] {
    const improvements: Enhancement[] = [];
    
    // Check for length improvements
    if (enhanced.length > original.length * 1.1) {
      improvements.push({
        type: 'add-context',
        description: 'Added additional context and explanations',
        confidence: 0.8,
        appliedChanges: ['Added medical context', 'Expanded explanations']
      });
    }
    
    // Check for structure improvements
    if (enhanced.includes('##') && !original.includes('##')) {
      improvements.push({
        type: 'improve-structure',
        description: 'Improved content structure with clear headings',
        confidence: 0.9,
        appliedChanges: ['Added section headings', 'Improved organization']
      });
    }
    
    // Check for medical accuracy improvements
    if (enhanced.includes('healthcare provider') && !original.includes('healthcare provider')) {
      improvements.push({
        type: 'enhance-medical-accuracy',
        description: 'Added medical disclaimers and professional guidance',
        confidence: 0.85,
        appliedChanges: ['Added medical disclaimers', 'Emphasized professional consultation']
      });
    }
    
    return improvements;
  }

  /**
   * Estimate tokens used for cost tracking
   */
  private estimateTokensUsed(original: string, enhanced: string): number {
    // Rough estimation: input + output tokens
    const inputTokens = Math.round(original.split(/\s+/).length * 1.3);
    const outputTokens = Math.round(enhanced.split(/\s+/).length * 1.3);
    return inputTokens + outputTokens;
  }

  /**
   * Calculate enhancement metrics
   */
  calculateMetrics(original: string, enhanced: string): EnhancementMetrics {
    const lengthChange = ((enhanced.length - original.length) / original.length) * 100;
    
    return {
      contentLengthChange: lengthChange,
      readabilityImprovement: 0.15, // Simulated improvement
      medicalAccuracyImprovement: 0.2, // Simulated improvement
      embeddingQualityScore: 0.85, // Simulated score
      structuralPreservation: 0.9, // High preservation
      keywordDensityOptimization: 0.1 // Simulated optimization
    };
  }

  /**
   * Utility methods
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logEvent(severity: 'info' | 'warning' | 'error', type: string, message: string): void {
    this.events.push({
      eventType: type as any,
      message,
      severity,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get configuration options for different use cases
   */
  static getMedicalOptions(): ContentEnhancementOptions {
    return { ...MEDICAL_ENHANCEMENT_OPTIONS };
  }

  static getFastOptions(): ContentEnhancementOptions {
    return { ...FAST_ENHANCEMENT_OPTIONS };
  }

  /**
   * Get configuration
   */
  getOptions(): ContentEnhancementOptions {
    return { ...this.options };
  }

  /**
   * Update configuration
   */
  updateOptions(updates: Partial<ContentEnhancementOptions>): void {
    Object.assign(this.options, updates);
  }
}