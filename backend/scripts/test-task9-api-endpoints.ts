#!/usr/bin/env ts-node

/**
 * Task 9 API Endpoints Test Script
 * 
 * Tests all enhanced API endpoints for the admin dashboard
 * Requirements: 1.1, 1.2, 4.1, 5.1, 6.1, 8.1
 */

import { AdminAnalyticsProcessor } from '../lambda/admin-analytics';

interface TestResult {
  endpoint: string;
  requirement: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  error?: string;
  data?: any;
}

class Task9APIEndpointTester {
  private processor: AdminAnalyticsProcessor;
  private results: TestResult[] = [];

  constructor() {
    this.processor = new AdminAnalyticsProcessor();
  }

  /**
   * Run all Task 9 API endpoint tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Task 9 API Endpoints Test Suite');
    console.log('=' .repeat(60));

    const tests = [
      // Requirement 1.1, 1.2 - Enhanced Dashboard Endpoint
      { name: 'Enhanced Dashboard Metrics', method: this.testEnhancedDashboard.bind(this), requirement: '1.1, 1.2' },
      
      // Requirement 1.1, 1.2 - Conversation Analytics Endpoint
      { name: 'Conversation Analytics', method: this.testConversationAnalytics.bind(this), requirement: '1.1, 1.2' },
      
      // Requirement 8.1 - Conversation Details Endpoint
      { name: 'Conversation Details', method: this.testConversationDetails.bind(this), requirement: '8.1' },
      
      // Requirement 4.1, 5.1 - Question Analysis Endpoint
      { name: 'Question Analysis', method: this.testQuestionAnalysis.bind(this), requirement: '4.1, 5.1' },
      
      // Requirement 6.1 - Enhanced Real-time Endpoint
      { name: 'Enhanced Real-time Metrics', method: this.testEnhancedRealtime.bind(this), requirement: '6.1' },
      
      // Additional enhanced endpoints
      { name: 'Enhanced FAQ Analysis', method: this.testEnhancedFAQ.bind(this), requirement: '4.1' },
      { name: 'Enhanced Question Ranking', method: this.testEnhancedQuestionRanking.bind(this), requirement: '4.1' },
      { name: 'Escalation Analytics', method: this.testEscalationAnalytics.bind(this), requirement: '3.1, 3.2' },
      { name: 'System Health Check', method: this.testSystemHealth.bind(this), requirement: '6.1' }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.method, test.requirement);
    }

    this.printSummary();
  }

  /**
   * Run individual test with error handling and timing
   */
  private async runTest(name: string, testMethod: () => Promise<any>, requirement: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`\n📋 Testing: ${name}`);
      console.log(`   Requirement: ${requirement}`);
      
      const result = await testMethod();
      const duration = Date.now() - startTime;
      
      this.results.push({
        endpoint: name,
        requirement,
        status: 'PASS',
        duration,
        data: result
      });
      
