/**
 * Escalation Handler Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /escalation/request - Submit escalation request
 * - GET /admin/escalation-requests - Get escalation requests for admin
 * - GET /escalation/health - Health check
 */

const { DynamoDBClient, PutItemCommand, ScanCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables - No fallbacks for table names (must be set by CDK)
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE;
const FRONTEND_URL = process.env.FRONTEND_URL || '*'; // Frontend URL for CORS (defaults to wildcard in dev)

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MINUTES = 60; // Time window for rate limiting
const MAX_SUBMISSIONS_PER_EMAIL = 3; // Max submissions per email within window

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Escalation handler invoked:', JSON.stringify(redactPII(event), null, 2));

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Route requests
    if (method === 'POST' && (path === '/escalation/request' || path === '/escalation')) {
      return await handleEscalationRequest(event);
    } else if (method === 'GET' && (path === '/escalation/requests' || path === '/admin/escalation-requests')) {
      return await getEscalationRequests(event);
    } else if (method === 'GET' && (path === '/escalation/health' || path === '/escalation')) {
      return await getHealthCheck();
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /escalation/request',
          'GET /admin/escalation-requests',
          'GET /escalation/health'
        ]
      });
    }

  } catch (error) {
    console.error('Escalation handler error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message || 'Unknown error occurred'
    });
  }
};

/**
 * Handle escalation request submission
 */
