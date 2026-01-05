/**
 * Escalation Handler Lambda
 * Consolidated single-file implementation
 * 
 * Handles:
 * - POST /escalation/request - Submit escalation request
 * - GET /admin/escalation-requests - Get escalation requests for admin
 * - GET /escalation/health - Health check
 */

const { DynamoDBClient, PutItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize AWS clients
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables
const ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Escalation handler invoked:', JSON.stringify(event, null, 2));

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

    // Create escalation record
    const now = new Date();
    const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const escalationRecord = {
      escalationId,
      name: request.name.trim(),
      email: request.email.trim().toLowerCase(), // Convert to lowercase like original
      phoneNumber: request.phoneNumber?.trim() || undefined,
      zipCode: request.zipCode?.trim() || undefined,
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
      Item: marshall(escalationRecord)
    }));

    console.log(`Escalation request created: ${escalationId} for ${request.email}`);

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

    console.log(`Getting escalation requests: page=${page}, limit=${limit}`);

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

    // Scan DynamoDB table
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: ESCALATION_TABLE,
      Limit: 1000 // Get all items to filter and paginate
    }));

    const allItems = scanResult.Items?.map(item => unmarshall(item)) || [];

    // Filter to only include requests submitted via Submit button
    const submittedItems = allItems.filter(item => 
      item.escalationId && item.source === 'form_submit'
    );

    console.log(`Found ${submittedItems.length} submitted escalation requests out of ${allItems.length} total`);

    // Sort by timestamp (newest first)
    submittedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = submittedItems.slice(startIndex, endIndex);

    // Format response
    const requests = paginatedItems.map(item => ({
      name: item.name || 'N/A',
      email: item.email || 'N/A',
      phone: item.phoneNumber || 'N/A',
      zipCode: item.zipCode || 'N/A',
      dateTime: item.dateTime || 'N/A'
    }));

    console.log(`Returning ${requests.length} requests for page ${page}, total: ${submittedItems.length}`);

    return createResponse(200, {
      requests,
      total: submittedItems.length
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

  if (!request.email || typeof request.email !== 'string' || request.email.trim().length === 0) {
    return { valid: false, message: 'Email is required' };
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(request.email.trim())) {
    return { valid: false, message: 'Please provide a valid email address' };
  }

  // Validate optional phone number format if provided (like original)
  if (request.phoneNumber && request.phoneNumber.trim().length > 0) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = request.phoneNumber.replace(/[\s\-\(\)\.]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      // Don't fail validation, just log warning like original
      console.warn('Invalid phone number format provided:', request.phoneNumber);
    }
  }

  // Validate optional zip code format if provided (like original)
  if (request.zipCode && request.zipCode.trim().length > 0) {
    const zipRegex = /^\d{5}(-\d{4})?$/;
    if (!zipRegex.test(request.zipCode.trim())) {
      // Don't fail validation, just log warning like original
      console.warn('Invalid zip code format provided:', request.zipCode);
    }
  }

  return { valid: true };
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
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}