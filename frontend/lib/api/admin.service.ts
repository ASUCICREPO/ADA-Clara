/**
 * Admin API Service
 * Handles all admin dashboard API calls
 * Requires Cognito authentication
 */

import { getConfig } from './config';

export interface AdminMetrics {
  totalConversations: number;
  escalationRate: number;
  outOfScopeRate: number;
  trends: {
    conversations: string;
    escalations: string;
    outOfScope: string;
  };
}

export interface ConversationChartData {
  data: Array<{
    date: string;
    conversations: number;
  }>;
}

export interface LanguageSplit {
  english: number;
  spanish: number;
}

export interface EscalationRequestItem {
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  dateTime: string;
}

export interface EscalationRequestsResponse {
  requests: EscalationRequestItem[];
  total: number;
}

export interface FAQItem {
  question: string;
  count?: number;
}

export interface FAQResponse {
  questions: FAQItem[];
}

/**
 * Get authentication token from Cognito
 * This should be called from the auth service
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  // Try to get token from localStorage or Amplify Auth
  try {
    // Will be replaced with actual Amplify Auth call when implemented
    const token = localStorage.getItem('cognito_id_token');
    return token;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated API call
 */
async function authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const config = getConfig();
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('Authentication required. Please log in.');
  }

  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('cognito_id_token');
    throw new Error('Authentication expired. Please log in again.');
  }

  return response;
}

/**
 * Get admin dashboard metrics
 */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  try {
    const response = await authenticatedFetch('/admin/metrics', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Admin metrics API error:', error);
    throw error;
  }
}

/**
 * Get conversation chart data
 */
export async function getConversationChart(): Promise<ConversationChartData> {
  try {
    const response = await authenticatedFetch('/admin/conversations/chart', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Conversation chart API error:', error);
    throw error;
  }
}

/**
 * Get language split data
 */
export async function getLanguageSplit(): Promise<LanguageSplit> {
  try {
    const response = await authenticatedFetch('/admin/language-split', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Language split API error:', error);
    throw error;
  }
}

/**
 * Get escalation requests
 */
export async function getEscalationRequests(): Promise<EscalationRequestsResponse> {
  try {
    const response = await authenticatedFetch('/escalation/requests', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Escalation requests API error:', error);
    throw error;
  }
}

/**
 * Get frequently asked questions
 */
export async function getFrequentlyAskedQuestions(): Promise<FAQResponse> {
  try {
    const response = await authenticatedFetch('/admin/frequently-asked-questions', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('FAQ API error:', error);
    throw error;
  }
}

/**
 * Get unanswered questions
 */
export async function getUnansweredQuestions(): Promise<FAQResponse> {
  try {
    const response = await authenticatedFetch('/admin/unanswered-questions', {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Unanswered questions API error:', error);
    throw error;
  }
}

