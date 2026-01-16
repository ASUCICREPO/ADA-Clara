/**
 * Admin Analytics Lambda
 * Consolidated single-file implementation
 *
 * Handles:
 * - GET /admin/metrics - Dashboard metrics
 * - GET /admin/conversations/chart - Conversation chart data
 * - GET /admin/language-split - Language distribution
 * - GET /admin/health - Health check
 */

const { DynamoDBClient, ScanCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables - No fallbacks for table names (must be set by CDK)
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const CHAT_SESSIONS_TABLE = process.env.CHAT_SESSIONS_TABLE;
const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE;
const ESCALATION_REQUESTS_TABLE = process.env.ESCALATION_REQUESTS_TABLE;

// Lambda-level caching configuration
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Cache storage (persists across invocations in same Lambda container)
const cache = {
  metrics: { data: null, timestamp: null },
  conversationsChart: { data: null, timestamp: null },
  languageSplit: { data: null, timestamp: null }
};

/**
 * Check if cached data is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry.data || !cacheEntry.timestamp) {
    return false;
  }
  const age = Date.now() - cacheEntry.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Update cache entry
 */
function updateCache(cacheKey, data) {
  cache[cacheKey] = {
    data: data,
    timestamp: Date.now()
  };
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Admin analytics handler invoked:', JSON.stringify(event, null, 2));

  try {
    // Support both HTTP API (v2) and REST API (v1) formats
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

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
    const [metricsResponse, chartResponse, languageResponse] = await Promise.all([
      getMetrics(),
      getConversationsChart(),
      getLanguageSplit()
    ]);

    // Extract data from responses
    const metrics = JSON.parse(metricsResponse.body);
    const conversationsChart = JSON.parse(chartResponse.body);
    const languageSplit = JSON.parse(languageResponse.body);

    const dashboardData = {
      metrics,
      conversationsChart,
      languageSplit,
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
 * Get dashboard metrics
 */
async function getMetrics() {
  try {
    // Check cache first
    if (isCacheValid(cache.metrics)) {
      console.log('Returning cached metrics (age: ' + Math.round((Date.now() - cache.metrics.timestamp) / 1000) + 's)');
      return createResponse(200, cache.metrics.data);
    }

    console.log('Cache miss - fetching fresh metrics...');

    // Get total questions (more accurate than sessions for conversation activity)
    const totalQuestions = await getTotalQuestions();

    // Get escalation rate from questions table (now consistent)
    const escalationRate = await getEscalationRate();

    // Get out of scope rate from analytics table
    const outOfScopeRate = await getOutOfScopeRate();

    // Calculate week-over-week trends
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    // Define time periods
    const currentWeekStart = now - oneWeekMs;
    const currentWeekEnd = now;
    const previousWeekStart = now - twoWeeksMs;
    const previousWeekEnd = now - oneWeekMs;

    console.log('Calculating trends for periods:');
    console.log(`  Current week: ${new Date(currentWeekStart).toISOString()} to ${new Date(currentWeekEnd).toISOString()}`);
    console.log(`  Previous week: ${new Date(previousWeekStart).toISOString()} to ${new Date(previousWeekEnd).toISOString()}`);

    // Calculate trends in parallel for performance
    const [
      currentConversations,
      previousConversations,
      currentEscalationRate,
      previousEscalationRate,
      currentOutOfScopeRate,
      previousOutOfScopeRate
    ] = await Promise.all([
      getConversationCountForPeriod(currentWeekStart, currentWeekEnd),
      getConversationCountForPeriod(previousWeekStart, previousWeekEnd),
      getEscalationRateForPeriod(currentWeekStart, currentWeekEnd),
      getEscalationRateForPeriod(previousWeekStart, previousWeekEnd),
      getOutOfScopeRateForPeriod(currentWeekStart, currentWeekEnd),
      getOutOfScopeRateForPeriod(previousWeekStart, previousWeekEnd)
    ]);

    console.log('Trend calculation values:');
    console.log(`  Conversations: ${previousConversations} → ${currentConversations}`);
    console.log(`  Escalation rate: ${previousEscalationRate}% → ${currentEscalationRate}%`);
    console.log(`  Out-of-scope rate: ${previousOutOfScopeRate}% → ${currentOutOfScopeRate}%`);

    const trends = {
      // Conversations: Higher is good (+ = green)
      conversations: calculateWeekOverWeekTrend(currentConversations, previousConversations, false),
      // Escalation rate: Higher is bad (invert sign so + = green when rate decreases)
      escalations: calculateWeekOverWeekTrend(currentEscalationRate, previousEscalationRate, true),
      // Out-of-scope rate: Higher is bad (invert sign so + = green when rate decreases)
      outOfScope: calculateWeekOverWeekTrend(currentOutOfScopeRate, previousOutOfScopeRate, true)
    };

    console.log('Calculated trends:', trends);

    const metrics = {
      totalConversations: await getConversationCount(), // Keep session count for actual conversations
      totalQuestions: totalQuestions, // Add total questions metric
      escalationRate: escalationRate,
      outOfScopeRate: outOfScopeRate,
      trends: trends
    };

    console.log('Dashboard metrics:', metrics);

    const responseData = {
      totalConversations: metrics.totalConversations,
      escalationRate: metrics.escalationRate,
      outOfScopeRate: metrics.outOfScopeRate,
      trends: metrics.trends
    };

    // Update cache
    updateCache('metrics', responseData);

    return createResponse(200, responseData);

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
    // Check cache first
    if (isCacheValid(cache.conversationsChart)) {
      console.log('Returning cached conversations chart (age: ' + Math.round((Date.now() - cache.conversationsChart.timestamp) / 1000) + 's)');
      return createResponse(200, cache.conversationsChart.data);
    }

    console.log('Cache miss - fetching fresh conversations chart data...');

    // Get all sessions with pagination to avoid missing data
    let allSessions = [];
    let lastEvaluatedKey = null;

    do {
      const scanResult = await dynamodb.send(new ScanCommand({
        TableName: CHAT_SESSIONS_TABLE,
        ProjectionExpression: 'startTime',
        Limit: 1000,
        ExclusiveStartKey: lastEvaluatedKey
      }));

      allSessions = allSessions.concat(scanResult.Items?.map(item => unmarshall(item)) || []);
      lastEvaluatedKey = scanResult.LastEvaluatedKey;

      // Safety limit to prevent excessive scanning
      if (allSessions.length >= 5000) break;
    } while (lastEvaluatedKey);

    console.log(`Found ${allSessions.length} total sessions for chart analysis`);

    // Generate last 7 days of data
    const chartData = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Count sessions that started on this date
      const conversationsOnDate = allSessions.filter(session => {
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

    const responseData = { data: chartData };

    // Update cache
    updateCache('conversationsChart', responseData);

    return createResponse(200, responseData);

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
    // Check cache first
    if (isCacheValid(cache.languageSplit)) {
      console.log('Returning cached language split (age: ' + Math.round((Date.now() - cache.languageSplit.timestamp) / 1000) + 's)');
      return createResponse(200, cache.languageSplit.data);
    }

    console.log('Cache miss - fetching fresh language split data...');

    // Scan chat sessions table with pagination to get language distribution
    let allItems = [];
    let lastEvaluatedKey = null;

    do {
      const scanResult = await dynamodb.send(new ScanCommand({
        TableName: CHAT_SESSIONS_TABLE,
        ProjectionExpression: '#lang',
        ExpressionAttributeNames: {
          '#lang': 'language'
        },
        Limit: 1000,
        ExclusiveStartKey: lastEvaluatedKey
      }));

      allItems = allItems.concat(scanResult.Items?.map(item => unmarshall(item)) || []);
      lastEvaluatedKey = scanResult.LastEvaluatedKey;

      // Safety limit to prevent excessive scanning
      if (allItems.length >= 5000) break;
    } while (lastEvaluatedKey);

    console.log(`Found ${allItems.length} chat sessions for language analysis`);

    // Count languages with better handling of missing/invalid values
    const languageCounts = {
      english: 0,
      spanish: 0,
      other: 0
    };

    allItems.forEach(item => {
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
    const total = allItems.length;
    const englishPercent = total > 0 ? Math.round((languageCounts.english / total) * 100) : 0;
    const spanishPercent = total > 0 ? Math.round((languageCounts.spanish / total) * 100) : 0;

    console.log(`Language percentages: English ${englishPercent}%, Spanish ${spanishPercent}%`);

    const responseData = {
      english: englishPercent,
      spanish: spanishPercent
    };

    // Update cache
    updateCache('languageSplit', responseData);

    return createResponse(200, responseData);

  } catch (error) {
    console.error('Error fetching language split:', error);
    return createResponse(500, {
      error: 'Failed to fetch language split',
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
 * Helper: Get escalation rate from actual form submissions
 * Calculates percentage of questions that resulted in users submitting the escalation form
 * This is different from out-of-scope rate (which uses auto-escalations)
 */
async function getEscalationRate() {
  try {
    // Get total questions count
    const totalQuestions = await getTotalQuestions();

    if (totalQuestions === 0) return 0;

    // Get count of actual form submissions using GSI (much more efficient)
    const queryResult = await dynamodb.send(new QueryCommand({
      TableName: ESCALATION_REQUESTS_TABLE,
      IndexName: 'SourceIndex',
      KeyConditionExpression: '#source = :formSubmit',
      ExpressionAttributeNames: {
        '#source': 'source'
      },
      ExpressionAttributeValues: marshall({
        ':formSubmit': 'form_submit'
      }),
      Select: 'COUNT'
    }));

    const formSubmissions = queryResult.Count || 0;
    const rate = Math.round((formSubmissions / totalQuestions) * 100);

    console.log(`Escalation rate (actual form submissions): ${formSubmissions}/${totalQuestions} = ${rate}%`);
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
    // Get all questions to calculate out-of-scope rate (with pagination)
    let allItems = [];
    let lastEvaluatedKey = null;

    do {
      const scanResult = await dynamodb.send(new ScanCommand({
        TableName: QUESTIONS_TABLE,
        ProjectionExpression: 'escalated',
        Limit: 1000,
        ExclusiveStartKey: lastEvaluatedKey
      }));

      allItems = allItems.concat(scanResult.Items?.map(item => unmarshall(item)) || []);
      lastEvaluatedKey = scanResult.LastEvaluatedKey;

      // Safety limit to prevent excessive scanning
      if (allItems.length >= 5000) break;
    } while (lastEvaluatedKey);

    const totalQuestions = allItems.length;

    if (totalQuestions === 0) return 0;

    // Count questions that were escalated (couldn't be adequately answered)
    // This includes both low-confidence questions and off-topic questions
    const outOfScopeQuestions = allItems.filter(item =>
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
 * Helper: Calculate week-over-week trend
 *
 * @param {number} currentValue - Current period value
 * @param {number} previousValue - Previous period value
 * @param {boolean} invertSign - If true, invert the sign for rate metrics (higher = bad)
 * @returns {string} Formatted trend string (e.g., "+12%", "-5%", "N/A")
 */
function calculateWeekOverWeekTrend(currentValue, previousValue, invertSign = false) {
  // Handle edge cases
  if (typeof currentValue !== 'number' || typeof previousValue !== 'number') {
    return 'N/A';
  }

  // If previous value is 0, can't calculate percentage change
  if (previousValue === 0) {
    if (currentValue === 0) {
      return '0%';
    }
    // New activity appeared
    return invertSign ? '-100%' : '+100%';
  }

  // Calculate percentage change
  const change = ((currentValue - previousValue) / previousValue) * 100;
  const absChange = Math.abs(change);
  const roundedChange = Math.round(absChange);

  // Handle no change
  if (roundedChange === 0) {
    return '0%';
  }

  // Determine sign
  let sign;
  if (change > 0) {
    sign = invertSign ? '-' : '+';
  } else {
    sign = invertSign ? '+' : '-';
  }

  return `${sign}${roundedChange}%`;
}

/**
 * Helper: Get conversation count for a time period
 *
 * @param {number} startTime - Start timestamp (milliseconds)
 * @param {number} endTime - End timestamp (milliseconds)
 * @returns {Promise<number>} Count of conversations in period
 */
async function getConversationCountForPeriod(startTime, endTime) {
  try {
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: CHAT_SESSIONS_TABLE,
      FilterExpression: 'startTime BETWEEN :start AND :end',
      ExpressionAttributeValues: marshall({
        ':start': new Date(startTime).toISOString(),
        ':end': new Date(endTime).toISOString()
      }),
      Select: 'COUNT'
    }));
    return scanResult.Count || 0;
  } catch (error) {
    console.error('Error getting conversation count for period:', error);
    return 0;
  }
}

/**
 * Helper: Get escalation rate for a time period
 *
 * @param {number} startTime - Start timestamp (milliseconds)
 * @param {number} endTime - End timestamp (milliseconds)
 * @returns {Promise<number>} Escalation rate percentage (0-100)
 */
async function getEscalationRateForPeriod(startTime, endTime) {
  try {
    // Get total questions in period
    const questionsScan = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      FilterExpression: '#ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: marshall({
        ':start': new Date(startTime).toISOString(),
        ':end': new Date(endTime).toISOString()
      }),
      Select: 'COUNT'
    }));

    const totalQuestions = questionsScan.Count || 0;
    if (totalQuestions === 0) return 0;

    // Get form submissions in period
    const escalationsScan = await dynamodb.send(new ScanCommand({
      TableName: ESCALATION_REQUESTS_TABLE,
      FilterExpression: '#src = :formSubmit AND #ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#src': 'source',
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: marshall({
        ':formSubmit': 'form_submit',
        ':start': new Date(startTime).toISOString(),
        ':end': new Date(endTime).toISOString()
      }),
      Select: 'COUNT'
    }));

    const formSubmissions = escalationsScan.Count || 0;
    const rate = Math.round((formSubmissions / totalQuestions) * 100);

    return Math.min(rate, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating escalation rate for period:', error);
    return 0;
  }
}

/**
 * Helper: Get out-of-scope rate for a time period
 *
 * @param {number} startTime - Start timestamp (milliseconds)
 * @param {number} endTime - End timestamp (milliseconds)
 * @returns {Promise<number>} Out-of-scope rate percentage (0-100)
 */
async function getOutOfScopeRateForPeriod(startTime, endTime) {
  try {
    // Get all questions in period
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: QUESTIONS_TABLE,
      FilterExpression: '#ts BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      },
      ExpressionAttributeValues: marshall({
        ':start': new Date(startTime).toISOString(),
        ':end': new Date(endTime).toISOString()
      }),
      ProjectionExpression: 'escalated'
    }));

    const items = scanResult.Items?.map(item => unmarshall(item)) || [];
    const totalQuestions = items.length;

    if (totalQuestions === 0) return 0;

    // Count escalated questions
    const outOfScopeQuestions = items.filter(item => item.escalated === true).length;
    const rate = Math.round((outOfScopeQuestions / totalQuestions) * 100);

    return Math.min(rate, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating out of scope rate for period:', error);
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