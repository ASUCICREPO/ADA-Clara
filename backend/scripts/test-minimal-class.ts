#!/usr/bin/env ts-node

/**
 * Test with a minimal version of AdminAnalyticsProcessor to isolate the issue
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DataService } from '../src/services/data-service';
import { EscalationService } from '../src/services/escalation-service';
import { AnalyticsService } from '../src/services/analytics-service';

export class AdminAnalyticsProcessor {
  private dataService: DataService;
  private escalationService: EscalationService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.dataService = new DataService();
    this.escalationService = new EscalationService();
    this.analyticsService = new AnalyticsService();
  }

  async getSystemHealth(): Promise<any> {
    return { status: 'healthy' };
  }
}

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const processor = new AdminAnalyticsProcessor();
  
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: true,
      message: 'Minimal test successful'
    })
  };
};

// Test the exports
console.log('🔍 Testing minimal class exports...');
console.log('📦 Available exports:', Object.keys(module.exports));

if (typeof AdminAnalyticsProcessor !== 'undefined') {
  console.log('✅ AdminAnalyticsProcessor is available');
  try {
    const instance = new AdminAnalyticsProcessor();
    console.log('✅ Instance created successfully');
  } catch (error) {
    console.error('❌ Instance creation failed:', error);
  }
} else {
  console.log('❌ AdminAnalyticsProcessor is not available');
}