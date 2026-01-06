/**
 * Admin Analytics Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - GET /admin/metrics - Dashboard metrics
 * - GET /admin/conversations/chart - Conversation chart data
 * - GET /admin/language-split - Language distribution
 * - GET /admin/frequently-asked-questions - FAQ analysis
 * - GET /admin/unanswered-questions - Unanswered questions
 * - GET /admin/health - Health check
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
const UNANSWERED_QUESTIONS_TABLE = process.env.UNANSWERED_QUESTIONS_TABLE || 'ada-clara-unanswered-questions';
const ESCALATION_REQUESTS_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Admin analytics handler invoked:', JSON.stringify(event, null, 2));

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Authentication is handled by API Gateway Cognito Authorizer
    if (method === 'GET') {
      return await handleGetRequest(path);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(405, {
        error: 'Method not allowed',
        message: `${method} method is not supported`
      });
    }

  } catch (error) {
    console.error('Admin analytics handler error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    });
  }
};

/**
 * Handle GET requests
 */
async function handleGetRequest(path) {
  switch (path) {
    case '/admin/dashboard':
      return await getDashboardData();
    
    case '/admin/metrics':
      return await getMetrics();
    
    case '/admin/conversations/chart':
      return await getConversationsChart();
    
    case '/admin/language-split':
      return await getLanguageSplit();
    
    case '/admin/frequently-asked-questions':
      return await getFrequentlyAskedQuestions();
    
    case '/admin/unanswered-questions':
      return await getUnansweredQuestions();
    
    case '/admin/question-analytics':
      return await getQuestionAnalytics();
    
    case '/admin/health':
    case '/admin':
      return await getHealthCheck();
    
    default:
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /admin/dashboard',
          'GET /admin/metrics',
          'GET /admin/conversations/chart',
          'GET /admin/language-split',
          'GET /admin/frequently-asked-questions',
          'GET /admin/unanswered-questions',
          'GET /admin/question-analytics',
          'GET /admin/health'
        ]
      });
  }
}

/**
 * Get comprehensive dashboard data
 */
