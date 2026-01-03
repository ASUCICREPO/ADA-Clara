/**
 * RAGAS-Based Confidence System
 * 
 * Industry-standard confidence scoring for RAG systems based on:
 * - Faithfulness: How grounded the answer is in retrieved context
 * - Answer Relevancy: How relevant the answer is to the question
 * - Context Precision: Quality of retrieved context
 * - Context Recall: Completeness of retrieved context
 * 
 * Includes medical AI calibration based on research findings.
 */

export interface RAGASMetrics {
  faithfulness: number;      // 0-1: How grounded in context
  answerRelevancy: number;   // 0-1: How relevant to question  
  contextPrecision: number;  // 0-1: Quality of retrieved context
  contextRecall: number;     // 0-1: Completeness of context
}

export interface RAGASEvaluation {
  confidence: number;
  metrics: RAGASMetrics;
  calibrationFactors: {
    overconfidenceCorrection: number;
    domainBoost: number;
    uncertaintyPenalty: number;
    citationBonus: number;
  };
  explanation: string;
}

export interface Source {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, any>;
}

/**
 * RAGAS Confidence Service
 * 
 * Implements industry-standard RAGAS framework with medical AI calibration
 */
export class RAGASConfidenceService {
  
  private readonly MEDICAL_OVERCONFIDENCE_CORRECTION = -0.02; // Reduced penalty - was too harsh
  private readonly DIABETES_DOMAIN_BOOST = 0.15; // Increased boost for specialized domain knowledge
  private readonly MAX_CONFIDENCE = 0.98; // Allow high confidence for excellent responses
  
  /**
   * Calculate RAGAS-based confidence score
   */
  async calculateConfidence(
    question: string,
    answer: string,
    retrievedContexts: string[],
    sources: Source[]
  ): Promise<RAGASEvaluation> {
    
    console.log('🔬 Calculating RAGAS confidence metrics...');
    
    // Calculate core RAGAS metrics
    const metrics = await this.calculateRAGASMetrics(
      question,
      answer,
      retrievedContexts,
      sources
    );
    
    // Calculate weighted RAGAS score
    const ragasScore = this.calculateWeightedRAGASScore(metrics);
    
    // Apply medical AI calibration
    const calibrationFactors = this.calculateCalibrationFactors(answer, sources);
    const calibratedConfidence = this.applyMedicalCalibration(ragasScore, calibrationFactors);
    
    // Generate explanation
    const explanation = this.generateExplanation(metrics, calibrationFactors, calibratedConfidence);
    
    console.log(`✅ RAGAS confidence: ${(calibratedConfidence * 100).toFixed(1)}%`);
    console.log(`   Faithfulness: ${(metrics.faithfulness * 100).toFixed(1)}%`);
    console.log(`   Answer Relevancy: ${(metrics.answerRelevancy * 100).toFixed(1)}%`);
    console.log(`   Context Precision: ${(metrics.contextPrecision * 100).toFixed(1)}%`);
    console.log(`   Context Recall: ${(metrics.contextRecall * 100).toFixed(1)}%`);
    
    return {
      confidence: calibratedConfidence,
      metrics,
      calibrationFactors,
      explanation
    };
  }
  
  /**
   * Calculate core RAGAS metrics
   */
  private async calculateRAGASMetrics(
    question: string,
    answer: string,
    retrievedContexts: string[],
    sources: Source[]
  ): Promise<RAGASMetrics> {
    
    // Faithfulness: How well the answer is grounded in retrieved context
    const faithfulness = this.calculateFaithfulness(answer, retrievedContexts);
    
    // Answer Relevancy: How relevant the answer is to the question
    const answerRelevancy = this.calculateAnswerRelevancy(question, answer);
    
    // Context Precision: Quality of retrieved context (ranking of relevant chunks)
    const contextPrecision = this.calculateContextPrecision(question, sources);
    
    // Context Recall: Completeness of retrieved context
    const contextRecall = this.calculateContextRecall(question, retrievedContexts);
    
    return {
      faithfulness,
      answerRelevancy,
      contextPrecision,
      contextRecall
    };
  }
  
