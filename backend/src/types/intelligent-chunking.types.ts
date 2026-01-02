/**
 * Intelligent Chunking Types
 * 
 * Type definitions for semantic-aware content chunking with multiple strategies
 * optimized for Titan embeddings and medical content processing.
 */

export interface ContentChunk {
  id: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  tokenCount: number;
  wordCount: number;
  chunkingStrategy: ChunkingStrategy;
  semanticType?: string;
  medicalRelevance: number; // 0-1 score
  contextPreservation: ContextInfo;
  metadata: ChunkMetadata;
  overlap?: OverlapInfo;
}

// Structured JSON format optimized for Titan V2 and RAG
export interface StructuredChunk {
  id: string;
  content: string; // Markdown-style plain text with preserved structure
  metadata: StructuredChunkMetadata;
  embedding_text: string; // Clean, optimized text for Titan V2 embedding
}

export type ChunkingStrategy = 
  | 'semantic'      // Based on semantic sections and meaning
  | 'hierarchical'  // Based on document structure (headings, etc.)
  | 'factual'       // Based on medical facts and statements
  | 'hybrid'        // Combination of multiple strategies
  | 'fixed-size'    // Fixed token/word count (fallback)
  | 'sentence'      // Sentence-based chunking
  | 'paragraph';    // Paragraph-based chunking

export interface ChunkMetadata {
  sourceUrl: string;
  sourceTitle: string;
  sourceSection?: string;
  chunkType: 'content' | 'heading' | 'list' | 'table' | 'mixed';
  medicalKeywords: string[];
  factCount: number;
  qualityScore: number; // 0-1 score
  readabilityScore?: number;
  patientRelevance: 'high' | 'medium' | 'low';
  createdAt: string;
}

// Enhanced metadata for structured JSON format
export interface StructuredChunkMetadata {
  sourceUrl: string;
  sourceTitle: string;
  section: string;
  sectionPath: string;
  contentType: 'symptoms' | 'treatment' | 'definition' | 'facts' | 'faq' | 'resource' | 'general';
  medicalRelevance: 'high' | 'medium' | 'low';
  patientAudience: string[]; // e.g., ["newly-diagnosed", "parents", "caregivers"]
  medicalKeywords: string[];
  chunkIndex: number;
  totalChunks: number;
  tokenCount: number;
  lastUpdated: string;
  chunkingStrategy?: ChunkingStrategy;
  qualityScore?: number;
}

export interface ContextInfo {
  precedingContext: string; // Text before this chunk
  followingContext: string; // Text after this chunk
  sectionHeading?: string;
  parentSection?: string;
  relatedChunks: string[]; // IDs of related chunks
  contextScore: number; // How well context is preserved (0-1)
}

export interface OverlapInfo {
  overlapWithPrevious: number; // Number of overlapping tokens/words
  overlapWithNext: number;
  overlapStrategy: 'token' | 'sentence' | 'semantic';
}

export interface ChunkingOptions {
  strategy: ChunkingStrategy;
  targetTokenCount: number; // Target tokens per chunk (for Titan: 500-1000)
  maxTokenCount: number; // Maximum tokens per chunk
  minTokenCount: number; // Minimum tokens per chunk
  overlapTokens: number; // Overlap between chunks
  preserveContext: boolean;
  preserveSentences: boolean; // Don't break sentences
  preserveParagraphs: boolean; // Don't break paragraphs
  medicalFactGrouping: boolean; // Group related medical facts
  semanticCoherence: boolean; // Maintain semantic coherence
  qualityThreshold: number; // Minimum quality score (0-1)
}

export interface ChunkingResult {
  success: boolean;
  chunks: ContentChunk[];
  totalChunks: number;
  averageTokenCount: number;
  averageQualityScore: number;
  strategy: ChunkingStrategy;
  processingTime: number;
  metrics: ChunkingMetrics;
  warnings: string[];
  error?: string;
}

// Enhanced result with structured JSON chunks
export interface StructuredChunkingResult {
  success: boolean;
  chunks: StructuredChunk[];
  totalChunks: number;
  averageTokenCount: number;
  averageQualityScore: number;
  strategy: ChunkingStrategy;
  processingTime: number;
  metrics: ChunkingMetrics;
  warnings: string[];
  error?: string;
}

export interface ChunkingMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  tokenEfficiency: number; // Output/Input ratio
  contextPreservationScore: number; // Average context score
  semanticCoherenceScore: number; // How well chunks maintain meaning
  medicalRelevanceScore: number; // Average medical relevance
  chunkSizeVariance: number; // Consistency of chunk sizes
  overlapEfficiency: number; // How well overlaps preserve context
}

// Strategy-specific configurations
export interface SemanticChunkingConfig {
  sectionBoundaries: boolean; // Respect section boundaries
  topicCoherence: boolean; // Keep related topics together
  medicalFactClustering: boolean; // Group medical facts
  semanticSimilarityThreshold: number; // 0-1 threshold for grouping
}

