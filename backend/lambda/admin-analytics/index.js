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
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || 'ada-clara-analytics';
const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE || 'ada-clara-chat-sessions';
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'ada-clara-questions';
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'ada-clara-conversations';
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

    // Get all questions from questions table
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} questions for analytics`);

    // Calculate analytics with proper null handling
    const totalQuestions = items.length;
    const answeredQuestions = items.filter(item => item.escalated !== true).length;
    const unansweredQuestions = items.filter(item => item.escalated === true).length;
    
    // Calculate average confidence with null checks
    const confidenceScores = items
      .filter(item => typeof item.confidence === 'number' && !isNaN(item.confidence))
      .map(item => item.confidence);
    const averageConfidence = confidenceScores.length > 0 
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length 
      : 0;

    // Calculate confidence distribution (aligned with chat processor 95% escalation threshold)
    const confidenceDistribution = {
      high: items.filter(item => typeof item.confidence === 'number' && item.confidence >= 0.95).length,    // High: 95%+ (not escalated)
      medium: items.filter(item => typeof item.confidence === 'number' && item.confidence >= 0.8 && item.confidence < 0.95).length, // Medium: 80-94%
      low: items.filter(item => typeof item.confidence === 'number' && item.confidence < 0.8).length        // Low: <80%
    };

    // Get top categories with null handling
    const categoryCounts = {};
    items.forEach(item => {
      const category = (item.category && typeof item.category === 'string') ? item.category : 'general';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Language breakdown
    const languageBreakdown = {};
    items.forEach(item => {
      const language = (item.language && typeof item.language === 'string') ? item.language : 'en';
      languageBreakdown[language] = (languageBreakdown[language] || 0) + 1;
    });

    const analytics = {
      totalQuestions,
      answeredQuestions,
      unansweredQuestions,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      topCategories,
      confidenceDistribution,
      languageBreakdown,
      dataQuality: {
        questionsWithConfidence: confidenceScores.length,
        questionsWithCategory: items.filter(item => item.category && item.category !== 'general').length,
        questionsWithLanguage: items.filter(item => item.language).length
      }
    };

    console.log('Question analytics:', analytics);

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

    // Get total questions (more accurate than sessions for conversation activity)
    const totalQuestions = await getTotalQuestions();
    
    // Get escalation rate from questions table (now consistent)
    const escalationRate = await getEscalationRate();
    
    // Get out of scope rate from analytics table
    const outOfScopeRate = await getOutOfScopeRate();

    const metrics = {
      totalConversations: await getConversationCount(), // Keep session count for actual conversations
      totalQuestions: totalQuestions, // Add total questions metric
      escalationRate: escalationRate,
      outOfScopeRate: outOfScopeRate,
      trends: {
        conversations: 'N/A', // TODO: Implement trending calculations
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

    // Get all sessions first, then filter by date in memory for better performance
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: CHAT_SESSIONS_TABLE,
      ProjectionExpression: 'startTime',
      Limit: 1000
    }));

    const sessions = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${sessions.length} total sessions for chart analysis`);

    // Generate last 7 days of data
    const chartData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Count sessions that started on this date
      const conversationsOnDate = sessions.filter(session => {
        if (!session.startTime) return false;
        
        // Extract date from startTime (handles both ISO strings and date strings)
        const sessionDate = new Date(session.startTime).toISOString().split('T')[0];
        return sessionDate === dateStr;
      }).length;
      
      chartData.push({
        date: dateStr,
        conversations: conversationsOnDate
      });
    }

    console.log('Chart data:', chartData);

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

    // Scan chat sessions table to get language distribution
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: CHAT_SESSIONS_TABLE,
      ProjectionExpression: '#lang',
      ExpressionAttributeNames: {
        '#lang': 'language'
      },
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} chat sessions for language analysis`);

    // Count languages with better handling of missing/invalid values
    const languageCounts = {
      english: 0,
      spanish: 0,
      other: 0
    };

    items.forEach(item => {
      const language = item.language;
      
      // Handle missing or invalid language values
      if (!language || typeof language !== 'string') {
        languageCounts.english++; // Default to English for missing values
      } else if (language.toLowerCase() === 'en' || language.toLowerCase() === 'english') {
        languageCounts.english++;
      } else if (language.toLowerCase() === 'es' || language.toLowerCase() === 'spanish') {
        languageCounts.spanish++;
      } else {
        languageCounts.other++;
      }
    });

    console.log('Language distribution:', languageCounts);

    return createResponse(200, {
      english: languageCounts.english,
      spanish: languageCounts.spanish,
      other: languageCounts.other,
      total: languageCounts.english + languageCounts.spanish + languageCounts.other
    });

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

    // Aggregate questions by content while preserving original capitalization
    const questionCounts = new Map();
    items.forEach(item => {
      if (item.question && typeof item.question === 'string') {
        const normalizedQuestion = item.question.trim().toLowerCase();
        const originalQuestion = item.question.trim();
        
        if (questionCounts.has(normalizedQuestion)) {
          questionCounts.get(normalizedQuestion).count++;
        } else {
          questionCounts.set(normalizedQuestion, {
            original: originalQuestion,
            count: 1
          });
        }
      }
    });

    // Sort by count and take top 10
    const sortedQuestions = Array.from(questionCounts.entries())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([normalizedQuestion, data]) => ({
        question: data.original, // Use original capitalization
        count: data.count
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

    // Scan questions table for escalated questions (unanswered)
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      FilterExpression: 'escalated = :escalated',
      ExpressionAttributeValues: marshall({
        ':escalated': true
      }),
      Limit: 100
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} unanswered questions in questions table`);

    // Aggregate by question content while preserving original capitalization
    const questionCounts = new Map();
    items.forEach(item => {
      if (item.question && typeof item.question === 'string') {
        const normalizedQuestion = item.question.trim().toLowerCase();
        const originalQuestion = item.question.trim();
        
        if (questionCounts.has(normalizedQuestion)) {
          questionCounts.get(normalizedQuestion).count++;
        } else {
          questionCounts.set(normalizedQuestion, {
            original: originalQuestion,
            count: 1,
            confidence: item.confidence || 0,
            language: item.language || 'en'
          });
        }
      }
    });

    // Sort by count and take top 10
    const sortedQuestions = Array.from(questionCounts.entries())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([normalizedQuestion, data]) => ({
        question: data.original, // Use original capitalization
        count: data.count,
        averageConfidence: data.confidence,
        language: data.language
      }));

    console.log(`Returning ${sortedQuestions.length} unanswered questions`);

    return createResponse(200, {
      questions: sortedQuestions,
      totalUnanswered: items.length
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
    const tables = [ANALYTICS_TABLE, CHAT_SESSIONS_TABLE, QUESTIONS_TABLE, CONVERSATIONS_TABLE, ESCALATION_REQUESTS_TABLE];
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
 * Helper: Get total questions count from questions table
 */
async function getTotalQuestions() {
  try {
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      Select: 'COUNT'
    }));
    return scanResult.Count || 0;
  } catch (error) {
    console.error('Error getting total questions count:', error);
    return 0;
  }
}

/**
 * Helper: Get escalation rate from questions table
 */
async function getEscalationRate() {
  try {
    // Get all questions to calculate escalation rate properly
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      ProjectionExpression: 'escalated',
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    const totalQuestions = items.length;
    
    if (totalQuestions === 0) return 0;
    
    const escalatedQuestions = items.filter(item => item.escalated === true).length;
    const rate = Math.round((escalatedQuestions / totalQuestions) * 100);
    
    console.log(`Escalation rate: ${escalatedQuestions}/${totalQuestions} = ${rate}%`);
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