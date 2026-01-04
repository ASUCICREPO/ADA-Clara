import { createHash } from 'crypto';
import { DynamoDBService } from './dynamodb-service';
import { QuestionRecord } from '../types/index';

/**
 * Question Processing Service
 * Handles extraction, normalization, categorization, and aggregation of user questions
 */
export class QuestionProcessingService {
  private dynamoService: DynamoDBService;

  constructor(dynamoService: DynamoDBService) {
    this.dynamoService = dynamoService;
  }

  /**
   * Process a user question from chat interaction
   */
  async processQuestion(
    originalQuestion: string,
    botResponse: string,
    confidenceScore: number,
    language: 'en' | 'es',
    sessionId: string,
    escalated: boolean = false
  ): Promise<void> {
    try {
      // Check if this is a diabetes-related question using out-of-scope detection
      const isDiabetesRelated = this.isDiabetesRelated(botResponse);
      
      if (!isDiabetesRelated) {
        console.log(`🚫 Skipping out-of-scope question: ${originalQuestion.substring(0, 100)}...`);
        return;
      }

      // Normalize the question
      const normalizedQuestion = this.normalizeQuestion(originalQuestion, language);
      
      // Generate question hash for deduplication
      const questionHash = this.generateQuestionHash(normalizedQuestion);
      
      // Categorize the question
      const category = this.categorizeQuestion(normalizedQuestion, language);
      
      // Determine if question was answered based on confidence score
      const isAnswered = confidenceScore >= 0.7; // Threshold for "answered"
      
      // Create question record
      const questionRecord: QuestionRecord = {
        questionHash,
        originalQuestion,
        normalizedQuestion,
        category,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        count: 1,
        totalConfidenceScore: confidenceScore,
        averageConfidenceScore: confidenceScore,
        answeredCount: isAnswered ? 1 : 0,
        unansweredCount: isAnswered ? 0 : 1,
        escalationCount: escalated ? 1 : 0,
        language,
        lastAsked: new Date().toISOString()
      };

      // Store or update the question record
      await this.dynamoService.createOrUpdateQuestionRecord(questionRecord);
      
      console.log(`✅ Processed question: ${category} | ${normalizedQuestion.substring(0, 50)}... | Answered: ${isAnswered}`);
    } catch (error) {
      console.error('Error processing question:', error);
      // Don't throw - question processing shouldn't break chat flow
    }
  }