      console.log(`   ✅ PASS (${duration}ms)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        endpoint: name,
        requirement,
        status: 'FAIL',
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log(`   ❌ FAIL (${duration}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test enhanced dashboard metrics endpoint
   * Requirements: 1.1, 1.2 - Total conversations with dates and languages
   */
  private async testEnhancedDashboard(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      language: 'en'
    };

    const result = await this.processor.getEnhancedDashboardMetrics(params);
    
    // Validate response structure
    this.validateRequired(result, ['conversationAnalytics', 'questionAnalytics', 'escalationAnalytics', 'realTimeMetrics']);
    
    // Validate conversation analytics structure
    const convAnalytics = result.conversationAnalytics;
    this.validateRequired(convAnalytics, ['totalConversations', 'conversationsByDate', 'languageDistribution']);
    
    // Validate date breakdown
    if (convAnalytics.conversationsByDate && convAnalytics.conversationsByDate.length > 0) {
      const dateEntry = convAnalytics.conversationsByDate[0];
      this.validateRequired(dateEntry, ['date', 'count', 'languages']);
      this.validateRequired(dateEntry.languages, ['en', 'es']);
    }
    
    console.log(`     📊 Total conversations: ${convAnalytics.totalConversations}`);
    console.log(`     🌐 Language distribution: EN=${convAnalytics.languageDistribution.en}, ES=${convAnalytics.languageDistribution.es}`);
    
    return result;
  }

  /**
   * Test conversation analytics endpoint
   * Requirements: 1.1, 1.2 - Conversation data with dates and languages
   */
  private async testConversationAnalytics(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      language: 'en',
      limit: 50,
      offset: 0
    };

    const result = await this.processor.getConversationAnalytics(params);
    
    // Validate response structure
    this.validateRequired(result, ['analytics', 'pagination']);
    
    const analytics = result.analytics;
    this.validateRequired(analytics, ['totalConversations', 'conversationsByDate', 'languageDistribution', 'unansweredPercentage']);
    
    // Validate pagination
    this.validateRequired(result.pagination, ['limit', 'offset', 'total']);
    
    console.log(`     📈 Total conversations: ${analytics.totalConversations}`);
    console.log(`     📉 Unanswered percentage: ${analytics.unansweredPercentage}%`);
    
    return result;
  }

