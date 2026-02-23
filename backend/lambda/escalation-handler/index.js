/**
 * Escalation Handler Lambda
 *
 * Handles:
 * - POST /escalation/request - Submit escalation request
 * - GET /admin/escalation-requests - Get escalation requests for admin
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
    // Support both HTTP API (v2) and REST API (v1) formats
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    // Route requests
    if (method === 'POST' && (path === '/escalation/request' || path === '/escalation')) {
      return await handleEscalationRequest(event);
    } else if (method === 'GET' && (path === '/escalation/requests' || path === '/admin/escalation-requests')) {
      return await getEscalationRequests(event);
    } else if (method === 'OPTIONS') {
      return createResponse(200, '');
    } else {
      return createResponse(404, {
        error: 'Endpoint not found',
        availableEndpoints: [
          'POST /escalation/request',
          'GET /admin/escalation-requests'
        ]
      });
    }

  } catch (error) {
    // SECURITY: Log detailed error server-side only (with PII redaction)
    console.error('Escalation handler error:', redactPII({
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    }));
    
    // Return generic error to client (no internal details)
    return createResponse(500, {
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again.'
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
      questionText: request.questionText ? sanitizeInput(request.questionText) : undefined,
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
    // SECURITY: Log detailed error server-side only (with PII redaction)
    console.error('Error handling escalation request:', redactPII({
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    }));
    
    // Return generic error to client (no internal details)
    return createResponse(500, {
      error: 'Failed to process escalation request',
      message: 'Unable to submit your request at this time. Please try again later.'
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

    // Format response (match frontend schema which uses "phone" not "phoneNumber")
    const requests = paginatedItems.map(item => ({
      name: item.name || 'N/A',
      email: item.email || 'N/A',
      phone: item.phoneNumber || 'N/A',
      zipCode: item.zipCode || 'N/A',
      dateTime: item.dateTime || 'N/A',
      questionText: item.questionText || null
    }));

    console.log(`Returning ${requests.length} requests for page ${page}, total: ${allItems.length}`);

    return createResponse(200, {
      requests,
      total: allItems.length
    });

  } catch (error) {
    // SECURITY: Log detailed error server-side only (with PII redaction)
    console.error('Error fetching escalation requests:', redactPII({
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    }));
    
    // Return generic error to client (no internal details)
    return createResponse(500, {
      error: 'Failed to fetch escalation requests',
      message: 'Unable to retrieve requests at this time. Please try again later.'
    });
  }
}

/**
 * Validate escalation request
 * SECURITY: Comprehensive input validation to prevent injection attacks and data quality issues
 */
function validateEscalationRequest(request) {
  // Validate name field
  if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
    return { valid: false, message: 'Name is required' };
  }

  if (request.name.trim().length < 2) {
    return { valid: false, message: 'Name must be at least 2 characters' };
  }

  if (request.name.trim().length > 100) {
    return { valid: false, message: 'Name must be 100 characters or less' };
  }

  // Validate email field
  if (!request.email || typeof request.email !== 'string' || request.email.trim().length === 0) {
    return { valid: false, message: 'Email is required' };
  }

  if (request.email.trim().length > 255) {
    return { valid: false, message: 'Email must be 255 characters or less' };
  }

  // RFC 5322 compliant email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(request.email.trim())) {
    return { valid: false, message: 'Please provide a valid email address' };
  }

  // Validate optional phone number format if provided
  if (request.phoneNumber !== undefined && request.phoneNumber !== null) {
    if (typeof request.phoneNumber !== 'string') {
      return { valid: false, message: 'Phone number must be a string' };
    }
    
    if (request.phoneNumber.trim().length > 0) {
      if (request.phoneNumber.trim().length > 20) {
        return { valid: false, message: 'Phone number must be 20 characters or less' };
      }
      
      // Remove common formatting characters for validation
      const cleanPhone = request.phoneNumber.replace(/[\s\-\(\)\.]/g, '');
      
      // Must be 10-15 digits (international format support)
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return { valid: false, message: 'Phone number must be 10-15 digits' };
      }
      
      // Must contain only digits (and optional leading +)
      const phoneRegex = /^[\+]?[0-9]{10,15}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return { valid: false, message: 'Phone number must contain only digits' };
      }
    }
  }

  // Validate optional zip code format if provided
  if (request.zipCode !== undefined && request.zipCode !== null) {
    if (typeof request.zipCode !== 'string') {
      return { valid: false, message: 'ZIP code must be a string' };
    }
    
    if (request.zipCode.trim().length > 0) {
      if (request.zipCode.trim().length > 10) {
        return { valid: false, message: 'ZIP code must be 10 characters or less' };
      }
      
      // US ZIP code format: 5 digits or 5+4 format
      const zipRegex = /^\d{5}(-\d{4})?$/;
      if (!zipRegex.test(request.zipCode.trim())) {
        return { valid: false, message: 'ZIP code must be in format 12345 or 12345-6789' };
      }
    }
  }

  // Validate optional question text if provided
  if (request.questionText !== undefined && request.questionText !== null) {
    if (typeof request.questionText !== 'string') {
      return { valid: false, message: 'Question text must be a string' };
    }
    
    if (request.questionText.trim().length > 2000) {
      return { valid: false, message: 'Question text must be 2000 characters or less' };
    }
  }

  // Validate escalationType if provided
  if (request.escalationType !== undefined && request.escalationType !== null) {
    if (typeof request.escalationType !== 'string') {
      return { valid: false, message: 'Escalation type must be a string' };
    }
    
    const validTypes = ['submit', 'talk_to_person'];
    if (!validTypes.includes(request.escalationType)) {
      return { valid: false, message: 'Escalation type must be "submit" or "talk_to_person"' };
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