export interface HierarchicalChunkingConfig {
  respectHeadings: boolean; // Don't break across headings
  maxDepth: number; // Maximum heading depth to consider
  includeHeadingInChunk: boolean; // Include heading text in chunk
  balanceChunkSizes: boolean; // Try to balance chunk sizes
}

export interface FactualChunkingConfig {
  factGroupingStrategy: 'category' | 'topic' | 'relevance';
  maxFactsPerChunk: number;
  includeContext: boolean; // Include surrounding context for facts
  factConfidenceThreshold: number; // Minimum confidence for facts
}

export interface HybridChunkingConfig {
  primaryStrategy: ChunkingStrategy;
  secondaryStrategy: ChunkingStrategy;
  strategyWeights: Record<ChunkingStrategy, number>;
  adaptiveThreshold: number; // When to switch strategies
}

// Content analysis for chunking
export interface ContentAnalysis {
  totalTokens: number;
  totalWords: number;
  totalSentences: number;
  totalParagraphs: number;
  headingCount: number;
  factCount: number;
  medicalTermDensity: number;
  structuralComplexity: number; // 0-1 score
  recommendedStrategy: ChunkingStrategy;
  estimatedChunks: number;
}

// Token counting and estimation
export interface TokenEstimation {
  method: 'tiktoken' | 'approximation' | 'word-based';
  tokensPerWord: number; // Average ratio
  confidence: number; // Confidence in estimation (0-1)
}

// Quality assessment for chunks
export interface ChunkQuality {
  completeness: number; // How complete the information is (0-1)
  coherence: number; // How coherent the content is (0-1)
  medicalAccuracy: number; // Medical accuracy score (0-1)
  contextPreservation: number; // How well context is preserved (0-1)
  readability: number; // Readability score (0-1)
  overallScore: number; // Combined quality score (0-1)
  issues: string[]; // Quality issues found
}

// Chunking events and monitoring
export interface ChunkingEvent {
  eventType: 'chunk_created' | 'strategy_changed' | 'quality_issue' | 'context_lost';
  chunkId?: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string;
  metadata?: Record<string, any>;
}

// Default configurations
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  strategy: 'hybrid',
  targetTokenCount: 750, // Optimal for Titan embeddings
  maxTokenCount: 1000,
  minTokenCount: 200,
  overlapTokens: 50,
  preserveContext: true,
  preserveSentences: true,
  preserveParagraphs: false,
  medicalFactGrouping: true,
  semanticCoherence: true,
  qualityThreshold: 0.6
};

export const TITAN_OPTIMIZED_OPTIONS: ChunkingOptions = {
  strategy: 'semantic',
  targetTokenCount: 800, // Optimal for Titan Embed Text v1
  maxTokenCount: 1200,
  minTokenCount: 300,
  overlapTokens: 75,
  preserveContext: true,
  preserveSentences: true,
  preserveParagraphs: true,
  medicalFactGrouping: true,
  semanticCoherence: true,
  qualityThreshold: 0.7
};

// Medical content specific configurations
export const MEDICAL_CONTENT_CHUNKING: ChunkingOptions = {
  strategy: 'factual',
  targetTokenCount: 600,
  maxTokenCount: 900,
  minTokenCount: 250,
  overlapTokens: 100, // Higher overlap for medical content
  preserveContext: true,
  preserveSentences: true,
  preserveParagraphs: true,
  medicalFactGrouping: true,
  semanticCoherence: true,
  qualityThreshold: 0.8 // Higher quality threshold for medical content
};

// Strategy selection criteria
export interface StrategySelectionCriteria {
  contentType: 'article' | 'faq' | 'resource' | 'event';
  contentLength: number;
  structuralComplexity: number;
  medicalDensity: number;
  targetUseCase: 'embedding' | 'summarization' | 'qa' | 'general';
}

export const STRATEGY_SELECTION_RULES: Record<string, ChunkingStrategy> = {
  'short_structured': 'hierarchical',
  'long_medical': 'factual',
  'faq_content': 'semantic',
  'mixed_content': 'hybrid',
  'simple_article': 'paragraph',
  'complex_guide': 'semantic'
};

// Performance and optimization
export interface ChunkingPerformance {
  processingTimeMs: number;
  tokensPerSecond: number;
  chunksPerSecond: number;
  memoryUsageMB: number;
  cacheHitRate?: number;
}

// Validation and testing
export interface ChunkValidation {
  isValid: boolean;
  tokenCountValid: boolean;
  contextPreserved: boolean;
  semanticCoherent: boolean;
  medicallyAccurate: boolean;
  validationErrors: string[];
  validationWarnings: string[];
}

// Export utility types
export type ChunkingStrategyConfig = 
  | SemanticChunkingConfig
  | HierarchicalChunkingConfig
  | FactualChunkingConfig
  | HybridChunkingConfig;

export type ChunkingEventHandler = (event: ChunkingEvent) => void;

export type QualityAssessmentFunction = (chunk: ContentChunk) => ChunkQuality;

export type TokenCountingFunction = (text: string) => number;