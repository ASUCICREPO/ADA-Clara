/**
 * Structured Content Extractor Types
 * 
 * Type definitions for semantic content analysis, medical fact extraction,
 * and hierarchical content organization.
 */

export interface SemanticSection {
  id: string;
  heading: string;
  content: string;
  semanticType: SemanticType;
  depth: number;
  position: number;
  keyTerms: string[];
  medicalFacts: MedicalFact[];
  patientRelevance: 'high' | 'medium' | 'low';
  subsections: SemanticSection[];
  wordCount: number;
  readabilityScore?: number;
}

export type SemanticType = 
  | 'medical-definition'
  | 'symptoms'
  | 'treatment'
  | 'prevention'
  | 'causes'
  | 'diagnosis'
  | 'management'
  | 'complications'
  | 'lifestyle'
  | 'nutrition'
  | 'exercise'
  | 'medication'
  | 'monitoring'
  | 'support'
  | 'research'
  | 'statistics'
  | 'faq'
  | 'general-info'
  | 'other';

export interface MedicalFact {
  id: string;
  statement: string;
  confidence: number; // 0-1 score
  category: MedicalFactCategory;
  source?: string;
  evidenceLevel: 'high' | 'medium' | 'low';
  keyTerms: string[];
  relatedFacts: string[]; // IDs of related facts
}

export type MedicalFactCategory =
  | 'definition'
  | 'symptom'
  | 'treatment-option'
  | 'risk-factor'
  | 'prevention-method'
  | 'diagnostic-criteria'
  | 'complication'
  | 'lifestyle-recommendation'
  | 'medication-info'
  | 'monitoring-guideline'
  | 'statistical-data'
  | 'research-finding';

export interface ContentMetadata {
  contentCategories: string[];
  relatedTopics: string[];
  targetAudience: string[];
  medicalAccuracy: 'peer-reviewed' | 'professional' | 'educational' | 'general' | 'unknown';
  lastFactCheck?: string;
  qualityScore: number; // 0-1 score
  readabilityLevel?: 'elementary' | 'middle-school' | 'high-school' | 'college' | 'graduate';
  medicalComplexity?: 'basic' | 'intermediate' | 'advanced' | 'expert';
}

export interface StructuredContent {
  url: string;
  title: string;
  summary: string;
  sections: SemanticSection[];
  metadata: ContentMetadata;
  extractedAt: string;
  processingTime: number;
  totalFacts: number;
  totalSections: number;
  hierarchyDepth: number;
}

export interface ExtractionOptions {
  includeSubsections: boolean;
  maxDepth: number;
  minSectionLength: number;
  extractMedicalFacts: boolean;
  calculateReadability: boolean;
  medicalKeywords: string[];
  relevanceThreshold: number;
  factConfidenceThreshold: number;
}

export interface ExtractionResult {
  success: boolean;
  content?: StructuredContent;
  error?: string;
  warnings: string[];
  metrics: ExtractionMetrics;
}

export interface ExtractionMetrics {
  processingTime: number;
  sectionsFound: number;
  factsExtracted: number;
  keyTermsIdentified: number;
  averageRelevanceScore: number;
  qualityScore: number;
  hierarchyComplexity: number;
}

// Content analysis patterns
export interface ContentPattern {
  name: string;
  pattern: RegExp;
  semanticType: SemanticType;
  weight: number;
  medicalRelevance: number;
}

