/**
 * Content Enhancement Types
 * 
 * Type definitions for AI-powered content enhancement using Bedrock models
 * optimized for medical accuracy and embedding quality.
 */

export interface ContentEnhancementOptions {
  model: 'claude-3-sonnet' | 'claude-3-haiku' | 'claude-3-opus';
  maxTokens: number;
  temperature: number;
  enableMedicalValidation: boolean;
  enableFactChecking: boolean;
  preserveOriginalStructure: boolean;
  enhanceForEmbeddings: boolean;
  batchSize: number; // Number of chunks to process in parallel
}

export interface EnhancementRequest {
  content: string;
  contentType: 'symptoms' | 'treatment' | 'definition' | 'facts' | 'faq' | 'resource' | 'general';
  sourceUrl: string;
  medicalKeywords: string[];
  targetAudience: string[];
  enhancementGoals: EnhancementGoal[];
}

export type EnhancementGoal = 
  | 'improve-clarity'
  | 'add-context'
  | 'enhance-medical-accuracy'
  | 'optimize-for-search'
  | 'simplify-language'
  | 'add-examples'
  | 'improve-structure';

export interface EnhancementResult {
  success: boolean;
  originalContent: string;
  enhancedContent: string;
  embeddingOptimizedText: string;
  improvements: Enhancement[];
  qualityScore: number; // 0-1 score
  medicalAccuracyScore: number; // 0-1 score
  processingTime: number;
  tokensUsed: number;
  warnings: string[];
  error?: string;
}

export interface Enhancement {
  type: EnhancementGoal;
  description: string;
  confidence: number; // 0-1 score
  appliedChanges: string[];
}

export interface BatchEnhancementResult {
  success: boolean;
  results: EnhancementResult[];
  totalProcessed: number;
  totalSuccessful: number;
  totalFailed: number;
  totalTokensUsed: number;
  totalProcessingTime: number;
  averageQualityScore: number;
  averageMedicalAccuracyScore: number;
  warnings: string[];
  errors: string[];
}

export interface MedicalValidationResult {
  isValid: boolean;
  confidence: number; // 0-1 score
  issues: MedicalIssue[];
  suggestions: string[];
}

export interface MedicalIssue {
  type: 'inaccuracy' | 'outdated-info' | 'missing-context' | 'unclear-language';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string; // Text snippet where issue was found
  suggestion: string;
}

export interface EnhancementMetrics {
  contentLengthChange: number; // Percentage change in content length
  readabilityImprovement: number; // Improvement in readability score
  medicalAccuracyImprovement: number; // Improvement in medical accuracy
  embeddingQualityScore: number; // Quality of embedding-optimized text
  structuralPreservation: number; // How well original structure was preserved
  keywordDensityOptimization: number; // Optimization of medical keyword density
}

// Default configuration
export const DEFAULT_ENHANCEMENT_OPTIONS: ContentEnhancementOptions = {
  model: 'claude-3-sonnet',
  maxTokens: 4000,
  temperature: 0.1, // Low temperature for medical content
  enableMedicalValidation: true,
  enableFactChecking: true,
  preserveOriginalStructure: true,
  enhanceForEmbeddings: true,
  batchSize: 5
};

// Medical content specific configuration
export const MEDICAL_ENHANCEMENT_OPTIONS: ContentEnhancementOptions = {
  model: 'claude-3-opus', // Highest quality for medical content
  maxTokens: 6000,
  temperature: 0.05, // Very low temperature for accuracy
  enableMedicalValidation: true,
  enableFactChecking: true,
  preserveOriginalStructure: true,
  enhanceForEmbeddings: true,
  batchSize: 3 // Smaller batches for careful processing
};

// Fast processing configuration
export const FAST_ENHANCEMENT_OPTIONS: ContentEnhancementOptions = {
  model: 'claude-3-haiku',
  maxTokens: 2000,
  temperature: 0.2,
  enableMedicalValidation: false,
  enableFactChecking: false,
  preserveOriginalStructure: true,
  enhanceForEmbeddings: true,
  batchSize: 10
};

// Enhancement prompts
export const ENHANCEMENT_PROMPTS = {
  MEDICAL_ACCURACY: `You are a medical content expert. Review and enhance the following diabetes-related content for medical accuracy, clarity, and completeness. Ensure all medical information is current and accurate. Preserve the original structure and format.`,
  
  EMBEDDING_OPTIMIZATION: `Optimize the following content for semantic search and embedding generation. Improve clarity, add relevant context, and ensure key medical concepts are well-explained. Maintain the original meaning and structure.`,
  
  PATIENT_FRIENDLY: `Rewrite the following medical content to be more patient-friendly while maintaining medical accuracy. Use clear, simple language that patients and caregivers can easily understand. Include helpful context and examples where appropriate.`,
  
  FACT_CHECKING: `Review the following diabetes-related content for factual accuracy. Identify any potential inaccuracies, outdated information, or missing important context. Suggest improvements while preserving the original structure.`,
  
  STRUCTURE_IMPROVEMENT: `Improve the structure and organization of the following content while preserving all information. Enhance readability, add clear headings if needed, and ensure logical flow of information.`
};

// Quality assessment criteria
export interface QualityAssessmentCriteria {
  medicalAccuracy: number; // Weight for medical accuracy (0-1)
  clarity: number; // Weight for content clarity (0-1)
  completeness: number; // Weight for information completeness (0-1)
  readability: number; // Weight for readability (0-1)
  embeddingOptimization: number; // Weight for embedding quality (0-1)
}

export const DEFAULT_QUALITY_CRITERIA: QualityAssessmentCriteria = {
  medicalAccuracy: 0.3,
  clarity: 0.25,
  completeness: 0.2,
  readability: 0.15,
  embeddingOptimization: 0.1
};

// Enhancement events and monitoring
export interface EnhancementEvent {
  eventType: 'enhancement_started' | 'enhancement_completed' | 'validation_failed' | 'quality_issue';
  contentId?: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string;
  metadata?: Record<string, any>;
}

export type EnhancementEventHandler = (event: EnhancementEvent) => void;