/**
 * Escalation Handler Lambda Function
 * Handles "Talk to Person" form submissions from the frontend
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface EscalationRequest {
  name: string;
  email: string;
  phoneNumber?: string;
  zipCode?: string;
}

interface EscalationRecord {
  escalationId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  zipCode?: string;
  dateTime: string;
  timestamp: string;
  status: 'pending' | 'contacted' | 'resolved';
  source: 'chat_escalation';
}

class EscalationHandler {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';
  }

  /**
   * Handle escalation request submission
   */
  async handleEscalationRequest(request: EscalationRequest): Promise<EscalationRecord> {
    // Validate required fields
    if (!request.name || !request.email) {
      throw new Error('Name and email are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      throw new Error('Please provide a valid email address');
    }

    const now = new Date();
    const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const escalationRecord: EscalationRecord = {
      escalationId,
      name: request.name.trim(),
      email: request.email.trim().toLowerCase(),
      phoneNumber: request.phoneNumber?.trim() || undefined,
      zipCode: request.zipCode?.trim() || undefined,
      dateTime: now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      timestamp: now.toISOString(),
      status: 'pending',
      source: 'chat_escalation'
    };

    // Store in DynamoDB
    await this.dynamoClient.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...escalationRecord,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
      }
    }));

    console.log(`Escalation request created: ${escalationId} for ${request.email}`);

    return escalationRecord;
  }

  /**
   * Get escalation requests (for admin dashboard)
   */
  async getEscalationRequests(limit: number = 50): Promise<EscalationRecord[]> {
    try {
      // In a real implementation, this would scan/query the DynamoDB table
      // For now, return mock data that matches the frontend expectations
      const mockData: EscalationRecord[] = [
        {
          escalationId: 'esc-1',
          name: 'Maria Rodriguez',
          email: 'maria.rodriguez@email.com',
          phoneNumber: '(555) 234-5678',
          zipCode: '85001',
          dateTime: 'Dec 21, 2:34 PM',
          timestamp: '2024-12-21T14:34:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-2',
          name: 'James Smith',
          email: 'james.smith@email.com',
          phoneNumber: '(555) 987-6543',
          zipCode: '85002',
          dateTime: 'Dec 22, 10:30 AM',
          timestamp: '2024-12-22T10:30:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-3',
          name: 'Aisha Khan',
          email: 'aisha.khan@email.com',
          phoneNumber: undefined,
          zipCode: undefined,
          dateTime: 'Dec 23, 1:45 PM',
          timestamp: '2024-12-23T13:45:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-4',
          name: 'Liam Johnson',
          email: 'liam.johnson@email.com',
          phoneNumber: '(555) 321-0987',
          zipCode: '85004',
          dateTime: 'Dec 24, 4:20 PM',
          timestamp: '2024-12-24T16:20:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-5',
          name: 'Sofia Garcia',
          email: 'sofia.garcia@email.com',
          phoneNumber: undefined,
          zipCode: '85005',
          dateTime: 'Dec 25, 3:15 PM',
          timestamp: '2024-12-25T15:15:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-6',
          name: 'Ethan Lee',
          email: 'ethan.lee@email.com',
          phoneNumber: '(555) 789-0123',
          zipCode: undefined,
          dateTime: 'Dec 26, 11:00 AM',
          timestamp: '2024-12-26T11:00:00Z',
          status: 'pending',
          source: 'chat_escalation'
        },
        {
          escalationId: 'esc-7',
          name: 'Olivia Brown',
          email: 'olivia.brown@email.com',
          phoneNumber: undefined,
          zipCode: undefined,
          dateTime: 'Dec 27, 9:45 AM',
          timestamp: '2024-12-27T09:45:00Z',
          status: 'pending',
          source: 'chat_escalation'
        }
      ];

      return mockData.slice(0, limit);
    } catch (error) {
      console.error('Failed to get escalation requests:', error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; service: string }> {
    return {
      status: 'healthy',
      service: 'escalation-handler'
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
  console.log('Escalation handler invoked:', JSON.stringify(event, null, 2));

  const escalationHandler = new EscalationHandler();

  try {
    const path = event.path;
    const method = event.httpMethod;

    if (method === 'POST' && (path === '/escalation/request' || path === '/escalation')) {
      // Handle escalation request submission
      if (!event.body) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Request body is required',
            message: 'Please provide escalation request data'
          })
        };
      }

      const request: EscalationRequest = JSON.parse(event.body);
      const escalationRecord = await escalationHandler.handleEscalationRequest(request);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
        },
        body: JSON.stringify({
          success: true,
          message: 'Thank you! Someone from the American Diabetes Association will reach out to you shortly.',
          escalationId: escalationRecord.escalationId,
          status: escalationRecord.status
        })
      };

    } else if (method === 'GET' && (path === '/escalation/requests' || path === '/admin/escalation-requests')) {
      // Get escalation requests for admin dashboard
      const limit = event.queryStringParameters?.limit ? 
        parseInt(event.queryStringParameters.limit) : 50;
      
      const requests = await escalationHandler.getEscalationRequests(limit);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({
          requests: requests.map(req => ({
            name: req.name,
            email: req.email,
            phone: req.phoneNumber || '-',
            zipCode: req.zipCode || '-',
            dateTime: req.dateTime
          })),
          total: requests.length
        })
      };

    } else if (method === 'GET' && (path === '/escalation/health' || path === '/escalation')) {
      // Health check
      const health = await escalationHandler.healthCheck();
      
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
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
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
            'POST /escalation/request',
            'GET /escalation/requests',
            'GET /escalation/health'
          ]
        })
      };
    }

  } catch (error) {
    console.error('Escalation handler error:', error);

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