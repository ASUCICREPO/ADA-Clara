#!/usr/bin/env ts-node

/**
 * Test just the class definition to see if it compiles
 */

import { DataService } from '../src/services/data-service';
import { EscalationService } from '../src/services/escalation-service';
import { AnalyticsService } from '../src/services/analytics-service';

export class TestAdminAnalyticsProcessor {
  private dataService: DataService;
  private escalationService: EscalationService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.dataService = new DataService();
    this.escalationService = new EscalationService();
    this.analyticsService = new AnalyticsService();
  }

  async getSystemHealth(): Promise<any> {
    return {
      dynamodbHealth: true,
      s3Health: true,
      sesHealth: true,
      overallHealth: 'healthy',
      lastHealthCheck: new Date().toISOString()
    };
  }
}

// Test the class
async function testClass(): Promise<void> {
  console.log('🧪 Testing class definition');
  
  try {
    const processor = new TestAdminAnalyticsProcessor();
    console.log('✅ Class instantiated successfully');
    
    const health = await processor.getSystemHealth();
    console.log('✅ Method called successfully:', health.overallHealth);
  } catch (error) {
    console.error('❌ Class test failed:', error);
  }
}

if (require.main === module) {
  testClass().catch(console.error);
}