import { DynamoDBService } from '../../services/dynamodb-service';

export interface EscalationRequest {
  name: string;
  email: string;
  phoneNumber?: string;
  zipCode?: string;
  message?: string;
  escalationType?: string; // 'submit' or 'talk_to_person'
}

export interface EscalationRecord {
  escalationId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  zipCode?: string;
  dateTime: string;
  timestamp: string;
  status: string;
  source: string;
}

export interface EscalationListItem {
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  dateTime: string;
}

export interface EscalationListResponse {
  requests: EscalationListItem[];
  total: number;
}

export class EscalationService {
  private readonly ESCALATION_TABLE = process.env.ESCALATION_REQUESTS_TABLE || 'ada-clara-escalation-requests';

  constructor(private dynamoService: DynamoDBService) {}

  /**
   * Handle escalation request submission
   */
  async handleEscalationRequest(request: EscalationRequest): Promise<EscalationRecord> {
    // Validate required fields
    this.validateEscalationRequest(request);

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
      source: request.escalationType === 'submit' ? 'form_submit' : 'talk_to_person'
    };

    // Store in DynamoDB
    await this.dynamoService.putItem(this.ESCALATION_TABLE, {
      ...escalationRecord,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    });

    console.log(`Escalation request created: ${escalationId} for ${request.email}`);

    return escalationRecord;
  }

  /**
   * Get escalation requests (for admin dashboard)
   * Only returns requests where source = 'form_submit' (submitted via Submit button)
   */
  async getEscalationRequests(limit: number = 10, page: number = 1): Promise<EscalationListResponse> {
    try {
      console.log(`Fetching escalation requests from DynamoDB table: ${this.ESCALATION_TABLE}, limit: ${limit}, page: ${page}`);
      
      // Scan DynamoDB table for escalation requests
      // We'll filter client-side to only include requests submitted via Submit button (source = 'form_submit')
      const allItems = await this.dynamoService.scanItems(this.ESCALATION_TABLE, {
        limit: 1000 // Get all items to filter and paginate
      });

      // Filter to only include requests submitted via Submit button
      const submittedItems = allItems.filter(item => 
        item.escalationId && item.source === 'form_submit'
      );

      console.log(`Found ${submittedItems.length} submitted escalation requests out of ${allItems.length} total requests in DynamoDB`);

      if (!submittedItems || submittedItems.length === 0) {
        return {
          requests: [],
          total: 0
        };
      }

      // Sort by timestamp descending (newest first)
      const sortedItems = submittedItems.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Calculate pagination
      const total = sortedItems.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedItems = sortedItems.slice(startIndex, endIndex);

      console.log(`[EscalationService] Pagination: page=${page}, limit=${limit}, total=${total}, startIndex=${startIndex}, endIndex=${endIndex}, itemsReturned=${paginatedItems.length}`);

      const requests = paginatedItems.map(item => ({
        name: item.name || 'Unknown',
        email: item.email || 'No email',
        phone: item.phoneNumber || '-',
        zipCode: item.zipCode || '-',
        dateTime: item.dateTime || 'Unknown date'
      }));

      return {
        requests,
        total
      };
    } catch (error) {
      console.error('Failed to get escalation requests from DynamoDB:', error);
      
      // Return empty result on error, but log the issue
      return {
        requests: [],
        total: 0
      };
    }
  }

  /**
   * Health check for escalation service
   */
  async healthCheck(): Promise<{ status: string; service: string; timestamp: string }> {
    try {
      // Test database connectivity
      await this.dynamoService.healthCheck();
      
      return {
        status: 'healthy',
        service: 'escalation-handler',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Escalation service health check failed:', error);
      return {
        status: 'unhealthy',
        service: 'escalation-handler',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate escalation request data
   */
  private validateEscalationRequest(request: EscalationRequest): void {
    if (!request.name || typeof request.name !== 'string' || request.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    if (!request.email || typeof request.email !== 'string' || request.email.trim().length === 0) {
      throw new Error('Email is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email.trim())) {
      throw new Error('Please provide a valid email address');
    }

    // Validate optional phone number format if provided
    if (request.phoneNumber && request.phoneNumber.trim().length > 0) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      const cleanPhone = request.phoneNumber.replace(/[\s\-\(\)\.]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        // Don't throw error for phone, just log warning
        console.warn('Invalid phone number format provided:', request.phoneNumber);
      }
    }

    // Validate optional zip code format if provided
    if (request.zipCode && request.zipCode.trim().length > 0) {
      const zipRegex = /^\d{5}(-\d{4})?$/;
      if (!zipRegex.test(request.zipCode.trim())) {
        // Don't throw error for zip code, just log warning
        console.warn('Invalid zip code format provided:', request.zipCode);
      }
    }
  }
}