  /**
   * Test conversation details endpoint
   * Requirements: 8.1 - Complete message history for conversations
   */
  private async testConversationDetails(): Promise<any> {
    const conversationId = 'test-conversation-001';

    try {
      const result = await this.processor.getConversationDetails(conversationId);
      
      if (result) {
        // Validate response structure
        this.validateRequired(result, ['conversationId', 'userId', 'startTime', 'language', 'messageCount', 'messages', 'outcome']);
        
        // Validate messages structure
        if (result.messages && result.messages.length > 0) {
          const message = result.messages[0];
          this.validateRequired(message, ['timestamp', 'type', 'content']);
        }
        
        console.log(`     💬 Conversation ID: ${result.conversationId}`);
        console.log(`     📝 Message count: ${result.messageCount}`);
        console.log(`     🎯 Outcome: ${result.outcome}`);
      } else {
        console.log(`     ℹ️  No conversation found with ID: ${conversationId} (expected for test)`);
      }
      
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.log(`     ℹ️  Conversation not found (expected for test): ${conversationId}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Test question analysis endpoint
   * Requirements: 4.1, 5.1 - FAQ and unanswered questions
   */
  private async testQuestionAnalysis(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      category: 'all',
      limit: 20,
      includeUnanswered: true
    };

    const result = await this.processor.getQuestionAnalysis(params);
    
    // Validate response structure
    this.validateRequired(result, ['faq', 'summary']);
    
    const faq = result.faq;
    this.validateRequired(faq, ['topQuestions', 'questionsByCategory', 'totalQuestionsAnalyzed']);
    
    // Validate summary
    this.validateRequired(result.summary, ['totalQuestions', 'answeredQuestions', 'unansweredQuestions', 'answerRate']);
    
    console.log(`     ❓ Total questions analyzed: ${faq.totalQuestionsAnalyzed}`);
    console.log(`     📊 Answer rate: ${result.summary.answerRate}%`);
    
    return result;
  }

  /**
   * Test enhanced real-time metrics endpoint
   * Requirements: 6.1 - Real-time dashboard updates
   */
  private async testEnhancedRealtime(): Promise<any> {
    const result = await this.processor.getEnhancedRealTimeMetrics();
    
    // Validate response structure
    this.validateRequired(result, ['liveConversations', 'activeUsers', 'escalations', 'systemPerformance', 'alerts']);
    
    // Validate live conversations
    this.validateRequired(result.liveConversations, ['active', 'total', 'byLanguage']);
    
    // Validate system performance
    this.validateRequired(result.systemPerformance, ['responseTime', 'cpuUsage', 'memoryUsage']);
    
    console.log(`     🔴 Active conversations: ${result.liveConversations.active}`);
    console.log(`     👥 Active users: ${result.activeUsers.total}`);
    console.log(`     ⚡ Response time: ${result.systemPerformance.responseTime.p50}ms`);
    
    return result;
  }

  /**
   * Test enhanced FAQ analysis endpoint
   */
  private async testEnhancedFAQ(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      language: 'en',
      limit: 20,
      includeExtraction: true
    };

    const result = await this.processor.getEnhancedFAQAnalysis(params);
    
    // Validate response structure
    this.validateRequired(result, ['topQuestions', 'questionsByCategory', 'totalQuestionsAnalyzed']);
    
    console.log(`     🔍 Enhanced FAQ questions analyzed: ${result.totalQuestionsAnalyzed}`);
    
    return result;
  }

  /**
   * Test enhanced question ranking endpoint
   */
  private async testEnhancedQuestionRanking(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      language: 'en',
      method: 'combined',
      limit: 20
    };

    const result = await this.processor.getEnhancedQuestionRanking(params);
    
    // Validate response structure
    this.validateRequired(result, ['rankedQuestions', 'rankingMethod', 'totalQuestionsRanked']);
    
    console.log(`     📈 Questions ranked: ${result.totalQuestionsRanked}`);
    console.log(`     🎯 Ranking method: ${result.rankingMethod}`);
    
    return result;
  }

  /**
   * Test escalation analytics endpoint
   */
  private async testEscalationAnalytics(): Promise<any> {
    const params = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      priority: 'high',
      status: 'pending',
      granularity: 'daily'
    };

    const result = await this.processor.getEscalationAnalytics(params);
    
    // Validate response structure
    this.validateRequired(result, ['totalEscalations', 'escalationsByPriority', 'escalationsByStatus', 'escalationTrends']);
    
    console.log(`     🚨 Total escalations: ${result.totalEscalations}`);
    
    return result;
  }

  /**
   * Test system health endpoint
   */
  private async testSystemHealth(): Promise<any> {
    const result = await this.processor.getSystemHealth();
    
    // Validate response structure
    this.validateRequired(result, ['dynamodbHealth', 's3Health', 'sesHealth', 'overallHealth', 'lastHealthCheck']);
    
    console.log(`     🏥 Overall health: ${result.overallHealth}`);
    console.log(`     🗄️  DynamoDB: ${result.dynamodbHealth ? '✅' : '❌'}`);
    console.log(`     📦 S3: ${result.s3Health ? '✅' : '❌'}`);
    console.log(`     📧 SES: ${result.sesHealth ? '✅' : '❌'}`);
    
    return result;
  }

  /**
   * Validate that required fields exist in an object
   */
  private validateRequired(obj: any, fields: string[]): void {
    if (!obj) {
      throw new Error('Object is null or undefined');
    }
    
    for (const field of fields) {
      if (!(field in obj)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TASK 9 API ENDPOINTS TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n📈 Results: ${passed}/${total} tests passed (${failed} failed)`);
    console.log(`⏱️  Total duration: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`   • ${r.endpoint} (${r.requirement}): ${r.error}`);
        });
    }

    console.log('\n✅ Passed Tests:');
    this.results
      .filter(r => r.status === 'PASS')
      .forEach(r => {
        console.log(`   • ${r.endpoint} (${r.requirement}) - ${r.duration}ms`);
      });

    // Requirements coverage
    console.log('\n📋 Requirements Coverage:');
    const requirements = new Set(this.results.map(r => r.requirement));
    requirements.forEach(req => {
      const reqTests = this.results.filter(r => r.requirement === req);
      const reqPassed = reqTests.filter(r => r.status === 'PASS').length;
      const reqTotal = reqTests.length;
      console.log(`   • Requirement ${req}: ${reqPassed}/${reqTotal} tests passed`);
    });

    if (passed === total) {
      console.log('\n🎉 All Task 9 API endpoint tests passed!');
      console.log('✅ Enhanced dashboard API endpoints are ready for production');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review and fix issues before deployment.`);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const tester = new Task9APIEndpointTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { Task9APIEndpointTester };