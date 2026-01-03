/**
 * Intelligent Chunking Service
 * 
 * Implements multiple chunking strategies optimized for Titan embeddings
 * with semantic-aware content segmentation and context preservation.
 */

import {
  ContentChunk,
  StructuredChunk,
  ChunkingStrategy,
  ChunkingOptions,
  ChunkingResult,
  StructuredChunkingResult,
  ChunkingMetrics,
  ContentAnalysis,
  ChunkMetadata,
  StructuredChunkMetadata,
  ContextInfo,
  OverlapInfo,
  ChunkQuality,
  ChunkingEvent,
  DEFAULT_CHUNKING_OPTIONS,
  TITAN_OPTIMIZED_OPTIONS,
  MEDICAL_CONTENT_CHUNKING,
  SemanticChunkingConfig,
  HierarchicalChunkingConfig,
  FactualChunkingConfig,
  HybridChunkingConfig
} from '../types/intelligent-chunking.types';

import { StructuredContent, SemanticSection } from '../types/structured-content.types';

export class IntelligentChunkingService {
  private readonly options: ChunkingOptions;
  private events: ChunkingEvent[] = [];

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
  }

  /**
   * Main chunking method - analyzes content and applies optimal strategy
   */
  async chunkContent(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent
  ): Promise<ChunkingResult> {
    const startTime = Date.now();
    this.events = [];

    try {
      console.log(`Starting intelligent chunking for: ${url}`);
      
      // Analyze content to determine optimal strategy
      const analysis = this.analyzeContent(content, structuredContent);
      
      // Select chunking strategy
      const strategy = this.selectOptimalStrategy(analysis, structuredContent);
      
      this.logEvent('info', 'strategy_selected', `Selected strategy: ${strategy}`);
      
      // Apply chunking strategy
      const chunks = await this.applyChunkingStrategy(
        content,
        url,
        title,
        strategy,
        structuredContent,
        analysis
      );
      
      // Calculate metrics
      const metrics = this.calculateMetrics(chunks, analysis);
      
      // Validate chunks
      const validatedChunks = this.validateAndOptimizeChunks(chunks);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`Chunking completed: ${validatedChunks.length} chunks in ${processingTime}ms`);
      
      return {
        success: true,
        chunks: validatedChunks,
        totalChunks: validatedChunks.length,
        averageTokenCount: validatedChunks.reduce((sum, c) => sum + c.tokenCount, 0) / validatedChunks.length,
        averageQualityScore: validatedChunks.reduce((sum, c) => sum + c.metadata.qualityScore, 0) / validatedChunks.length,
        strategy,
        processingTime,
        metrics,
        warnings: this.events.filter(e => e.severity === 'warning').map(e => e.message)
      };

    } catch (error) {
      console.error('Chunking failed:', error);
      
      return {
        success: false,
        chunks: [],
        totalChunks: 0,
        averageTokenCount: 0,
        averageQualityScore: 0,
        strategy: this.options.strategy,
        processingTime: Date.now() - startTime,
        metrics: this.getEmptyMetrics(),
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown chunking error'
      };
    }
  }

  /**
   * Create structured JSON chunks optimized for Titan V2 and RAG
   */
  async createStructuredChunks(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent
  ): Promise<StructuredChunkingResult> {
    // First create regular chunks
    const chunkingResult = await this.chunkContent(content, url, title, structuredContent);
    
    if (!chunkingResult.success) {
      return {
        success: false,
        chunks: [],
        totalChunks: 0,
        averageTokenCount: 0,
        averageQualityScore: 0,
        strategy: chunkingResult.strategy,
        processingTime: chunkingResult.processingTime,
        metrics: chunkingResult.metrics,
        warnings: chunkingResult.warnings,
        error: chunkingResult.error
      };
    }

    // Convert to structured format
    const structuredChunks = chunkingResult.chunks.map(chunk => 
      this.convertToStructuredChunk(chunk, structuredContent)
    );

    return {
      success: true,
      chunks: structuredChunks,
      totalChunks: structuredChunks.length,
      averageTokenCount: chunkingResult.averageTokenCount,
      averageQualityScore: chunkingResult.averageQualityScore,
      strategy: chunkingResult.strategy,
      processingTime: chunkingResult.processingTime,
      metrics: chunkingResult.metrics,
      warnings: chunkingResult.warnings
    };
  }

  /**
   * Analyze content to understand its structure and characteristics
   */
  private analyzeContent(content: string, structuredContent?: StructuredContent): ContentAnalysis {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Estimate tokens (approximation: ~1.3 tokens per word for English)
    const totalTokens = Math.round(words.length * 1.3);
    
    // Count headings and facts from structured content
    const headingCount = structuredContent ? 
      structuredContent.sections.reduce((sum, s) => sum + 1 + s.subsections.length, 0) : 0;
    
    const factCount = structuredContent ? 
      structuredContent.sections.reduce((sum, s) => sum + s.medicalFacts.length, 0) : 0;
    
    // Calculate medical term density
    const medicalTermDensity = this.calculateMedicalTermDensity(content);
    
    // Calculate structural complexity
    const structuralComplexity = this.calculateStructuralComplexity(
      headingCount, 
      factCount, 
      paragraphs.length, 
      words.length
    );
    
    // Recommend strategy based on analysis
    const recommendedStrategy = this.recommendStrategy({
      totalTokens,
      headingCount,
      factCount,
      medicalTermDensity,
      structuralComplexity
    });
    
    // Estimate number of chunks
    const estimatedChunks = Math.ceil(totalTokens / this.options.targetTokenCount);
    
    return {
      totalTokens,
      totalWords: words.length,
      totalSentences: sentences.length,
      totalParagraphs: paragraphs.length,
      headingCount,
      factCount,
      medicalTermDensity,
      structuralComplexity,
      recommendedStrategy,
      estimatedChunks
    };
  }

  /**
   * Select optimal chunking strategy
   */
  private selectOptimalStrategy(
    analysis: ContentAnalysis, 
    structuredContent?: StructuredContent
  ): ChunkingStrategy {
    // Use configured strategy if not hybrid
    if (this.options.strategy !== 'hybrid') {
      return this.options.strategy;
    }
    
    // Use analysis recommendation for hybrid strategy
    return analysis.recommendedStrategy;
  }

  /**
   * Apply the selected chunking strategy
   */
  private async applyChunkingStrategy(
    content: string,
    url: string,
    title: string,
    strategy: ChunkingStrategy,
    structuredContent?: StructuredContent,
    analysis?: ContentAnalysis
  ): Promise<ContentChunk[]> {
    switch (strategy) {
      case 'semantic':
        return this.applySemanticChunking(content, url, title, structuredContent);
      
      case 'hierarchical':
        return this.applyHierarchicalChunking(content, url, title, structuredContent);
      
      case 'factual':
        return this.applyFactualChunking(content, url, title, structuredContent);
      
      case 'hybrid':
        return this.applyHybridChunking(content, url, title, structuredContent, analysis);
      
      case 'paragraph':
        return this.applyParagraphChunking(content, url, title);
      
      case 'sentence':
        return this.applySentenceChunking(content, url, title);
      
      case 'fixed-size':
      default:
        return this.applyFixedSizeChunking(content, url, title);
    }
  }

  /**
   * Semantic chunking - groups content by meaning and topics
   */
  private applySemanticChunking(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    if (structuredContent && structuredContent.sections.length > 0) {
      // Use structured sections for semantic chunking
      let chunkIndex = 0;
      
      for (const section of structuredContent.sections) {
        const sectionContent = `${section.heading}\n\n${section.content}`;
        const tokenCount = this.estimateTokenCount(sectionContent);
        
        if (tokenCount <= this.options.maxTokenCount) {
          // Section fits in one chunk
          chunks.push(this.createChunk(
            sectionContent,
            chunkIndex++,
            url,
            title,
            'semantic',
            {
              sourceSection: section.heading,
              chunkType: 'content',
              medicalKeywords: section.keyTerms,
              factCount: section.medicalFacts.length,
              patientRelevance: section.patientRelevance
            }
          ));
        } else {
          // Split large section
          const subChunks = this.splitLargeSection(section, url, title, chunkIndex);
          chunks.push(...subChunks);
          chunkIndex += subChunks.length;
        }
      }
    } else {
      // Fallback to paragraph-based semantic chunking
      return this.applyParagraphChunking(content, url, title);
    }
    
    // Set total chunks for all chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Hierarchical chunking - respects document structure
   */
  private applyHierarchicalChunking(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    if (structuredContent && structuredContent.sections.length > 0) {
      let chunkIndex = 0;
      
      // Process sections by hierarchy level
      const sortedSections = structuredContent.sections.sort((a, b) => a.depth - b.depth);
      
      for (const section of sortedSections) {
        // Include heading in chunk content
        const sectionContent = `${section.heading}\n\n${section.content}`;
        
        // Process subsections
        if (section.subsections.length > 0) {
          for (const subsection of section.subsections) {
            const subsectionContent = `${section.heading}\n${subsection.heading}\n\n${subsection.content}`;
            const tokenCount = this.estimateTokenCount(subsectionContent);
            
            if (tokenCount <= this.options.maxTokenCount) {
              chunks.push(this.createChunk(
                subsectionContent,
                chunkIndex++,
                url,
                title,
                'hierarchical',
                {
                  sourceSection: `${section.heading} > ${subsection.heading}`,
                  chunkType: 'content',
                  medicalKeywords: [...section.keyTerms, ...subsection.keyTerms],
                  factCount: section.medicalFacts.length + subsection.medicalFacts.length,
                  patientRelevance: subsection.patientRelevance
                }
              ));
            }
          }
        } else {
          // Process main section
          const tokenCount = this.estimateTokenCount(sectionContent);
          
          if (tokenCount <= this.options.maxTokenCount) {
            chunks.push(this.createChunk(
              sectionContent,
              chunkIndex++,
              url,
              title,
              'hierarchical',
              {
                sourceSection: section.heading,
                chunkType: 'content',
                medicalKeywords: section.keyTerms,
                factCount: section.medicalFacts.length,
                patientRelevance: section.patientRelevance
              }
            ));
          }
        }
      }
    } else {
      // Fallback to fixed-size chunking
      return this.applyFixedSizeChunking(content, url, title);
    }
    
    // Set total chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Factual chunking - groups medical facts together
   */
  private applyFactualChunking(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    if (structuredContent && structuredContent.totalFacts > 0) {
      let chunkIndex = 0;
      let currentChunkContent = '';
      let currentFactCount = 0;
      let currentKeywords: string[] = [];
      
      for (const section of structuredContent.sections) {
        if (section.medicalFacts.length > 0) {
          const sectionText = `${section.heading}\n\n${section.content}`;
          const sectionTokens = this.estimateTokenCount(sectionText);
          
          // Check if adding this section would exceed limits
          if (this.estimateTokenCount(currentChunkContent + sectionText) > this.options.maxTokenCount ||
              currentFactCount + section.medicalFacts.length > 10) {
            
            // Create chunk with current content
            if (currentChunkContent.trim()) {
              chunks.push(this.createChunk(
                currentChunkContent.trim(),
                chunkIndex++,
                url,
                title,
                'factual',
                {
                  chunkType: 'content',
                  medicalKeywords: [...new Set(currentKeywords)],
                  factCount: currentFactCount,
                  patientRelevance: 'high' // Factual chunks are high relevance
                }
              ));
            }
            
            // Start new chunk
            currentChunkContent = sectionText + '\n\n';
            currentFactCount = section.medicalFacts.length;
            currentKeywords = [...section.keyTerms];
          } else {
            // Add to current chunk
            currentChunkContent += sectionText + '\n\n';
            currentFactCount += section.medicalFacts.length;
            currentKeywords.push(...section.keyTerms);
          }
        }
      }
      
      // Add final chunk
      if (currentChunkContent.trim()) {
        chunks.push(this.createChunk(
          currentChunkContent.trim(),
          chunkIndex++,
          url,
          title,
          'factual',
          {
            chunkType: 'content',
            medicalKeywords: [...new Set(currentKeywords)],
            factCount: currentFactCount,
            patientRelevance: 'high'
          }
        ));
      }
    } else {
      // Fallback to semantic chunking
      return this.applySemanticChunking(content, url, title, structuredContent);
    }
    
    // Set total chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Hybrid chunking - combines multiple strategies
   */
  private applyHybridChunking(
    content: string,
    url: string,
    title: string,
    structuredContent?: StructuredContent,
    analysis?: ContentAnalysis
  ): ContentChunk[] {
    // Use semantic chunking as primary strategy for medical content
    if (analysis && analysis.medicalTermDensity > 0.3) {
      return this.applySemanticChunking(content, url, title, structuredContent);
    }
    
    // Use hierarchical for well-structured content
    if (analysis && analysis.headingCount > 3 && analysis.structuralComplexity > 0.6) {
      return this.applyHierarchicalChunking(content, url, title, structuredContent);
    }
    
    // Use factual for fact-heavy content
    if (analysis && analysis.factCount > 5) {
      return this.applyFactualChunking(content, url, title, structuredContent);
    }
    
    // Default to semantic chunking
    return this.applySemanticChunking(content, url, title, structuredContent);
  }

  /**
   * Paragraph-based chunking
   */
  private applyParagraphChunking(content: string, url: string, title: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let chunkIndex = 0;
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
      const tokenCount = this.estimateTokenCount(potentialChunk);
      
      if (tokenCount <= this.options.maxTokenCount) {
        currentChunk = potentialChunk;
      } else {
        // Create chunk with current content
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            currentChunk.trim(),
            chunkIndex++,
            url,
            title,
            'paragraph'
          ));
        }
        
        // Start new chunk with current paragraph
        currentChunk = paragraph;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex++,
        url,
        title,
        'paragraph'
      ));
    }
    
    // Set total chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Sentence-based chunking
   */
  private applySentenceChunking(content: string, url: string, title: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let chunkIndex = 0;
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim() + '.';
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + trimmedSentence;
      const tokenCount = this.estimateTokenCount(potentialChunk);
      
      if (tokenCount <= this.options.maxTokenCount) {
        currentChunk = potentialChunk;
      } else {
        // Create chunk with current content
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            currentChunk.trim(),
            chunkIndex++,
            url,
            title,
            'sentence'
          ));
        }
        
        // Start new chunk with current sentence
        currentChunk = trimmedSentence;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex++,
        url,
        title,
        'sentence'
      ));
    }
    
    // Set total chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Fixed-size chunking (fallback)
   */
  private applyFixedSizeChunking(content: string, url: string, title: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const words = content.split(/\s+/);
    const wordsPerChunk = Math.floor(this.options.targetTokenCount / 1.3); // Approximate tokens to words
    
    let chunkIndex = 0;
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkContent = chunkWords.join(' ');
      
      chunks.push(this.createChunk(
        chunkContent,
        chunkIndex++,
        url,
        title,
        'fixed-size'
      ));
    }
    
    // Set total chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return this.addContextAndOverlap(chunks, content);
  }

  /**
   * Create a content chunk with metadata
   */
  private createChunk(
    content: string,
    chunkIndex: number,
    url: string,
    title: string,
    strategy: ChunkingStrategy,
    additionalMetadata: Partial<ChunkMetadata> = {}
  ): ContentChunk {
    const tokenCount = this.estimateTokenCount(content);
    const wordCount = content.split(/\s+/).length;
    const medicalRelevance = this.calculateMedicalRelevance(content);
    
    const metadata: ChunkMetadata = {
      sourceUrl: url,
      sourceTitle: title,
      chunkType: 'content',
      medicalKeywords: this.extractMedicalKeywords(content),
      factCount: 0,
      qualityScore: this.calculateChunkQuality(content, tokenCount),
      patientRelevance: medicalRelevance > 0.7 ? 'high' : medicalRelevance > 0.4 ? 'medium' : 'low',
      createdAt: new Date().toISOString(),
      ...additionalMetadata
    };
    
    return {
      id: `chunk-${chunkIndex}-${Date.now()}`,
      content,
      chunkIndex,
      totalChunks: 0, // Will be set later
      tokenCount,
      wordCount,
      chunkingStrategy: strategy,
      medicalRelevance,
      contextPreservation: {
        precedingContext: '',
        followingContext: '',
        relatedChunks: [],
        contextScore: 0.8 // Default, will be calculated later
      },
      metadata
    };
  }

  /**
   * Add context information and overlap between chunks
   */
  private addContextAndOverlap(chunks: ContentChunk[], originalContent: string): ContentChunk[] {
    if (chunks.length <= 1) return chunks;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add preceding context
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapWords = Math.min(this.options.overlapTokens, prevChunk.wordCount);
        const prevWords = prevChunk.content.split(/\s+/);
        chunk.contextPreservation.precedingContext = prevWords.slice(-overlapWords).join(' ');
        
        chunk.overlap = {
          overlapWithPrevious: overlapWords,
          overlapWithNext: 0,
          overlapStrategy: 'token'
        };
      }
      
      // Add following context
      if (i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const overlapWords = Math.min(this.options.overlapTokens, nextChunk.wordCount);
        const nextWords = nextChunk.content.split(/\s+/);
        chunk.contextPreservation.followingContext = nextWords.slice(0, overlapWords).join(' ');
        
        if (chunk.overlap) {
          chunk.overlap.overlapWithNext = overlapWords;
        } else {
          chunk.overlap = {
            overlapWithPrevious: 0,
            overlapWithNext: overlapWords,
            overlapStrategy: 'token'
          };
        }
      }
      
      // Calculate context preservation score
      chunk.contextPreservation.contextScore = this.calculateContextScore(chunk, i, chunks.length);
    }
    
    return chunks;
  }

  /**
   * Utility methods
   */
  private estimateTokenCount(text: string): number {
    // Approximation: ~1.3 tokens per word for English
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return Math.round(words.length * 1.3);
  }

  private calculateMedicalTermDensity(content: string): number {
    const medicalTerms = [
      'diabetes', 'insulin', 'glucose', 'blood sugar', 'a1c', 'hemoglobin',
      'pancreas', 'beta cells', 'carbohydrates', 'medication', 'treatment',
      'symptoms', 'diagnosis', 'management', 'monitoring', 'complications'
    ];
    
    const contentLower = content.toLowerCase();
    const words = content.split(/\s+/).length;
    let termCount = 0;
    
    for (const term of medicalTerms) {
      const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
      termCount += matches;
    }
    
    return words > 0 ? termCount / words : 0;
  }

  private calculateStructuralComplexity(
    headingCount: number,
    factCount: number,
    paragraphCount: number,
    wordCount: number
  ): number {
    if (wordCount === 0) return 0;
    
    const headingDensity = headingCount / (wordCount / 100);
    const factDensity = factCount / (wordCount / 100);
    const paragraphDensity = paragraphCount / (wordCount / 100);
    
    // Normalize and combine metrics
    const complexity = Math.min(
      (headingDensity * 0.4 + factDensity * 0.4 + paragraphDensity * 0.2),
      1.0
    );
    
    return complexity;
  }

  private recommendStrategy(analysis: {
    totalTokens: number;
    headingCount: number;
    factCount: number;
    medicalTermDensity: number;
    structuralComplexity: number;
  }): ChunkingStrategy {
    // High medical density -> factual chunking
    if (analysis.medicalTermDensity > 0.4 && analysis.factCount > 5) {
      return 'factual';
    }
    
    // Well-structured content -> hierarchical chunking
    if (analysis.headingCount > 3 && analysis.structuralComplexity > 0.6) {
      return 'hierarchical';
    }
    
    // Medium complexity -> semantic chunking
    if (analysis.structuralComplexity > 0.3) {
      return 'semantic';
    }
    
    // Simple content -> paragraph chunking
    return 'paragraph';
  }

  private calculateMedicalRelevance(content: string): number {
    return this.calculateMedicalTermDensity(content) * 2; // Scale up for relevance
  }

  private extractMedicalKeywords(content: string): string[] {
    const medicalTerms = [
      'diabetes', 'insulin', 'glucose', 'blood sugar', 'a1c', 'hemoglobin',
      'pancreas', 'beta cells', 'carbohydrates', 'medication', 'treatment',
      'symptoms', 'diagnosis', 'management', 'monitoring', 'complications',
      'type 1', 'type 2', 'gestational', 'prediabetes'
    ];
    
    const contentLower = content.toLowerCase();
    const foundTerms: string[] = [];
    
    for (const term of medicalTerms) {
      if (contentLower.includes(term)) {
        foundTerms.push(term);
      }
    }
    
    return foundTerms;
  }

  private calculateChunkQuality(content: string, tokenCount: number): number {
    let score = 0.5; // Base score
    
    // Token count within target range
    if (tokenCount >= this.options.minTokenCount && tokenCount <= this.options.maxTokenCount) {
      score += 0.2;
    }
    
    // Medical relevance
    const medicalRelevance = this.calculateMedicalRelevance(content);
    score += medicalRelevance * 0.2;
    
    // Content completeness (no truncated sentences)
    if (!content.trim().endsWith('...') && content.includes('.')) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  private calculateContextScore(chunk: ContentChunk, index: number, totalChunks: number): number {
    let score = 0.5; // Base score
    
    // Overlap bonus
    if (chunk.overlap) {
      if (chunk.overlap.overlapWithPrevious > 0) score += 0.2;
      if (chunk.overlap.overlapWithNext > 0) score += 0.2;
    }
    
    // Position bonus (middle chunks have better context)
    if (index > 0 && index < totalChunks - 1) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  private splitLargeSection(
    section: SemanticSection,
    url: string,
    title: string,
    startIndex: number
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const content = `${section.heading}\n\n${section.content}`;
    
    // Split by paragraphs first
    const paragraphs = section.content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let chunkIndex = startIndex;
    let currentChunk = section.heading + '\n\n';
    
    for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk + paragraph + '\n\n';
      const tokenCount = this.estimateTokenCount(potentialChunk);
      
      if (tokenCount <= this.options.maxTokenCount) {
        currentChunk = potentialChunk;
      } else {
        // Create chunk with current content
        if (currentChunk.trim() !== section.heading) {
          chunks.push(this.createChunk(
            currentChunk.trim(),
            chunkIndex++,
            url,
            title,
            'semantic',
            {
              sourceSection: section.heading,
              chunkType: 'content',
              medicalKeywords: section.keyTerms,
              factCount: Math.floor(section.medicalFacts.length / paragraphs.length),
              patientRelevance: section.patientRelevance
            }
          ));
        }
        
        // Start new chunk
        currentChunk = section.heading + '\n\n' + paragraph + '\n\n';
      }
    }
    
    // Add final chunk
    if (currentChunk.trim() !== section.heading) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex++,
        url,
        title,
        'semantic',
        {
          sourceSection: section.heading,
          chunkType: 'content',
          medicalKeywords: section.keyTerms,
          factCount: Math.floor(section.medicalFacts.length / paragraphs.length),
          patientRelevance: section.patientRelevance
        }
      ));
    }
    
    return chunks;
  }

  private validateAndOptimizeChunks(chunks: ContentChunk[]): ContentChunk[] {
    return chunks.filter(chunk => {
      // Filter out chunks that are too small or too large
      if (chunk.tokenCount < this.options.minTokenCount) {
        this.logEvent('warning', 'chunk_too_small', `Chunk ${chunk.id} is too small (${chunk.tokenCount} tokens)`);
        return false;
      }
      
      if (chunk.tokenCount > this.options.maxTokenCount) {
        this.logEvent('warning', 'chunk_too_large', `Chunk ${chunk.id} is too large (${chunk.tokenCount} tokens)`);
        return false;
      }
      
      // Filter out low-quality chunks
      if (chunk.metadata.qualityScore < this.options.qualityThreshold) {
        this.logEvent('warning', 'low_quality_chunk', `Chunk ${chunk.id} has low quality score (${chunk.metadata.qualityScore})`);
        return false;
      }
      
      return true;
    });
  }

  private calculateMetrics(chunks: ContentChunk[], analysis: ContentAnalysis): ChunkingMetrics {
    const totalOutputTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    const avgContextScore = chunks.reduce((sum, c) => sum + c.contextPreservation.contextScore, 0) / chunks.length;
    const avgMedicalRelevance = chunks.reduce((sum, c) => sum + c.medicalRelevance, 0) / chunks.length;
    const avgQualityScore = chunks.reduce((sum, c) => sum + c.metadata.qualityScore, 0) / chunks.length;
    
    // Calculate chunk size variance
    const avgTokenCount = totalOutputTokens / chunks.length;
    const variance = chunks.reduce((sum, c) => sum + Math.pow(c.tokenCount - avgTokenCount, 2), 0) / chunks.length;
    
    return {
      totalInputTokens: analysis.totalTokens,
      totalOutputTokens,
      tokenEfficiency: totalOutputTokens / analysis.totalTokens,
      contextPreservationScore: avgContextScore,
      semanticCoherenceScore: avgQualityScore, // Using quality as proxy for coherence
      medicalRelevanceScore: avgMedicalRelevance,
      chunkSizeVariance: Math.sqrt(variance),
      overlapEfficiency: avgContextScore // Using context score as proxy for overlap efficiency
    };
  }

  private getEmptyMetrics(): ChunkingMetrics {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      tokenEfficiency: 0,
      contextPreservationScore: 0,
      semanticCoherenceScore: 0,
      medicalRelevanceScore: 0,
      chunkSizeVariance: 0,
      overlapEfficiency: 0
    };
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
   * Get chunking options optimized for specific use cases
   */
  static getTitanOptimizedOptions(): ChunkingOptions {
    return { ...TITAN_OPTIMIZED_OPTIONS };
  }

  static getMedicalContentOptions(): ChunkingOptions {
    return { ...MEDICAL_CONTENT_CHUNKING };
  }

  /**
   * Convert ContentChunk to StructuredChunk format optimized for Titan V2
   */
  private convertToStructuredChunk(
    chunk: ContentChunk, 
    structuredContent?: StructuredContent
  ): StructuredChunk {
    // Create embedding-optimized text (clean, no markdown formatting)
    const embeddingText = this.createEmbeddingText(chunk.content);
    
    // Determine content type based on content analysis
    const contentType = this.determineContentType(chunk.content, chunk.metadata.sourceSection);
    
    // Determine patient audience based on content
    const patientAudience = this.determinePatientAudience(chunk.content, contentType);
    
    // Create section path
    const sectionPath = this.createSectionPath(chunk.metadata.sourceSection, structuredContent);
    
    const structuredMetadata: StructuredChunkMetadata = {
      sourceUrl: chunk.metadata.sourceUrl,
      sourceTitle: chunk.metadata.sourceTitle,
      section: chunk.metadata.sourceSection || 'General',
      sectionPath,
      contentType,
      medicalRelevance: chunk.metadata.patientRelevance,
      patientAudience,
      medicalKeywords: chunk.metadata.medicalKeywords,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      tokenCount: chunk.tokenCount,
      lastUpdated: chunk.metadata.createdAt,
      chunkingStrategy: chunk.chunkingStrategy,
      qualityScore: chunk.metadata.qualityScore
    };

    return {
      id: chunk.id,
      content: chunk.content, // Keep markdown-style formatting for content
      metadata: structuredMetadata,
      embedding_text: embeddingText
    };
  }

  /**
   * Create clean text optimized for Titan V2 embedding
   */
  private createEmbeddingText(content: string): string {
    return content
      // Remove markdown formatting
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
   * Determine content type based on content analysis
   */
  private determineContentType(
    content: string, 
    section?: string
  ): 'symptoms' | 'treatment' | 'definition' | 'facts' | 'faq' | 'resource' | 'general' {
    const contentLower = content.toLowerCase();
    const sectionLower = (section || '').toLowerCase();
    
    // Check for symptoms
    if (contentLower.includes('symptom') || sectionLower.includes('symptom') ||
        contentLower.match(/\b(signs?|indicators?)\b/)) {
      return 'symptoms';
    }
    
    // Check for treatment
    if (contentLower.includes('treatment') || contentLower.includes('medication') ||
        contentLower.includes('therapy') || sectionLower.includes('treatment')) {
      return 'treatment';
    }
    
    // Check for definitions
    if (contentLower.match(/\b(what is|definition|means|refers to)\b/) ||
        sectionLower.includes('definition') || sectionLower.includes('about')) {
      return 'definition';
    }
    
    // Check for FAQ
    if (contentLower.match(/\b(question|answer|faq|frequently asked)\b/) ||
        sectionLower.includes('faq') || sectionLower.includes('question')) {
      return 'faq';
    }
    
    // Check for facts/statistics
    if (contentLower.match(/\b(fact|statistic|research|study|percent|%)\b/) ||
        sectionLower.includes('fact') || sectionLower.includes('research')) {
      return 'facts';
    }
    
    // Check for resources
    if (contentLower.match(/\b(resource|tool|guide|help|support)\b/) ||
        sectionLower.includes('resource') || sectionLower.includes('tool')) {
      return 'resource';
    }
    
    return 'general';
  }

  /**
   * Determine patient audience based on content
   */
  private determinePatientAudience(
    content: string, 
    contentType: string
  ): string[] {
    const contentLower = content.toLowerCase();
    const audiences: string[] = [];
    
    // Check for newly diagnosed
    if (contentLower.match(/\b(newly diagnosed|new diagnosis|just diagnosed|first time)\b/)) {
      audiences.push('newly-diagnosed');
    }
    
    // Check for parents/caregivers
    if (contentLower.match(/\b(parent|child|children|caregiver|family)\b/)) {
      audiences.push('parents', 'caregivers');
    }
    
    // Check for healthcare providers
    if (contentLower.match(/\b(healthcare provider|doctor|physician|medical professional)\b/)) {
      audiences.push('healthcare-providers');
    }
    
    // Check for type-specific audiences
    if (contentLower.includes('type 1')) {
      audiences.push('type-1-patients');
    }
    
    if (contentLower.includes('type 2')) {
      audiences.push('type-2-patients');
    }
    
    // Default audiences based on content type
    if (audiences.length === 0) {
      switch (contentType) {
        case 'symptoms':
        case 'definition':
          audiences.push('newly-diagnosed', 'general-public');
          break;
        case 'treatment':
          audiences.push('patients', 'caregivers');
          break;
        case 'facts':
          audiences.push('general-public', 'researchers');
          break;
        default:
          audiences.push('general-public');
      }
    }
    
    return [...new Set(audiences)]; // Remove duplicates
  }

  /**
   * Create hierarchical section path
   */
  private createSectionPath(
    section?: string, 
    structuredContent?: StructuredContent
  ): string {
    if (!section || !structuredContent) {
      return section || 'General';
    }
    
    // Find the section in structured content to get hierarchy
    for (const structSection of structuredContent.sections) {
      if (structSection.heading === section) {
        // Check if it has a parent section
        const parentSection = structuredContent.sections.find(s => 
          s.subsections.some(sub => sub.heading === section)
        );
        
        if (parentSection) {
          return `${parentSection.heading} > ${section}`;
        }
        
        return section;
      }
      
      // Check subsections
      for (const subsection of structSection.subsections) {
        if (subsection.heading === section) {
          return `${structSection.heading} > ${section}`;
        }
      }
    }
    
    return section;
  }
}