export interface MedicalKeywordSet {
  category: MedicalFactCategory;
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

// Predefined patterns for medical content
export const MEDICAL_CONTENT_PATTERNS: ContentPattern[] = [
  {
    name: 'symptoms-section',
    pattern: /(?:symptoms?|signs?|manifestations?)/i,
    semanticType: 'symptoms',
    weight: 0.9,
    medicalRelevance: 0.95
  },
  {
    name: 'treatment-section',
    pattern: /(?:treatment|therapy|management|care)/i,
    semanticType: 'treatment',
    weight: 0.9,
    medicalRelevance: 0.95
  },
  {
    name: 'prevention-section',
    pattern: /(?:prevention|prevent|avoiding|reduce risk)/i,
    semanticType: 'prevention',
    weight: 0.8,
    medicalRelevance: 0.85
  },
  {
    name: 'causes-section',
    pattern: /(?:causes?|etiology|risk factors?)/i,
    semanticType: 'causes',
    weight: 0.8,
    medicalRelevance: 0.85
  },
  {
    name: 'diagnosis-section',
    pattern: /(?:diagnosis|diagnostic|testing|screening)/i,
    semanticType: 'diagnosis',
    weight: 0.85,
    medicalRelevance: 0.9
  },
  {
    name: 'complications-section',
    pattern: /(?:complications?|risks?|problems)/i,
    semanticType: 'complications',
    weight: 0.8,
    medicalRelevance: 0.9
  },
  {
    name: 'lifestyle-section',
    pattern: /(?:lifestyle|living with|daily life|self-care)/i,
    semanticType: 'lifestyle',
    weight: 0.7,
    medicalRelevance: 0.8
  },
  {
    name: 'nutrition-section',
    pattern: /(?:nutrition|diet|food|eating|meal)/i,
    semanticType: 'nutrition',
    weight: 0.8,
    medicalRelevance: 0.85
  },
  {
    name: 'medication-section',
    pattern: /(?:medication|medicine|drugs?|insulin|prescription)/i,
    semanticType: 'medication',
    weight: 0.9,
    medicalRelevance: 0.95
  },
  {
    name: 'monitoring-section',
    pattern: /(?:monitoring|tracking|checking|measuring)/i,
    semanticType: 'monitoring',
    weight: 0.8,
    medicalRelevance: 0.85
  }
];

export const DIABETES_MEDICAL_KEYWORDS: MedicalKeywordSet[] = [
  {
    category: 'definition',
    keywords: ['diabetes', 'blood sugar', 'glucose', 'insulin', 'pancreas', 'hormone'],
    patterns: [/diabetes\s+(?:mellitus|type)/i, /blood\s+(?:sugar|glucose)/i],
    weight: 1.0
  },
  {
    category: 'symptom',
    keywords: ['thirst', 'urination', 'fatigue', 'blurred vision', 'weight loss', 'hunger'],
    patterns: [/increased\s+(?:thirst|urination)/i, /blurred\s+vision/i],
    weight: 0.9
  },
  {
    category: 'treatment-option',
    keywords: ['insulin', 'medication', 'metformin', 'therapy', 'injection', 'pump'],
    patterns: [/insulin\s+(?:therapy|injection|pump)/i, /oral\s+medication/i],
    weight: 0.95
  },
  {
    category: 'complication',
    keywords: ['neuropathy', 'retinopathy', 'nephropathy', 'heart disease', 'stroke'],
    patterns: [/diabetic\s+(?:neuropathy|retinopathy|nephropathy)/i],
    weight: 0.9
  },
  {
    category: 'monitoring-guideline',
    keywords: ['A1C', 'blood glucose', 'monitoring', 'testing', 'meter', 'strips'],
    patterns: [/A1C\s+(?:test|level)/i, /blood\s+glucose\s+(?:monitoring|testing)/i],
    weight: 0.85
  },
  {
    category: 'lifestyle-recommendation',
    keywords: ['exercise', 'diet', 'nutrition', 'weight', 'activity', 'lifestyle'],
    patterns: [/healthy\s+(?:diet|eating|lifestyle)/i, /regular\s+exercise/i],
    weight: 0.8
  }
];

// Content quality indicators
export interface QualityIndicator {
  name: string;
  weight: number;
  evaluate: (content: string, sections: SemanticSection[]) => number;
}

export const CONTENT_QUALITY_INDICATORS: QualityIndicator[] = [
  {
    name: 'structure-completeness',
    weight: 0.2,
    evaluate: (content: string, sections: SemanticSection[]) => {
      const hasMultipleSections = sections.length > 1;
      const hasHierarchy = sections.some(s => s.subsections.length > 0);
      const hasVariedTypes = new Set(sections.map(s => s.semanticType)).size > 2;
      
      return (hasMultipleSections ? 0.4 : 0) + 
             (hasHierarchy ? 0.3 : 0) + 
             (hasVariedTypes ? 0.3 : 0);
    }
  },
  {
    name: 'medical-fact-density',
    weight: 0.25,
    evaluate: (content: string, sections: SemanticSection[]) => {
      const totalFacts = sections.reduce((sum, s) => sum + s.medicalFacts.length, 0);
      const totalWords = sections.reduce((sum, s) => sum + s.wordCount, 0);
      const factDensity = totalWords > 0 ? totalFacts / (totalWords / 100) : 0;
      
      return Math.min(factDensity / 5, 1.0); // Normalize to 0-1
    }
  },
  {
    name: 'content-depth',
    weight: 0.2,
    evaluate: (content: string, sections: SemanticSection[]) => {
      const avgWordCount = sections.length > 0 ? 
        sections.reduce((sum, s) => sum + s.wordCount, 0) / sections.length : 0;
      const depthScore = Math.min(avgWordCount / 200, 1.0);
      
      return depthScore;
    }
  },
  {
    name: 'semantic-diversity',
    weight: 0.15,
    evaluate: (content: string, sections: SemanticSection[]) => {
      const uniqueTypes = new Set(sections.map(s => s.semanticType)).size;
      const maxTypes = 8; // Reasonable maximum for diversity
      
      return Math.min(uniqueTypes / maxTypes, 1.0);
    }
  },
  {
    name: 'patient-relevance',
    weight: 0.2,
    evaluate: (content: string, sections: SemanticSection[]) => {
      const relevanceScores = sections.map(s => {
        switch (s.patientRelevance) {
          case 'high': return 1.0;
          case 'medium': return 0.6;
          case 'low': return 0.2;
          default: return 0;
        }
      });
      
      return relevanceScores.length > 0 ? 
        relevanceScores.reduce((sum: number, score: number) => sum + score, 0) / relevanceScores.length : 0;
    }
  }
];

// Error handling
export interface ExtractionError {
  type: 'parsing' | 'analysis' | 'validation' | 'processing';
  message: string;
  section?: string;
  recoverable: boolean;
  timestamp: string;
}

// Configuration for different content types
export interface ContentTypeConfig {
  contentType: string;
  patterns: ContentPattern[];
  keywords: MedicalKeywordSet[];
  qualityIndicators: QualityIndicator[];
  extractionOptions: ExtractionOptions;
}

export const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
  includeSubsections: true,
  maxDepth: 4,
  minSectionLength: 50,
  extractMedicalFacts: true,
  calculateReadability: false,
  medicalKeywords: DIABETES_MEDICAL_KEYWORDS.flatMap(set => set.keywords),
  relevanceThreshold: 0.3,
  factConfidenceThreshold: 0.6
};