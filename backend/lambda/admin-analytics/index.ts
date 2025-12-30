/**
 * Admin Analytics Handler Lambda Function
 * Provides analytics data for the admin dashboard
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

interface MetricsData {
  totalConversations: number;
  escalationRate: number;
  outOfScopeRate: number;
  trends: {
    conversations: string;
    escalations: string;
    outOfScope: string;
  };
}

interface ConversationChartData {
  data: Array<{
    date: string;
    conversations: number;
  }>;
}

interface LanguageSplitData {
  english: number;
  spanish: number;
}

interface FrequentlyAskedQuestion {
  question: string;
  count: number;
}

interface UnansweredQuestion {
  question: string;
  count: number;
}

class AdminAnalyticsHandler {
  constructor() {
    // Initialize any required services
  }

  /**
   * Get metrics data for dashboard cards
   */
  async getMetrics(): Promise<MetricsData> {
    // In production, this would query DynamoDB analytics tables
    // For now, return mock data that matches frontend expectations
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
  }

  /**
   * Get conversations over time chart data
   */
  async getConversationsChart(): Promise<ConversationChartData> {
    // Mock data for the last 7 days
    return {
      data: [
        { date: '12/15', conversations: 140 },
        { date: '12/16', conversations: 165 },
        { date: '12/17', conversations: 155 },
        { date: '12/18', conversations: 180 },
        { date: '12/19', conversations: 195 },
        { date: '12/20', conversations: 175 },
        { date: '12/21', conversations: 165 }
      ]
    };
  }

  /**
   * Get language distribution data
   */
  async getLanguageSplit(): Promise<LanguageSplitData> {
    return {
      english: 75,
      spanish: 25
    };
  }

  /**
   * Get frequently asked questions
   */
  async getFrequentlyAskedQuestions(): Promise<FrequentlyAskedQuestion[]> {
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
  }

  /**
   * Get top unanswered questions
   */
  async getUnansweredQuestions(): Promise<UnansweredQuestion[]> {
    return [
      { question: 'Can I take insulin with food?', count: 12 },
      { question: 'What happens if I miss my medication?', count: 9 },
      { question: 'How do I travel with diabetes supplies?', count: 8 },
      { question: 'Can diabetes affect my vision?', count: 7 },
      { question: 'What should I do during sick days?', count: 6 },
      { question: 'How do I handle low blood sugar at night?', count: 5 },
      { question: 'Can I drink alcohol with diabetes?', count: 4 }
    ];
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(): Promise<any> {
    const [
      metrics,
      conversationsChart,
      languageSplit,
      frequentlyAsked,
      unanswered
    ] = await Promise.all([
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
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; service: string }> {
    return {
      status: 'healthy',
      service: 'admin-analytics'
    };
  }
}

/**
 * Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Admin analytics handler invoked:', JSON.stringify(event, null, 2));

  const analyticsHandler = new AdminAnalyticsHandler();

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Check for admin authentication (simplified - in production would validate JWT)
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader && !path.includes('/health')) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authentication required',
          message: 'Admin access required for analytics data'
        })
      };
    }

    if (method === 'GET' && path === '/admin/dashboard') {
      // Get comprehensive dashboard data
      const dashboardData = await analyticsHandler.getDashboardData();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(dashboardData)
      };

    } else if (method === 'GET' && path === '/admin/metrics') {
      // Get metrics data only
      const metrics = await analyticsHandler.getMetrics();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(metrics)
      };

    } else if (method === 'GET' && path === '/admin/conversations/chart') {
      // Get conversations chart data
      const chartData = await analyticsHandler.getConversationsChart();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(chartData)
      };

    } else if (method === 'GET' && path === '/admin/language-split') {
      // Get language distribution data
      const languageData = await analyticsHandler.getLanguageSplit();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(languageData)
      };

    } else if (method === 'GET' && path === '/admin/frequently-asked-questions') {
      // Get FAQ data
      const faqData = await analyticsHandler.getFrequentlyAskedQuestions();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({ questions: faqData })
      };

    } else if (method === 'GET' && path === '/admin/unanswered-questions') {
      // Get unanswered questions data
      const unansweredData = await analyticsHandler.getUnansweredQuestions();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({ questions: unansweredData })
      };

    } else if (method === 'GET' && (path === '/admin/health' || path === '/admin')) {
      // Health check
      const health = await analyticsHandler.healthCheck();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(health)
      };

    } else if (method === 'OPTIONS') {
      // CORS preflight
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: ''
      };

    } else {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Endpoint not found',
          availableEndpoints: [
            'GET /admin/dashboard',
            'GET /admin/metrics',
            'GET /admin/conversations/chart',
            'GET /admin/language-split',
            'GET /admin/frequently-asked-questions',
            'GET /admin/unanswered-questions',
            'GET /admin/health'
          ]
        })
      };
    }

  } catch (error) {
    console.error('Admin analytics handler error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};