  /**
   * Check if question is diabetes-related using out-of-scope detection logic
   * This mirrors the logic from chat.service.ts
   */
  private isDiabetesRelated(botResponse: string): boolean {
    if (!botResponse) return true; // Assume diabetes-related if no response
    
    // Check for out-of-scope indicators in bot response
    const outOfScopeIndicators = [
      "I can only answer questions about information on diabetes.org",
      "solo puedo responder preguntas sobre información en diabetes.org",
      "outside the scope of diabetes",
      "not related to diabetes",
      "beyond diabetes topics"
    ];

    return !outOfScopeIndicators.some(indicator =>
      botResponse.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Normalize question text for better matching and deduplication
   */
  private normalizeQuestion(question: string, language: 'en' | 'es'): string {
    let normalized = question.toLowerCase().trim();

    // Remove common question words and punctuation
    if (language === 'en') {
      normalized = normalized
        .replace(/^(what|how|when|where|why|who|can|could|should|would|will|is|are|do|does|did)\s+/i, '')
        .replace(/\?+$/, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (language === 'es') {
      normalized = normalized
        .replace(/^(qué|cómo|cuándo|dónde|por qué|quién|puede|podría|debería|haría|será|es|son|hacer|hace|hizo)\s+/i, '')
        .replace(/\?+$/, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return normalized;
  }

  /**
   * Generate a hash for question deduplication
   */
  private generateQuestionHash(normalizedQuestion: string): string {
    return createHash('md5').update(normalizedQuestion).digest('hex');
  }

  /**
   * Categorize question based on content
   */
  private categorizeQuestion(normalizedQuestion: string, language: 'en' | 'es'): string {
    const questionLower = normalizedQuestion.toLowerCase();

    // Define category keywords for both languages
    const categories = {
      'type-1': {
        en: ['type 1', 'type one', 't1d', 'insulin dependent', 'juvenile diabetes', 'autoimmune'],
        es: ['tipo 1', 'tipo uno', 't1d', 'dependiente de insulina', 'diabetes juvenil', 'autoinmune']
      },
      'type-2': {
        en: ['type 2', 'type two', 't2d', 'adult onset', 'insulin resistance'],
        es: ['tipo 2', 'tipo dos', 't2d', 'inicio adulto', 'resistencia insulina']
      },
      'medication': {
        en: ['insulin', 'medication', 'medicine', 'drug', 'metformin', 'injection', 'dose', 'dosage'],
        es: ['insulina', 'medicamento', 'medicina', 'droga', 'metformina', 'inyección', 'dosis']
      },
      'diet': {
        en: ['food', 'eat', 'diet', 'nutrition', 'carb', 'carbohydrate', 'sugar', 'meal', 'snack'],
        es: ['comida', 'comer', 'dieta', 'nutrición', 'carbohidrato', 'azúcar', 'comida', 'merienda']
      },
      'exercise': {
        en: ['exercise', 'workout', 'physical activity', 'sport', 'gym', 'running', 'walking'],
        es: ['ejercicio', 'entrenamiento', 'actividad física', 'deporte', 'gimnasio', 'correr', 'caminar']
      },
      'blood-sugar': {
        en: ['blood sugar', 'glucose', 'bg', 'blood glucose', 'sugar level', 'hyperglycemia', 'hypoglycemia', 'low blood sugar', 'high blood sugar'],
        es: ['azúcar en sangre', 'glucosa', 'glucemia', 'nivel azúcar', 'hiperglucemia', 'hipoglucemia', 'azúcar bajo', 'azúcar alto']
      },
      'complications': {
        en: ['complication', 'neuropathy', 'retinopathy', 'nephropathy', 'heart disease', 'kidney', 'eye', 'foot'],
        es: ['complicación', 'neuropatía', 'retinopatía', 'nefropatía', 'enfermedad cardíaca', 'riñón', 'ojo', 'pie']
      },
      'symptoms': {
        en: ['symptom', 'sign', 'thirsty', 'urination', 'tired', 'fatigue', 'blurred vision', 'weight loss'],
        es: ['síntoma', 'signo', 'sed', 'orina', 'cansado', 'fatiga', 'visión borrosa', 'pérdida peso']
      },
      'management': {
        en: ['manage', 'control', 'monitor', 'check', 'test', 'meter', 'cgm', 'continuous glucose'],
        es: ['manejar', 'controlar', 'monitorear', 'verificar', 'prueba', 'medidor', 'cgm', 'glucosa continua']
      }
    };

    // Check each category
    for (const [category, keywords] of Object.entries(categories)) {
      const relevantKeywords = keywords[language] || keywords.en;
      if (relevantKeywords.some(keyword => questionLower.includes(keyword))) {
        return category;
      }
    }

    return 'diabetes-general'; // Default category
  }

  /**
   * Get frequently asked questions with enhanced filtering
   */
  async getFrequentlyAskedQuestions(
    limit: number = 10,
    language?: 'en' | 'es',
    category?: string,
    minCount: number = 2
  ): Promise<Array<{ question: string; count: number; category: string; language: 'en' | 'es' }>> {
    try {
      const questions: Array<{ question: string; count: number; category: string; language: 'en' | 'es' }> = [];
      
      // Get questions from the last 30 days
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Query by category if specified, otherwise get from multiple categories
      const categoriesToQuery = category ? [category] : [
        'diabetes-general', 'type-1', 'type-2', 'medication', 'diet',
        'exercise', 'blood-sugar', 'complications', 'symptoms', 'management'
      ];

      for (const cat of categoriesToQuery) {
        try {
          const categoryQuestions = await this.dynamoService.getQuestionsByCategory(cat, 50);
          
          for (const q of categoryQuestions) {
            // Filter by language if specified
            if (language && q.language !== language) continue;

            // Filter by minimum count
            if (q.count < minCount) continue;

            // Only include questions that were asked recently (within date range)
            const lastAskedDate = new Date(q.lastAsked);
            if (lastAskedDate < startDate) continue;

            questions.push({
              question: q.originalQuestion,
              count: q.count,
              category: q.category,
              language: q.language
            });
          }
        } catch (error) {
          console.log(`No questions found for category: ${cat}`);
        }
      }

      // Sort by count (descending) and return top results
      return questions
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    } catch (error) {
      console.error('Error getting frequently asked questions:', error);
      return [];
    }
  }

  /**
   * Get unanswered questions with enhanced filtering
   */
  async getUnansweredQuestions(
    limit: number = 10,
    language?: 'en' | 'es',
    category?: string,
    minUnansweredCount: number = 1
  ): Promise<Array<{ question: string; count: number; category: string; language: 'en' | 'es'; unansweredRate: number }>> {
    try {
      const questions: Array<{
        question: string;
        count: number;
        category: string;
        language: 'en' | 'es';
        unansweredRate: number
      }> = [];

      // Get questions from the last 30 days
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Query unanswered questions by date
      for (let i = 0; i < 30; i++) {
        const date = new Date(endDate);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        try {
          const dayQuestions = await this.dynamoService.getUnansweredQuestionsByDate(dateStr, 50);
          
          for (const q of dayQuestions) {
            // Filter by language if specified
            if (language && q.language !== language) continue;

            // Filter by category if specified
            if (category && q.category !== category) continue;

            // Filter by minimum unanswered count
            if (q.unansweredCount < minUnansweredCount) continue;
            
            // Calculate unanswered rate
            const unansweredRate = q.count > 0 ? (q.unansweredCount / q.count) * 100 : 0;
            
            // Only include questions with significant unanswered rate (>50%)
            if (unansweredRate < 50) continue;

            questions.push({
              question: q.originalQuestion,
              count: q.unansweredCount,
              category: q.category,
              language: q.language,
              unansweredRate
            });
          }
        } catch (error) {
          // Continue if no questions for this date
        }
      }

      // Deduplicate by question hash and aggregate counts
      const questionMap = new Map<string, typeof questions[0]>();
      
      for (const q of questions) {
        const hash = this.generateQuestionHash(this.normalizeQuestion(q.question, q.language));
        const existing = questionMap.get(hash);

        if (existing) {
          existing.count += q.count;
          // Keep the higher unanswered rate
          if (q.unansweredRate > existing.unansweredRate) {
            existing.unansweredRate = q.unansweredRate;
          }
        } else {
          questionMap.set(hash, q);
        }
      }

      // Sort by unanswered count (descending) and return top results
      return Array.from(questionMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    } catch (error) {
      console.error('Error getting unanswered questions:', error);
      return [];
    }
  }

  /**
   * Get question analytics for a specific time period
   */
  async getQuestionAnalytics(
    startDate: string,
    endDate: string,
    language?: 'en' | 'es'
  ): Promise<{
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    answerRate: number;
    topCategories: Array<{ category: string; count: number; answerRate: number }>;
    languageDistribution: { en: number; es: number };
  }> {
    try {
      // Get questions from the Questions table for the date range
      const allQuestions: Array<{ question: string; count: number; category: string; language: 'en' | 'es'; answeredCount: number; unansweredCount: number }> = [];
      
      // Query each date in the range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        try {
          // Get questions for this date
          const dayQuestions = await this.dynamoService.getUnansweredQuestionsByDate(dateStr, 1000);
          allQuestions.push(...dayQuestions.map(q => ({
            question: q.originalQuestion,
            count: q.count,
            category: q.category,
            language: q.language,
            answeredCount: q.answeredCount,
            unansweredCount: q.unansweredCount
          })));
        } catch (error) {
          // Continue if no questions for this date
        }
      }
      
      // Also get questions by category to ensure we have all data
      const categories = ['diabetes-general', 'type-1', 'type-2', 'medication', 'diet', 'exercise', 'blood-sugar', 'complications', 'symptoms', 'management'];
      
      for (const category of categories) {
        try {
          const categoryQuestions = await this.dynamoService.getQuestionsByCategory(category, 100);
          
          // Filter by date range and add to collection
          for (const q of categoryQuestions) {
            const questionDate = new Date(q.lastAsked);
            if (questionDate >= start && questionDate <= end) {
              allQuestions.push({
                question: q.originalQuestion,
                count: q.count,
                category: q.category,
                language: q.language,
                answeredCount: q.answeredCount,
                unansweredCount: q.unansweredCount
              });
            }
          }
        } catch (error) {
          // Continue if no questions for this category
        }
      }

      // Deduplicate questions by hash
      const questionMap = new Map<string, typeof allQuestions[0]>();
      
      for (const q of allQuestions) {
        const hash = this.generateQuestionHash(this.normalizeQuestion(q.question, q.language));
        const existing = questionMap.get(hash);

        if (existing) {
          // Aggregate counts
          existing.count += q.count;
          existing.answeredCount += q.answeredCount;
          existing.unansweredCount += q.unansweredCount;
        } else {
          questionMap.set(hash, { ...q });
        }
      }

      const uniqueQuestions = Array.from(questionMap.values());
      
      // Filter by language if specified
      const filteredQuestions = language 
        ? uniqueQuestions.filter(q => q.language === language)
        : uniqueQuestions;

      // Calculate totals
      let totalQuestions = 0;
      let answeredQuestions = 0;
      let unansweredQuestions = 0;
      const categoryStats = new Map<string, { total: number; answered: number }>();
      const languageStats = { en: 0, es: 0 };

      for (const q of filteredQuestions) {
        totalQuestions += q.count;
        answeredQuestions += q.answeredCount;
        unansweredQuestions += q.unansweredCount;
        
        languageStats[q.language] += q.count;

        // Track category stats
        const categoryData = categoryStats.get(q.category) || { total: 0, answered: 0 };
        categoryData.total += q.count;
        categoryData.answered += q.answeredCount;
        categoryStats.set(q.category, categoryData);
      }

      const answerRate = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;
      
      // Convert category stats to sorted array
      const topCategories = Array.from(categoryStats.entries())
        .map(([category, stats]) => ({
          category,
          count: stats.total,
          answerRate: stats.total > 0 ? (stats.answered / stats.total) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalQuestions,
        answeredQuestions,
        unansweredQuestions,
        answerRate,
        topCategories,
        languageDistribution: languageStats
      };

    } catch (error) {
      console.error('Error getting question analytics:', error);
      return {
        totalQuestions: 0,
        answeredQuestions: 0,
        unansweredQuestions: 0,
        answerRate: 0,
        topCategories: [],
        languageDistribution: { en: 0, es: 0 }
      };
    }
  }

  /**
   * Simple language estimation based on common words
   */
  private estimateLanguage(text: string): 'en' | 'es' {
    const spanishWords = ['qué', 'cómo', 'cuándo', 'dónde', 'por', 'para', 'con', 'sin', 'diabetes', 'azúcar', 'insulina'];
    const englishWords = ['what', 'how', 'when', 'where', 'with', 'without', 'diabetes', 'sugar', 'insulin'];
    
    const textLower = text.toLowerCase();
    const spanishCount = spanishWords.filter(word => textLower.includes(word)).length;
    const englishCount = englishWords.filter(word => textLower.includes(word)).length;
    
    return spanishCount > englishCount ? 'es' : 'en';
  }
}