async function handleEscalationRequest(event) {
  try {
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
        message: 'Please provide escalation request data'
      });
    }

    let request;
    try {
      request = JSON.parse(event.body);
    } catch (parseError) {
      return createResponse(400, {
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      });
    }

    // Validate required fields
    const validation = validateEscalationRequest(request);
    if (!validation.valid) {
      return createResponse(400, {
        error: 'Validation error',
        message: validation.message
      });
    }

    // Check rate limiting
    const rateLimitCheck = await checkRateLimit(request.email);
    if (!rateLimitCheck.allowed) {
      return createResponse(429, {
        error: 'Rate limit exceeded',
        message: rateLimitCheck.message
      });
    }

    // Create escalation record
    const now = new Date();
    const escalationId = `esc-${crypto.randomUUID()}`;

    const escalationRecord = {
      escalationId,
      name: sanitizeInput(request.name),
      email: sanitizeInput(request.email).toLowerCase(),
      phoneNumber: request.phoneNumber ? sanitizeInput(request.phoneNumber) : undefined,
      zipCode: request.zipCode ? sanitizeInput(request.zipCode) : undefined,
      dateTime: now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }), // Match original formatting
      timestamp: now.toISOString(),
      status: 'pending',
      source: request.escalationType === 'submit' ? 'form_submit' : 'talk_to_person',
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    };

    // Store in DynamoDB
    await dynamodb.send(new PutItemCommand({
      TableName: ESCALATION_TABLE,
      Item: marshall(escalationRecord, { removeUndefinedValues: true })
    }));

    console.log(`Escalation request created: ${escalationId} for ${request.email ? request.email[0] + '***@' + request.email.split('@')[1] : '[no-email]'}`);

    return createResponse(200, {
      success: true,
      message: 'Thank you! Someone from the American Diabetes Association will reach out to you shortly.',
      escalationId: escalationRecord.escalationId,
      status: escalationRecord.status
    });

  } catch (error) {
    console.error('Error handling escalation request:', error);
    return createResponse(500, {
      error: 'Failed to process escalation request',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Get escalation requests for admin dashboard
 */
async function getEscalationRequests(event) {
  try {
    const limit = event.queryStringParameters?.limit ?
      parseInt(event.queryStringParameters.limit) : 10;
    const page = event.queryStringParameters?.page ?
      parseInt(event.queryStringParameters.page) : 1;
    const search = event.queryStringParameters?.search?.trim() || '';

    console.log(`Getting escalation requests: page=${page}, limit=${limit}, search="${search}"`);

    // Validate parameters
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return createResponse(400, {
        error: 'Invalid limit parameter',
        message: 'Limit must be a number between 1 and 100'
      });
    }

    if (isNaN(page) || page < 1) {
      return createResponse(400, {
        error: 'Invalid page parameter',
        message: 'Page must be a number greater than 0'
      });
    }

    // Use GSI to query only form_submit escalations, sorted by timestamp
    // This is much more efficient than scanning the entire table
    const queryResult = await dynamodb.send(new QueryCommand({
      TableName: ESCALATION_TABLE,
      IndexName: 'SourceIndex',
      KeyConditionExpression: '#source = :formSubmit',
      ExpressionAttributeNames: {
        '#source': 'source'
      },
      ExpressionAttributeValues: marshall({
        ':formSubmit': 'form_submit'
      }),
      ScanIndexForward: false, // Sort descending (newest first)
      Limit: 1000 // Reasonable limit for pagination
    }));

    let allItems = queryResult.Items?.map(item => unmarshall(item)) || [];

    console.log(`Found ${allItems.length} submitted escalation requests using GSI`);

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      allItems = allItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const email = (item.email || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower);
      });
      console.log(`After search filter: ${allItems.length} results matching "${search}"`);
    }

    // Paginate in-memory (could be improved with DynamoDB pagination tokens)
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = allItems.slice(startIndex, endIndex);

    // Format response
    const requests = paginatedItems.map(item => ({
      name: item.name || 'N/A',
      email: item.email || 'N/A',
      phone: item.phoneNumber || 'N/A',
      zipCode: item.zipCode || 'N/A',
      dateTime: item.dateTime || 'N/A'
    }));

    console.log(`Returning ${requests.length} requests for page ${page}, total: ${allItems.length}`);

    return createResponse(200, {
      requests,
      total: allItems.length
    });

  } catch (error) {
    console.error('Error fetching escalation requests:', error);
    return createResponse(500, {
      error: 'Failed to fetch escalation requests',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * Health check
 */
async function getHealthCheck() {
  try {
    // Simple health check - verify DynamoDB table access
    await dynamodb.send(new ScanCommand({
      TableName: ESCALATION_TABLE,
      Limit: 1
    }));

    return createResponse(200, {
      status: 'healthy',
      service: 'escalation-handler',
      timestamp: new Date().toISOString(),
      table: ESCALATION_TABLE
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return createResponse(503, {
      status: 'unhealthy',
      service: 'escalation-handler',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Validate escalation request
 */
function validateEscalationRequest(request) {
  if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
    return { valid: false, message: 'Name is required' };
  }

  if (request.name.trim().length > 100) {
    return { valid: false, message: 'Name must be 100 characters or less' };
  }

  if (!request.email || typeof request.email !== 'string' || request.email.trim().length === 0) {
    return { valid: false, message: 'Email is required' };
  }

  if (request.email.trim().length > 255) {
    return { valid: false, message: 'Email must be 255 characters or less' };
  }

  // More strict email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(request.email.trim())) {
    return { valid: false, message: 'Please provide a valid email address' };
  }

  // Validate optional phone number format if provided (like original)
  if (request.phoneNumber && request.phoneNumber.trim().length > 0) {
    if (request.phoneNumber.trim().length > 20) {
      return { valid: false, message: 'Phone number must be 20 characters or less' };
    }
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = request.phoneNumber.replace(/[\s\-\(\)\.]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      // Don't fail validation, just log warning like original
      console.warn('Invalid phone number format provided:', '***-***-' + request.phoneNumber.slice(-4));
    }
  }

  // Validate optional zip code format if provided (like original)
  if (request.zipCode && request.zipCode.trim().length > 0) {
    if (request.zipCode.trim().length > 10) {
      return { valid: false, message: 'ZIP code must be 10 characters or less' };
    }
    const zipRegex = /^\d{5}(-\d{4})?$/;
    if (!zipRegex.test(request.zipCode.trim())) {
      // Don't fail validation, just log warning like original
      console.warn('Invalid zip code format provided:', request.zipCode);
    }
  }

  return { valid: true };
}

/**
 * Check rate limiting for escalation submissions
 * Prevents spam by limiting submissions per email address
 */
async function checkRateLimit(email) {
  try {
    const now = Date.now();
    const windowStart = new Date(now - (RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)).toISOString();

    // Query recent submissions from the same email
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: ESCALATION_TABLE,
      FilterExpression: '#email = :email AND #timestamp > :windowStart',
      ExpressionAttributeNames: {
        '#email': 'email',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: marshall({
        ':email': email.toLowerCase(),
        ':windowStart': windowStart
      }),
      Select: 'COUNT'
    }));

    const recentSubmissions = scanResult.Count || 0;

    if (recentSubmissions >= MAX_SUBMISSIONS_PER_EMAIL) {
      return {
        allowed: false,
        message: `Too many requests. Please wait ${RATE_LIMIT_WINDOW_MINUTES} minutes before submitting again.`
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Fail open - allow submission if rate limit check fails
    return { allowed: true };
  }
}

/**
 * Redact PII from data before logging to CloudWatch
 * Masks email addresses, phone numbers, and other sensitive data
 */
function redactPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const redacted = JSON.parse(JSON.stringify(obj)); // Deep clone

  function redactRecursive(item) {
    if (Array.isArray(item)) {
      return item.map(redactRecursive);
    }

    if (item && typeof item === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(item)) {
        const lowerKey = key.toLowerCase();

        // Redact email addresses
        if (lowerKey.includes('email')) {
          if (typeof value === 'string' && value.includes('@')) {
            const parts = value.split('@');
            result[key] = `${parts[0][0]}***@${parts[1]}`;
          } else {
            result[key] = '[REDACTED-EMAIL]';
          }
        }
        // Redact phone numbers
        else if (lowerKey.includes('phone')) {
          result[key] = typeof value === 'string' && value.length > 0 ? '***-***-' + value.slice(-4) : '[REDACTED-PHONE]';
        }
        // Redact names
        else if (lowerKey === 'name') {
          result[key] = typeof value === 'string' && value.length > 0 ? value[0] + '***' : '[REDACTED-NAME]';
        }
        // Redact body content which might contain PII
        else if (lowerKey === 'body' && typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            result[key] = JSON.stringify(redactRecursive(parsed));
          } catch {
            result[key] = '[REDACTED-BODY]';
          }
        }
        // Recursively handle nested objects
        else if (value && typeof value === 'object') {
          result[key] = redactRecursive(value);
        }
        // Keep other fields as-is
        else {
          result[key] = value;
        }
      }
      return result;
    }

    return item;
  }

  return redactRecursive(redacted);
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Removes HTML tags, control characters, and normalizes whitespace
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return input;

  return input
    .trim()
    // Remove HTML tags (greedy to catch everything between < and >)
    .replace(/<[^>]*>?/gm, '')
    // Remove any remaining < or > characters
    .replace(/[<>]/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create standardized API response with CORS headers
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': FRONTEND_URL,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Credentials': 'true'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}