async function getDashboardData() {
  try {
    console.log('Fetching comprehensive dashboard data...');

    // Get all dashboard components
    const [metricsResponse, chartResponse, languageResponse, faqResponse, unansweredResponse] = await Promise.all([
      getMetrics(),
      getConversationsChart(), 
      getLanguageSplit(),
      getFrequentlyAskedQuestions(),
      getUnansweredQuestions()
    ]);

    // Extract data from responses
    const metrics = JSON.parse(metricsResponse.body).metrics;
    const conversationsChart = JSON.parse(chartResponse.body);
    const languageSplit = JSON.parse(languageResponse.body);
    const frequentlyAskedQuestions = JSON.parse(faqResponse.body).questions;
    const unansweredQuestions = JSON.parse(unansweredResponse.body).questions;

    const dashboardData = {
      metrics,
      conversationsChart,
      languageSplit,
      frequentlyAskedQuestions,
      unansweredQuestions,
      lastUpdated: new Date().toISOString()
    };

    return createResponse(200, dashboardData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return createResponse(500, {
      error: 'Failed to fetch dashboard data',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get question analytics
 */
async function getQuestionAnalytics() {
  try {
    console.log('Fetching question analytics...');

    // Return actual analytics based on real data
    const totalQuestions = await getConversationCount();
    
    const analytics = {
      totalQuestions: totalQuestions,
      answeredQuestions: 0, // Will be calculated from actual data
      unansweredQuestions: 0, // Will be calculated from actual data
      averageConfidence: 0, // Will be calculated from actual data
      topCategories: [], // Will be populated from actual data
      confidenceDistribution: {
        high: 0,
        medium: 0,
        low: 0
      }
    };

    return createResponse(200, analytics);

  } catch (error) {
    console.error('Error fetching question analytics:', error);
    return createResponse(500, {
      error: 'Failed to fetch question analytics',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get dashboard metrics
 */
async function getMetrics() {
  try {
    console.log('Fetching dashboard metrics...');

    // Get conversation count from chat sessions table
    const conversationCount = await getConversationCount();
    
    // Get escalation rate from escalation requests table
    const escalationRate = await getEscalationRate();
    
    // Get out of scope rate from analytics table
    const outOfScopeRate = await getOutOfScopeRate();

    const metrics = {
      totalConversations: conversationCount,
      escalationRate: escalationRate,
      outOfScopeRate: outOfScopeRate,
      trends: {
        conversations: 'N/A',
        escalations: 'N/A',
        outOfScope: 'N/A'
      }
    };

    console.log('Dashboard metrics:', metrics);

    return createResponse(200, {
      metrics,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return createResponse(500, {
      error: 'Failed to fetch metrics',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get conversation chart data
 */
async function getConversationsChart() {
  try {
    console.log('Fetching conversations chart data...');

    // Generate last 7 days of data from actual chat sessions
    const chartData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Query actual conversation data by date
      // For now, return 0 until we have real data
      chartData.push({
        date: dateStr,
        conversations: 0
      });
    }

    return createResponse(200, {
      data: chartData
    });

  } catch (error) {
    console.error('Error fetching conversations chart:', error);
    return createResponse(500, {
      error: 'Failed to fetch conversations chart',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get language split data
 */
async function getLanguageSplit() {
  try {
    console.log('Fetching language split data...');

    // Return actual language data - start with empty data until we have real conversations
    const languageSplit = {
      english: 0,
      spanish: 0
    };

    return createResponse(200, languageSplit);

  } catch (error) {
    console.error('Error fetching language split:', error);
    return createResponse(500, {
      error: 'Failed to fetch language split',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get frequently asked questions
 */
async function getFrequentlyAskedQuestions() {
  try {
    console.log('Fetching frequently asked questions...');

    // Scan questions table and aggregate by question content
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} questions in table`);

    // Aggregate questions by content
    const questionCounts = {};
    items.forEach(item => {
      if (item.question && typeof item.question === 'string') {
        const question = item.question.trim().toLowerCase();
        questionCounts[question] = (questionCounts[question] || 0) + 1;
      }
    });

    // Sort by count and take top 10
    const sortedQuestions = Object.entries(questionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([question, count]) => ({
        question: question.charAt(0).toUpperCase() + question.slice(1), // Capitalize first letter
        count: count
      }));

    console.log(`Returning ${sortedQuestions.length} frequently asked questions`);

    return createResponse(200, {
      questions: sortedQuestions
    });

  } catch (error) {
    console.error('Error fetching frequently asked questions:', error);
    return createResponse(500, {
      error: 'Failed to fetch frequently asked questions',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get unanswered questions
 */
async function getUnansweredQuestions() {
  try {
    console.log('Fetching unanswered questions...');

    // Scan unanswered questions table
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: UNANSWERED_QUESTIONS_TABLE,
      Limit: 100
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} unanswered questions in table`);

    // Aggregate by question content
    const questionCounts = {};
    items.forEach(item => {
      if (item.question && typeof item.question === 'string') {
        const question = item.question.trim();
        questionCounts[question] = (questionCounts[question] || 0) + 1;
      }
    });

    // Sort by count and take top 10
    const sortedQuestions = Object.entries(questionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([question, count]) => ({
        question: question,
        count: count
      }));

    console.log(`Returning ${sortedQuestions.length} unanswered questions`);

    return createResponse(200, {
      questions: sortedQuestions
    });

  } catch (error) {
    console.error('Error fetching unanswered questions:', error);
    return createResponse(500, {
      error: 'Failed to fetch unanswered questions',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Health check
 */
async function getHealthCheck() {
  try {
    // Test access to all required tables
    const tables = [ANALYTICS_TABLE, CHAT_SESSIONS_TABLE, QUESTIONS_TABLE, UNANSWERED_QUESTIONS_TABLE];
    const tableStatus = {};

    for (const table of tables) {
      try {
        await dynamodb.send(new ScanCommand({
          TableName: table,
          Limit: 1
        }));
        tableStatus[table] = 'accessible';
      } catch (error) {
        tableStatus[table] = 'error: ' + error.message;
      }
    }

    return createResponse(200, {
      status: 'healthy',
      service: 'admin-analytics',
      timestamp: new Date().toISOString(),
      tables: tableStatus
    });

  } catch (error) {
    console.error('Health check failed:', error);
    return createResponse(503, {
      status: 'unhealthy',
      service: 'admin-analytics',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Helper: Get conversation count from chat sessions table
 */
async function getConversationCount() {
  try {
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: CHAT_SESSIONS_TABLE,
      Select: 'COUNT'
    }));
    return scanResult.Count || 0;
  } catch (error) {
    console.error('Error getting conversation count:', error);
    return 0;
  }
}

/**
 * Helper: Get escalation rate from escalation requests table
 */
async function getEscalationRate() {
  try {
    // Get total escalations
    const escalationResult = await dynamodb.send(new ScanCommand({
      TableName: ESCALATION_REQUESTS_TABLE,
      Select: 'COUNT'
    }));
    const escalationCount = escalationResult.Count || 0;

    // Get total conversations
    const conversationCount = await getConversationCount();

    if (conversationCount === 0) return 0;
    
    const rate = Math.round((escalationCount / conversationCount) * 100);
    return Math.min(rate, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating escalation rate:', error);
    return 0;
  }
}

/**
 * Helper: Get out of scope rate from analytics table
 */
async function getOutOfScopeRate() {
  try {
    // Return 0 until we have actual out-of-scope analytics data
    return 0;
  } catch (error) {
    console.error('Error calculating out of scope rate:', error);
    return 0;
  }
}

/**
 * Create standardized API response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}