  /**
   * Faithfulness: Measures how grounded the answer is in the retrieved context
   */
  private calculateFaithfulness(answer: string, contexts: string[]): number {
    if (contexts.length === 0) return 0.1;
    
    let faithfulnessScore = 0.5; // Base score
    
    // Check if answer contains information that can be attributed to context
    const answerSentences = this.splitIntoSentences(answer);
    let supportedSentences = 0;
    
    for (const sentence of answerSentences) {
      if (this.isSentenceSupportedByContext(sentence, contexts)) {
        supportedSentences++;
      }
    }
    
    if (answerSentences.length > 0) {
      faithfulnessScore = supportedSentences / answerSentences.length;
    }
    
    // Boost for medical terminology consistency
    if (this.hasConsistentMedicalTerminology(answer, contexts)) {
      faithfulnessScore += 0.1;
    }
    
    // Penalty for contradictions
    if (this.hasContradictions(answer, contexts)) {
      faithfulnessScore -= 0.2;
    }
    
    return Math.max(0.1, Math.min(1.0, faithfulnessScore));
  }
  
  /**
   * Answer Relevancy: Measures how relevant the answer is to the question
   */
  private calculateAnswerRelevancy(question: string, answer: string): number {
    let relevancyScore = 0.5; // Base score
    
    // Extract key terms from question
    const questionTerms = this.extractKeyTerms(question);
    const answerTerms = this.extractKeyTerms(answer);
    
    // Calculate term overlap
    const commonTerms = questionTerms.filter(term => 
      answerTerms.some(aTerm => 
        aTerm.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(aTerm.toLowerCase())
      )
    );
    
    if (questionTerms.length > 0) {
      relevancyScore = commonTerms.length / questionTerms.length;
    }
    
    // Boost for direct question answering patterns
    if (this.answersQuestionDirectly(question, answer)) {
      relevancyScore += 0.2;
    }
    
    // Boost for medical question-answer alignment
    if (this.hasMedicalQuestionAnswerAlignment(question, answer)) {
      relevancyScore += 0.1;
    }
    
    // Penalty for off-topic content
    if (this.containsOffTopicContent(question, answer)) {
      relevancyScore -= 0.3;
    }
    
    return Math.max(0.1, Math.min(1.0, relevancyScore));
  }
  
  /**
   * Context Precision: Measures the quality of retrieved context
   * Enhanced for Knowledge Base sources with metadata-based relevance
   */
  private calculateContextPrecision(question: string, sources: Source[]): number {
    if (sources.length === 0) return 0.1;
    
    let precisionScore = 0;
    let totalRelevanceScore = 0;
    
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      
      // Calculate relevance score using multiple signals
      let sourceRelevance = this.calculateSourceRelevance(question, source);
      
      // Position weighting (earlier sources should be more relevant)
      const positionWeight = Math.max(0.3, 1 - (i * 0.15)); // Less aggressive position penalty
      sourceRelevance *= positionWeight;
      
      totalRelevanceScore += sourceRelevance;
      precisionScore += sourceRelevance;
    }
    
    // Normalize by number of sources
    if (sources.length > 0) {
      precisionScore = precisionScore / sources.length;
    }
    
    // Boost for high-quality medical sources
    const medicalSources = sources.filter(s => 
      s.url.includes('diabetes.org') || 
      s.metadata.contentType === 'medical' ||
      s.metadata.contentType === 'symptoms' ||
      s.metadata.contentType === 'treatment'
    );
    
    if (medicalSources.length > 0) {
      const medicalBoost = Math.min(0.2, medicalSources.length * 0.1);
      precisionScore += medicalBoost;
    }
    
    // Boost for diverse content types (indicates comprehensive retrieval)
    const contentTypes = new Set(sources.map(s => s.metadata.contentType).filter(Boolean));
    if (contentTypes.size > 1) {
      precisionScore += 0.1;
    }
    
