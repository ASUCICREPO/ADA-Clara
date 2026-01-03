/**
 * Escalation API Service
 * Handles escalation request submissions
 */

import { getConfig } from './config';

export interface EscalationRequest {
  name: string;
  email: string;
  phoneNumber?: string;
  zipCode?: string;
}

export interface EscalationResponse {
  success: boolean;
  message: string;
  escalationId?: string;
  status?: string;
  error?: string;
}

/**
 * Submit an escalation request
 */
export async function submitEscalationRequest(
  request: EscalationRequest
): Promise<EscalationResponse> {
  const config = getConfig();
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/escalation/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: request.name,
        email: request.email,
        phoneNumber: request.phoneNumber || undefined,
        zipCode: request.zipCode || undefined,
      }),
    });

    const data: EscalationResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || data.error || `HTTP ${response.status}: ${response.statusText}`,
        error: data.error,
      };
    }

    return {
      success: true,
      message: data.message || 'Thank you! Someone from the American Diabetes Association will reach out to you shortly.',
      escalationId: data.escalationId,
      status: data.status,
    };
  } catch (error) {
    console.error('Escalation API error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to submit escalation request. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

