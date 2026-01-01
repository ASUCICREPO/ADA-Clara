import { DynamoDBService } from '@core/services/dynamodb.service';

export interface DashboardMetrics {
  totalConversations: number;
  escalationRate: number;
  outOfScopeRate: number;
  trends: {
    conversations: string;
    escalations: string;
    outOfScope: string;
  };
}

export interface ConversationChartData {
  data: Array<{
    date: string;
    conversations: number;
  }>;
}

export interface LanguageSplit {
  english: number;
  spanish: number;
}

export interface Question {
  question: string;
  count: number;
}

export interface QuestionsResponse {
  questions: Question[];
}

export interface DashboardData {
  metrics: DashboardMetrics;
  conversationsChart: ConversationChartData;
  languageSplit: LanguageSplit;
  frequentlyAskedQuestions: Question[];
  unansweredQuestions: Question[];
  lastUpdated: string;
}

export class AnalyticsService {
  private readonly ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
  private readonly CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ada-clara-conversations';
  private readonly QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
  private readonly UNANSWERED_QUESTIONS_TABLE = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';

  constructor(private dynamoService: DynamoDBService) {}

  /**
   * Get dashboard metrics
   */
  async getMetrics(): Promise<DashboardMetrics> {
    try {
      // In production, this would query real analytics data from DynamoDB
      // For now, return mock data that matches frontend expectations
      // TODO: Implement real analytics queries when data is available
      
      return {
        totalConversations: 1234,
        escalationRate: 18,
        outOfScopeRate: 7,
        trends: {
          conversations: '+12%',
          escalations: '+6%',
          outOfScope: '+2%'
        }
      };
    } catch (error) {
      console.error('Error fetching metrics:', error);
      // Return default metrics on error
      return {
        totalConversations: 0,
        escalationRate: 0,
        outOfScopeRate: 0,
        trends: {
          conversations: '0%',
          escalations: '0%',
          outOfScope: '0%'
        }
      };
    }
  }

  /**
   * Get conversations over time chart data
   */
  async getConversationsChart(): Promise<ConversationChartData> {
    try {
      // In production, this would query conversations table with date aggregation
      // For now, return mock data for the last 7 days
      // TODO: Implement real conversation analytics when data is available
      
      const today = new Date();
      const data = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        
        // Mock conversation counts with some variation
        const baseCount = 150;
        const variation = Math.floor(Math.random() * 50) - 25;
        const conversations = Math.max(100, baseCount + variation);
        
        data.push({
          date: dateStr,
          conversations
        });
      }
      
      return { data };
    } catch (error) {
      console.error('Error fetching conversations chart:', error);
      return { data: [] };
    }
  }

  /**
   * Get language distribution data
   */
  async getLanguageSplit(): Promise<LanguageSplit> {
    try {
      // In production, this would query conversations table by language
      // For now, return mock data
      // TODO: Implement real language analytics when data is available
      
      return {
        english: 75,
        spanish: 25
      };
    } catch (error) {
      console.error('Error fetching language split:', error);
      return {
        english: 100,
        spanish: 0
      };
    }
  }

  /**
   * Get frequently asked questions
   */
  async getFrequentlyAskedQuestions(): Promise<Question[]> {
    try {
      // In production, this would query questions table ordered by frequency
      // For now, return mock data
      // TODO: Implement real FAQ analytics when data is available
      
      return [
        { question: 'What is type 1 diabetes?', count: 45 },
        { question: 'How do I manage blood sugar?', count: 38 },
        { question: 'What foods should I avoid?', count: 32 },
        { question: 'How often should I check glucose?', count: 28 },
        { question: 'What are diabetes complications?', count: 25 },
        { question: 'How much insulin should I take?', count: 22 },
        { question: 'Can I exercise with diabetes?', count: 19 },
        { question: 'What is the difference between type 1 and type 2?', count: 17 }
      ];
    } catch (error) {
      console.error('Error fetching frequently asked questions:', error);
      return [];
    }
  }

  /**
   * Get top unanswered questions
   */
  async getUnansweredQuestions(): Promise<Question[]> {
    try {
      // In production, this would query unanswered questions table
      // For now, return mock data
      // TODO: Implement real unanswered questions analytics when data is available
      
      return [
        { question: 'Can I take insulin with food?', count: 12 },
        { question: 'What happens if I miss my medication?', count: 9 },
        { question: 'How do I travel with diabetes supplies?', count: 8 },
        { question: 'Can diabetes affect my vision?', count: 7 },
        { question: 'What should I do during sick days?', count: 6 },
        { question: 'How do I handle low blood sugar at night?', count: 5 },
        { question: 'Can I drink alcohol with diabetes?', count: 4 }
      ];
    } catch (error) {
      console.error('Error fetching unanswered questions:', error);
      return [];
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    try {
      const [metrics, conversationsChart, languageSplit, frequentlyAsked, unanswered] = await Promise.all([
        this.getMetrics(),
        this.getConversationsChart(),
        this.getLanguageSplit(),
        this.getFrequentlyAskedQuestions(),
        this.getUnansweredQuestions()
      ]);

      return {
        metrics,
        conversationsChart,
        languageSplit,
        frequentlyAskedQuestions: frequentlyAsked,
        unansweredQuestions: unanswered,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  }

  /**
   * Health check for analytics service
   */
  async healthCheck(): Promise<{ status: string; service: string; timestamp: string }> {
    try {
      // Test database connectivity
      await this.dynamoService.healthCheck(this.ANALYTICS_TABLE);
      
      return {
        status: 'healthy',
        service: 'admin-analytics',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Analytics service health check failed:', error);
      return {
        status: 'unhealthy',
        service: 'admin-analytics',
        timestamp: new Date().toISOString()
      };
    }
  }
}