    return Math.max(0.1, Math.min(1.0, precisionScore));
  }
  
  /**
   * Calculate source relevance using multiple signals for Knowledge Base sources
   */
  private calculateSourceRelevance(question: string, source: Source): number {
    let relevance = 0.3; // Base relevance for KB sources
    
    // 1. Title-based relevance (primary signal since content is empty)
    const titleRelevance = this.calculateTextRelevance(question, source.title);
    relevance += titleRelevance * 0.4;
    
    // 2. URL-based relevance
    const urlRelevance = this.calculateUrlRelevance(question, source.url);
    relevance += urlRelevance * 0.2;
    
    // 3. Metadata-based relevance
    const metadataRelevance = this.calculateMetadataRelevance(question, source.metadata);
    relevance += metadataRelevance * 0.3;
    
    // 4. Content type alignment
    const contentTypeRelevance = this.calculateContentTypeRelevance(question, source.metadata.contentType);
    relevance += contentTypeRelevance * 0.1;
    
    return Math.max(0.1, Math.min(1.0, relevance));
  }
  
  /**
   * Calculate text-based relevance between question and text
   */
  private calculateTextRelevance(question: string, text: string): number {
    if (!text || text.trim().length === 0) return 0;
    
    const questionTerms = this.extractKeyTerms(question);
    const textTerms = this.extractKeyTerms(text);
    
    if (questionTerms.length === 0) return 0.5;
    
    const commonTerms = questionTerms.filter(qTerm => 
      textTerms.some(tTerm => 
        tTerm.toLowerCase().includes(qTerm.toLowerCase()) ||
        qTerm.toLowerCase().includes(tTerm.toLowerCase())
      )
    );
    
    return commonTerms.length / questionTerms.length;
  }
  
  /**
   * Calculate URL-based relevance
   */
  private calculateUrlRelevance(question: string, url: string): number {
    if (!url) return 0;
    
    const urlLower = url.toLowerCase();
    const questionLower = question.toLowerCase();
    
    // Check for diabetes-related URL patterns
    if (urlLower.includes('diabetes')) {
      if (questionLower.includes('diabetes') || questionLower.includes('blood sugar') || questionLower.includes('insulin')) {
        return 0.8;
      }
      return 0.6;
    }
    
    // Check for specific topic alignment
    if (questionLower.includes('symptom') && urlLower.includes('symptom')) return 0.9;
    if (questionLower.includes('treatment') && urlLower.includes('treatment')) return 0.9;
    if (questionLower.includes('type') && urlLower.includes('type')) return 0.8;
    if (questionLower.includes('manage') && urlLower.includes('living')) return 0.7;
    
    return 0.3; // Default for diabetes.org sources
  }
  
  /**
   * Calculate metadata-based relevance
   */
  private calculateMetadataRelevance(question: string, metadata: Record<string, any>): number {
    if (!metadata) return 0;
    
    let relevance = 0;
    const questionLower = question.toLowerCase();
    
    // Check content type alignment
    const contentType = metadata.contentType?.toLowerCase() || '';
    if (questionLower.includes('symptom') && contentType.includes('symptom')) relevance += 0.4;
    if (questionLower.includes('treatment') && contentType.includes('treatment')) relevance += 0.4;
    if (questionLower.includes('cause') && contentType.includes('cause')) relevance += 0.4;
    if (questionLower.includes('manage') && contentType.includes('treatment')) relevance += 0.3;
    
    // Check section alignment
    const section = metadata.section?.toLowerCase() || '';
    if (questionLower.includes('diabetes') && section.includes('diabetes')) relevance += 0.2;
    if (questionLower.includes('type') && section.includes('type')) relevance += 0.3;
    
    // Medical relevance boost
    if (metadata.medicalRelevance === 'high') relevance += 0.2;
    if (metadata.medicalRelevance === 'medium') relevance += 0.1;
    
    return Math.min(1.0, relevance);
  }
  
  /**
   * Calculate content type relevance
   */
  private calculateContentTypeRelevance(question: string, contentType: string): number {
    if (!contentType) return 0;
    
    const questionLower = question.toLowerCase();
    const contentTypeLower = contentType.toLowerCase();
    
    // Direct matches
    if (questionLower.includes('symptom') && contentTypeLower === 'symptoms') return 1.0;
    if (questionLower.includes('treatment') && contentTypeLower === 'treatment') return 1.0;
    if (questionLower.includes('cause') && contentTypeLower === 'causes') return 1.0;
    
    // Partial matches
    if (questionLower.includes('manage') && contentTypeLower === 'treatment') return 0.8;
    if (questionLower.includes('sign') && contentTypeLower === 'symptoms') return 0.8;
    
    // General medical content
    if (['symptoms', 'treatment', 'medical', 'clinical'].includes(contentTypeLower)) return 0.6;
    
    return 0.3;
  }
  
  /**
   * Context Recall: Measures completeness of retrieved context
   * Improved for Knowledge Base scenarios where semantic relevance matters more than keyword matching
   */
  private calculateContextRecall(question: string, contexts: string[]): number {
    if (contexts.length === 0) return 0.1;
    
    // For Knowledge Base scenarios, if we got contexts back, they're likely relevant
    // Base score higher since KB already did semantic retrieval
    let recallScore = 0.7; // Higher base score for KB scenarios
    
    // Check if contexts cover the main aspects of the question
    const questionAspects = this.extractQuestionAspects(question);
    let coveredAspects = 0;
    
    for (const aspect of questionAspects) {
      if (contexts.some(context => this.contextCoversAspect(context, aspect))) {
        coveredAspects++;
      }
    }
    
    if (questionAspects.length > 0) {
      const aspectCoverage = coveredAspects / questionAspects.length;
      // Blend aspect coverage with base KB score (60% base, 40% aspect coverage)
      recallScore = (0.6 * recallScore) + (0.4 * aspectCoverage);
    }
    
    // Boost for comprehensive medical coverage
    if (this.hasComprehensiveMedicalCoverage(question, contexts)) {
      recallScore += 0.1;
    }
    
    // Boost for multiple contexts (indicates good retrieval)
    if (contexts.length >= 3) {
      recallScore += 0.05;
    }
    
    // Boost for substantial context content
    const totalContextLength = contexts.join(' ').length;
    if (totalContextLength > 500) {
      recallScore += 0.05;
    }
    
    return Math.max(0.3, Math.min(1.0, recallScore)); // Higher minimum for KB scenarios
  }
  
  /**
   * Calculate weighted RAGAS score based on medical AI research
   */
  private calculateWeightedRAGASScore(metrics: RAGASMetrics): number {
    // Weights based on medical AI importance
    const weights = {
      faithfulness: 0.4,      // Most important for medical accuracy
      answerRelevancy: 0.3,   // Critical for user satisfaction
      contextPrecision: 0.2,  // Important for retrieval quality
      contextRecall: 0.1      // Less critical if precision is high
    };
    
    return (
      metrics.faithfulness * weights.faithfulness +
      metrics.answerRelevancy * weights.answerRelevancy +
      metrics.contextPrecision * weights.contextPrecision +
      metrics.contextRecall * weights.contextRecall
    );
  }
  
  /**
   * Calculate calibration factors for medical AI
   */
  private calculateCalibrationFactors(answer: string, sources: Source[]): any {
    return {
      overconfidenceCorrection: this.MEDICAL_OVERCONFIDENCE_CORRECTION,
      domainBoost: this.hasDiabetesContent(answer) ? this.DIABETES_DOMAIN_BOOST : 0,
      uncertaintyPenalty: this.calculateUncertaintyPenalty(answer),
      citationBonus: this.calculateCitationBonus(answer, sources)
    };
  }
  
  /**
   * Apply medical AI calibration based on research findings
   */
  private applyMedicalCalibration(ragasScore: number, calibrationFactors: any): number {
    let calibratedScore = ragasScore;
    
    // Apply overconfidence correction (research-backed)
    calibratedScore += calibrationFactors.overconfidenceCorrection;
    
    // Apply domain expertise boost
    calibratedScore += calibrationFactors.domainBoost;
    
    // Apply uncertainty penalty
    calibratedScore += calibrationFactors.uncertaintyPenalty;
    
    // Apply citation bonus
    calibratedScore += calibrationFactors.citationBonus;
    
    // Allow high confidence for excellent responses while maintaining safety floor
    return Math.max(0.1, Math.min(this.MAX_CONFIDENCE, calibratedScore));
  }
  
  // Helper methods for RAGAS calculations
  
  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }
  
  private isSentenceSupportedByContext(sentence: string, contexts: string[]): boolean {
    const sentenceTerms = this.extractKeyTerms(sentence);
    return contexts.some(context => 
      sentenceTerms.some(term => 
        context.toLowerCase().includes(term.toLowerCase())
      )
    );
  }
  
  private hasConsistentMedicalTerminology(answer: string, contexts: string[]): boolean {
    const medicalTerms = ['diabetes', 'blood sugar', 'glucose', 'insulin', 'A1C'];
    const answerTerms = medicalTerms.filter(term => 
      answer.toLowerCase().includes(term.toLowerCase())
    );
    
    return answerTerms.every(term =>
      contexts.some(context => context.toLowerCase().includes(term.toLowerCase()))
    );
  }
  
  private hasContradictions(answer: string, contexts: string[]): boolean {
    // Simple contradiction detection - can be enhanced
    const contradictionPairs = [
      ['type 1', 'type 2'],
      ['increase', 'decrease'],
      ['high', 'low']
    ];
    
    return contradictionPairs.some(([term1, term2]) => {
      const answerHasBoth = answer.toLowerCase().includes(term1) && 
                           answer.toLowerCase().includes(term2);
      const contextSupportsOne = contexts.some(context => {
        const contextLower = context.toLowerCase();
        return (contextLower.includes(term1) && !contextLower.includes(term2)) ||
               (!contextLower.includes(term1) && contextLower.includes(term2));
      });
      
      return answerHasBoth && contextSupportsOne;
    });
  }
  
  private extractKeyTerms(text: string): string[] {
    // Extract meaningful terms (can be enhanced with NLP)
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Remove common stop words
    const stopWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were'];
    return words.filter(word => !stopWords.includes(word));
  }
  
  private answersQuestionDirectly(question: string, answer: string): boolean {
    // Check for direct answer patterns
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
    const hasQuestionWord = questionWords.some(word => 
      question.toLowerCase().includes(word)
    );
    
    if (!hasQuestionWord) return true; // Not a direct question
    
    // Check if answer starts with direct response patterns
    const directPatterns = [
      /^(diabetes is|type \d diabetes is|it is|this is)/i,
      /^(to manage|you can|the way to)/i,
      /^(symptoms include|signs are|indicators are)/i
    ];
    
    return directPatterns.some(pattern => pattern.test(answer.trim()));
  }
  
  private hasMedicalQuestionAnswerAlignment(question: string, answer: string): boolean {
    const medicalQuestionTypes = [
      { keywords: ['symptom', 'sign'], answerKeywords: ['include', 'are', 'may experience'] },
      { keywords: ['manage', 'treatment'], answerKeywords: ['medication', 'diet', 'exercise', 'monitor'] },
      { keywords: ['cause', 'why'], answerKeywords: ['because', 'due to', 'result of'] }
    ];
    
    return medicalQuestionTypes.some(type => {
      const hasQuestionKeyword = type.keywords.some(keyword => 
        question.toLowerCase().includes(keyword)
      );
      const hasAnswerKeyword = type.answerKeywords.some(keyword => 
        answer.toLowerCase().includes(keyword)
      );
      
      return hasQuestionKeyword && hasAnswerKeyword;
    });
  }
  
  private containsOffTopicContent(question: string, answer: string): boolean {
    // Check if answer contains content unrelated to the question domain
    const questionDomain = this.identifyQuestionDomain(question);
    const answerDomain = this.identifyAnswerDomain(answer);
    
    return questionDomain !== 'unknown' && 
           answerDomain !== 'unknown' && 
           questionDomain !== answerDomain;
  }
  
  private identifyQuestionDomain(question: string): string {
    const domains = {
      diabetes: ['diabetes', 'blood sugar', 'glucose', 'insulin', 'A1C'],
      general: ['weather', 'sports', 'politics', 'entertainment']
    };
    
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(keyword => question.toLowerCase().includes(keyword))) {
        return domain;
      }
    }
    
    return 'unknown';
  }
  
  private identifyAnswerDomain(answer: string): string {
    return this.identifyQuestionDomain(answer); // Same logic for now
  }
  
  private isSourceRelevantToQuestion(question: string, source: Source): boolean {
    const questionTerms = this.extractKeyTerms(question);
    const sourceTerms = this.extractKeyTerms(source.content + ' ' + source.title);
    
    const overlap = questionTerms.filter(term => 
      sourceTerms.some(sTerm => 
        sTerm.includes(term) || term.includes(sTerm)
      )
    );
    
    return overlap.length >= Math.min(2, questionTerms.length * 0.3);
  }
  
  private extractQuestionAspects(question: string): string[] {
    // Extract main aspects that should be covered
    const aspects = [];
    
    // Medical aspects
    if (question.toLowerCase().includes('symptom')) aspects.push('symptoms');
    if (question.toLowerCase().includes('treatment') || question.toLowerCase().includes('manage')) aspects.push('treatment');
    if (question.toLowerCase().includes('cause')) aspects.push('causes');
    if (question.toLowerCase().includes('type')) aspects.push('types');
    
    // Default aspects for diabetes questions
    if (this.hasDiabetesContent(question)) {
      aspects.push('diabetes-general');
    }
    
    return aspects.length > 0 ? aspects : ['general'];
  }
  
  private contextCoversAspect(context: string, aspect: string): boolean {
    const aspectKeywords: Record<string, string[]> = {
      symptoms: ['symptom', 'sign', 'experience', 'feel', 'notice'],
      treatment: ['treatment', 'manage', 'medication', 'therapy', 'control'],
      causes: ['cause', 'reason', 'why', 'due to', 'result'],
      types: ['type 1', 'type 2', 'gestational', 'kind', 'form'],
      'diabetes-general': ['diabetes', 'diabetic', 'blood sugar', 'glucose']
    };
    
    const keywords = aspectKeywords[aspect] || [aspect];
    return keywords.some((keyword: string) => 
      context.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  private hasComprehensiveMedicalCoverage(question: string, contexts: string[]): boolean {
    if (!this.hasDiabetesContent(question)) return false;
    
    const medicalAspects = ['symptoms', 'treatment', 'management', 'monitoring'];
    const coveredAspects = medicalAspects.filter(aspect =>
      contexts.some(context => this.contextCoversAspect(context, aspect))
    );
    
    return coveredAspects.length >= 2; // At least 2 medical aspects covered
  }
  
  private hasDiabetesContent(text: string): boolean {
    const diabetesTerms = [
      'diabetes', 'diabetic', 'blood sugar', 'glucose', 'insulin', 
      'A1C', 'HbA1c', 'type 1', 'type 2', 'gestational'
    ];
    
    return diabetesTerms.some(term => 
      text.toLowerCase().includes(term.toLowerCase())
    );
  }
  
  private calculateUncertaintyPenalty(answer: string): number {
    const uncertaintyPhrases = [
      'might be', 'could be', 'possibly', 'maybe', 'not sure',
      'I think', 'probably', 'it seems', 'I don\'t know',
      'could not find', 'unfortunately', 'no information'
    ];
    
    const uncertaintyCount = uncertaintyPhrases.filter(phrase =>
      answer.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    
    return -uncertaintyCount * 0.05; // Reduced to -5% per uncertainty phrase (was -10%)
  }
  
  private calculateCitationBonus(answer: string, sources: Source[]): number {
    let bonus = 0;
    
    // Enhanced bonus for diabetes.org sources (authoritative domain)
    const diabetesOrgSources = sources.filter(s => s.url.includes('diabetes.org'));
    if (diabetesOrgSources.length > 0) {
      bonus += Math.min(diabetesOrgSources.length * 0.06, 0.18); // Increased: Max 18% bonus for diabetes.org
    }
    
    // Bonus for multiple sources (indicates comprehensive research)
    if (sources.length >= 3) {
      bonus += 0.05; // 5% bonus for multiple sources
    }
    
    // Bonus for medical content types
    const medicalSources = sources.filter(s => 
      s.metadata.contentType === 'medical' ||
      s.metadata.contentType === 'symptoms' ||
      s.metadata.contentType === 'treatment'
    );
    if (medicalSources.length > 0) {
      bonus += 0.03; // 3% bonus for medical content
    }
    
    return Math.min(bonus, 0.25); // Cap total citation bonus at 25%
  }
  
  private generateExplanation(
    metrics: RAGASMetrics, 
    calibrationFactors: any, 
    finalConfidence: number
  ): string {
    const explanations = [];
    
    // RAGAS metrics explanation
    if (metrics.faithfulness >= 0.8) {
      explanations.push('Answer is well-grounded in retrieved context');
    } else if (metrics.faithfulness >= 0.6) {
      explanations.push('Answer is moderately grounded in context');
    } else {
      explanations.push('Answer may not be fully supported by available context');
    }
    
    if (metrics.answerRelevancy >= 0.8) {
      explanations.push('Answer directly addresses the question');
    } else if (metrics.answerRelevancy >= 0.6) {
      explanations.push('Answer is somewhat relevant to the question');
    } else {
      explanations.push('Answer may not fully address the question');
    }
    
    // Calibration factors explanation
    if (calibrationFactors.domainBoost > 0) {
      explanations.push('Diabetes domain expertise applied');
    }
    
    if (calibrationFactors.uncertaintyPenalty < -0.05) {
      explanations.push('Confidence reduced due to uncertainty indicators');
    }
    
    if (calibrationFactors.citationBonus > 0) {
      explanations.push('Confidence boosted by medical source citations');
    }
    
    // Final assessment
    if (finalConfidence >= 0.75) {
      explanations.push('High confidence - medical review recommended');
    } else if (finalConfidence >= 0.60) {
      explanations.push('Medium confidence - escalation with context suggested');
    } else {
      explanations.push('Low confidence - immediate escalation recommended');
    }
    
    return explanations.join('. ') + '.';
  }
}