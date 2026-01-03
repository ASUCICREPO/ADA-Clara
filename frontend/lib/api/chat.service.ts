/**
 * Chat API Service
 * Handles all chat-related API calls
 */

import { getConfig } from './config';

export interface ChatRequest {
  message: string;
  sessionId?: string;
  language?: string;
}

export interface ChatSource {
  url: string;
  title: string;
  excerpt: string;
}

export interface ChatResponse {
  message: string;
  sources?: ChatSource[];
  sessionId: string;
  escalated?: boolean;
}

export interface ChatHistoryResponse {
  sessionId: string;
  messages: Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  timestamp: string;
}

/**
 * Send a chat message to the API
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const config = getConfig();
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: request.message,
        sessionId: request.sessionId,
        language: request.language || 'en',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ChatResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Chat API error:', error);
    throw error;
  }
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const config = getConfig();
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/chat/history?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ChatHistoryResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Chat history API error:', error);
    throw error;
  }
}

/**
 * Health check for the API
 */
export async function checkApiHealth(): Promise<boolean> {
  const config = getConfig();
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/health`, {
      method: 'GET',
    });

    return response.ok;
  } catch (error) {
    console.error('Health check error:', error);
    return false;
  }
}

