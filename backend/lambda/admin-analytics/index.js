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
const ESCALATION_REQUESTS_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
// Note: CONVERSATIONS_TABLE removed - analytics now uses CHAT_SESSIONS_TABLE instead

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
    
    case '/admin/category-insights':
      return await getCategoryInsights();
    
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
          'GET /admin/category-insights',
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
    const metrics = JSON.parse(metricsResponse.body); // Metrics are now returned directly
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

    // Calculate confidence distribution (aligned with chat processor 0.75 escalation threshold)
    // Confidence scores are Bedrock KB relevance scores (cosine similarity)
    const confidenceDistribution = {
      high: items.filter(item => typeof item.confidence === 'number' && item.confidence >= 0.80).length,    // High: 80%+ (excellent match)
      medium: items.filter(item => typeof item.confidence === 'number' && item.confidence >= 0.75 && item.confidence < 0.80).length, // Medium: 75-79% (good match)
      low: items.filter(item => typeof item.confidence === 'number' && item.confidence < 0.75).length        // Low: <75% (escalated)
    };

    // Get top categories with better display names
    const categoryCounts = {};
    const categoryDisplayNames = {
      'type-1-diabetes': 'Type 1 Diabetes',
      'type-2-diabetes': 'Type 2 Diabetes',
      'gestational-diabetes': 'Gestational Diabetes',
      'prediabetes': 'Prediabetes',
      'symptoms-diagnosis': 'Symptoms & Diagnosis',
      'blood-sugar-management': 'Blood Sugar Management',
      'insulin-medication': 'Insulin & Medication',
      'diet-nutrition': 'Diet & Nutrition',
      'exercise-lifestyle': 'Exercise & Lifestyle',
      'complications': 'Complications',
      'emergency-care': 'Emergency Care',
      'insurance-coverage': 'Insurance & Coverage',
      'general-information': 'General Information',
      'non-diabetes-related': 'Non-Diabetes Related',
      'general': 'Uncategorized' // Legacy fallback
    };

    items.forEach(item => {
      const category = (item.category && typeof item.category === 'string') ? item.category : 'general';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10) // Show top 10 categories instead of 5
      .map(([category, count]) => ({ 
        category: categoryDisplayNames[category] || category, 
        categoryKey: category,
        count 
      }));

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
      totalConversations: metrics.totalConversations,
      escalationRate: metrics.escalationRate,
      outOfScopeRate: metrics.outOfScopeRate,
      trends: metrics.trends
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

    // Calculate percentages
    const total = items.length;
    const englishPercent = total > 0 ? Math.round((languageCounts.english / total) * 100) : 0;
    const spanishPercent = total > 0 ? Math.round((languageCounts.spanish / total) * 100) : 0;

    console.log(`Language percentages: English ${englishPercent}%, Spanish ${spanishPercent}%`);

    return createResponse(200, {
      english: englishPercent,
      spanish: spanishPercent
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
    // Test access to all required tables (excluding CONVERSATIONS_TABLE - not used, analytics uses CHAT_SESSIONS_TABLE)
    const tables = [ANALYTICS_TABLE, CHAT_SESSIONS_TABLE, QUESTIONS_TABLE, ESCALATION_REQUESTS_TABLE];
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
 * Helper: Get out of scope rate from questions table
 * Calculates percentage of questions that couldn't be adequately answered by the chatbot
 * This includes both escalated questions (low confidence) and off-topic questions
 */
async function getOutOfScopeRate() {
  try {
    // Get all questions to calculate out-of-scope rate
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      ProjectionExpression: 'escalated',
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    const totalQuestions = items.length;

    if (totalQuestions === 0) return 0;

    // Count questions that were escalated (couldn't be adequately answered)
    // This includes both low-confidence questions and off-topic questions
    const outOfScopeQuestions = items.filter(item =>
      item.escalated === true
    ).length;

    const rate = Math.round((outOfScopeQuestions / totalQuestions) * 100);

    console.log(`Out of scope rate (unanswered by chatbot): ${outOfScopeQuestions}/${totalQuestions} = ${rate}%`);
    return Math.min(rate, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating out of scope rate:', error);
    return 0;
  }
}

/**
 * Get detailed category insights
 */
async function getCategoryInsights() {
  try {
    console.log('Fetching category insights...');

    // Get all questions from questions table
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      Limit: 1000
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    console.log(`Found ${items.length} questions for category analysis`);

    const categoryDisplayNames = {
      'type-1-diabetes': 'Type 1 Diabetes',
      'type-2-diabetes': 'Type 2 Diabetes',
      'gestational-diabetes': 'Gestational Diabetes',
      'prediabetes': 'Prediabetes',
      'symptoms-diagnosis': 'Symptoms & Diagnosis',
      'blood-sugar-management': 'Blood Sugar Management',
      'insulin-medication': 'Insulin & Medication',
      'diet-nutrition': 'Diet & Nutrition',
      'exercise-lifestyle': 'Exercise & Lifestyle',
      'complications': 'Complications',
      'emergency-care': 'Emergency Care',
      'insurance-coverage': 'Insurance & Coverage',
      'general-information': 'General Information',
      'non-diabetes-related': 'Non-Diabetes Related',
      'general': 'Uncategorized'
    };

    // Analyze each category
    const categoryInsights = {};
    
    items.forEach(item => {
      const category = item.category || 'general';
      
      if (!categoryInsights[category]) {
        categoryInsights[category] = {
          displayName: categoryDisplayNames[category] || category,
          totalQuestions: 0,
          escalatedQuestions: 0,
          averageConfidence: 0,
          confidenceScores: [],
          languages: { en: 0, es: 0, other: 0 },
          sampleQuestions: []
        };
      }
      
      const insight = categoryInsights[category];
      insight.totalQuestions++;
      
      if (item.escalated === true) {
        insight.escalatedQuestions++;
      }
      
      if (typeof item.confidence === 'number') {
        insight.confidenceScores.push(item.confidence);
      }
      
      // Track languages
      const lang = item.language || 'en';
      if (lang === 'en') insight.languages.en++;
      else if (lang === 'es') insight.languages.es++;
      else insight.languages.other++;
      
      // Collect sample questions (up to 3 per category)
      if (insight.sampleQuestions.length < 3 && item.question) {
        insight.sampleQuestions.push({
          question: item.question,
          confidence: item.confidence,
          escalated: item.escalated
        });
      }
    });

    // Calculate final metrics for each category
    const processedInsights = Object.entries(categoryInsights)
      .map(([categoryKey, insight]) => {
        const avgConfidence = insight.confidenceScores.length > 0
          ? insight.confidenceScores.reduce((sum, score) => sum + score, 0) / insight.confidenceScores.length
          : 0;
        
        const escalationRate = insight.totalQuestions > 0
          ? Math.round((insight.escalatedQuestions / insight.totalQuestions) * 100)
          : 0;

        return {
          categoryKey,
          displayName: insight.displayName,
          totalQuestions: insight.totalQuestions,
          escalatedQuestions: insight.escalatedQuestions,
          escalationRate,
          averageConfidence: Math.round(avgConfidence * 100) / 100,
          languages: insight.languages,
          sampleQuestions: insight.sampleQuestions
        };
      })
      .sort((a, b) => b.totalQuestions - a.totalQuestions); // Sort by question count

    console.log(`Returning insights for ${processedInsights.length} categories`);

    return createResponse(200, {
      categoryInsights: processedInsights,
      totalCategories: processedInsights.length,
      totalQuestions: items.length
    });

  } catch (error) {
    console.error('Error fetching category insights:', error);
    return createResponse(500, {
      error: 'Failed to fetch category insights',
      message: error.message || 'Unknown error'
    });
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