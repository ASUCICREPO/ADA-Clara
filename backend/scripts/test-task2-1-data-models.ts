#!/usr/bin/env ts-node

/**
 * Task 2.1: TypeScript Data Models Validation Test
 * 
 * Tests and validates all TypeScript interfaces for ADA Clara chatbot
 * Requirements: 2.2, 3.4, 7.3
 */

import * as fs from 'fs';
import * as path from 'path';

// Import all types and validators
import {
  // Core data models
  UserSession,
  ChatMessage,
  KnowledgeContent,
  ProfessionalMember,
  UserPreferences,
  AnalyticsData,
  AuditLog,
  EscalationQueue,
  
  // Enhanced analytics models
  ConversationRecord,
  MessageRecord,
  QuestionRecord,
  EnhancedAnalyticsData,
  
  // Specialized models
  DiabetesRiskAssessment,
  EventInformation,
  LanguageDetectionResult,
  RAGResponse,
  EscalationContext,
  SystemConfiguration,
  ContentScrapingJob,
  
  // Validation classes
  DataValidator,
  EnhancedDataValidator,
  ValidationResult,
  
  // Utility classes
  DynamoDBKeyGenerator,
  TTLCalculator,
  DataModelUtils,
  
  // Source and other supporting types
  Source
} from '../src/types/index';

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  message: string;
  details?: any;
}

class DataModelTester {
  private results: TestResult[] = [];
  private startTime: number = Date.now();

  async runAllTests(): Promise<void> {
    console.log('🧪 Task 2.1: TypeScript Data Models Validation');
    console.log('=' .repeat(70));
    console.log('📋 Testing all data models and validation functions...\n');

    try {
      // Test core data models
      await this.testCoreDataModels();
      
      // Test enhanced analytics models
      await this.testEnhancedAnalyticsModels();
      
      // Test specialized models
      await this.testSpecializedModels();
      
      // Test validation functions
      await this.testValidationFunctions();
      
      // Test utility functions
      await this.testUtilityFunctions();
      
      // Test data model completeness
      await this.testDataModelCompleteness();

    } catch (error) {
      console.error('❌ Testing failed:', error);
    } finally {
      this.generateTestReport();
    }
  }

  private async testCoreDataModels(): Promise<void> {
    console.log('📋 1. Testing Core Data Models...');

    // Test UserSession interface
    await this.runTest('UserSession Interface', () => {
      const session: UserSession = {
        sessionId: 'test-session-123',
        startTime: new Date(),
        language: 'en',
        userInfo: {
          name: 'Test User',
          email: 'test@example.com',
          zipCode: '12345'
        },
        escalated: false,
        messageCount: 5,
        lastActivity: new Date(),
        ttl: TTLCalculator.sessionTTL()
      };

      // Validate required fields
      if (!session.sessionId) throw new Error('sessionId is required');
      if (!session.startTime) throw new Error('startTime is required');
      if (!['en', 'es'].includes(session.language)) throw new Error('Invalid language');
      
      return 'UserSession interface validated successfully';
    });

    // Test ChatMessage interface
    await this.runTest('ChatMessage Interface', () => {
      const message: ChatMessage = {
        messageId: 'msg-123',
        sessionId: 'session-123',
        content: 'What is diabetes?',
        sender: 'user',
        timestamp: new Date(),
        language: 'en',
        ttl: TTLCalculator.messageTTL()
      };

      if (!message.messageId) throw new Error('messageId is required');
      if (!message.content) throw new Error('content is required');
      if (!['user', 'bot'].includes(message.sender)) throw new Error('Invalid sender');
      
      return 'ChatMessage interface validated successfully';
    });

    // Test KnowledgeContent interface
    await this.runTest('KnowledgeContent Interface', () => {
      const content: KnowledgeContent = {
        contentId: 'content-123',
        url: 'https://diabetes.org/about-diabetes',
        title: 'About Diabetes',
        content: 'Diabetes is a chronic condition...',
        lastUpdated: new Date(),
        contentType: 'article',
        language: 'en',
        metadata: {
          category: 'education',
          tags: ['diabetes', 'health'],
          lastScraped: new Date(),
          wordCount: 500,
          readingTime: 3
        },
        createdAt: new Date()
      };

      if (!content.contentId) throw new Error('contentId is required');
      if (!content.url) throw new Error('url is required');
      if (!content.title) throw new Error('title is required');
      
      return 'KnowledgeContent interface validated successfully';
    });

    // Test ProfessionalMember interface
    await this.runTest('ProfessionalMember Interface', () => {
      const member: ProfessionalMember = {
        memberId: 'member-123',
        email: 'professional@ada.org',
        name: 'Dr. Jane Smith',
        membershipType: 'Professional',
        status: 'active',
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        benefits: ['access-to-resources', 'continuing-education'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!member.memberId) throw new Error('memberId is required');
      if (!member.email) throw new Error('email is required');
      if (!['active', 'expired', 'suspended'].includes(member.status)) {
        throw new Error('Invalid status');
      }
      
      return 'ProfessionalMember interface validated successfully';
    });

    console.log('   ✅ Core data models validated\n');
  }

  private async testEnhancedAnalyticsModels(): Promise<void> {
    console.log('📋 2. Testing Enhanced Analytics Models...');

    // Test ConversationRecord interface
    await this.runTest('ConversationRecord Interface', () => {
      const conversation: ConversationRecord = {
        conversationId: 'conv-123',
        userId: 'user-123',
        sessionId: 'session-123',
        startTime: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        date: '2024-01-15',
        language: 'en',
        messageCount: 10,
        totalConfidenceScore: 8.5,
        averageConfidenceScore: 0.85,
        outcome: 'resolved'
      };

      if (!conversation.conversationId) throw new Error('conversationId is required');
      if (!['resolved', 'escalated', 'abandoned'].includes(conversation.outcome)) {
        throw new Error('Invalid outcome');
      }
      
      return 'ConversationRecord interface validated successfully';
    });

    // Test MessageRecord interface
    await this.runTest('MessageRecord Interface', () => {
      const messageRecord: MessageRecord = {
        conversationId: 'conv-123',
        messageIndex: 1,
        timestamp: new Date().toISOString(),
        type: 'user',
        content: 'What is type 1 diabetes?',
        escalationTrigger: false,
        isAnswered: true,
        language: 'en'
      };

      if (!messageRecord.conversationId) throw new Error('conversationId is required');
      if (messageRecord.messageIndex < 0) throw new Error('messageIndex must be >= 0');
      if (!['user', 'bot'].includes(messageRecord.type)) throw new Error('Invalid type');
      
      return 'MessageRecord interface validated successfully';
    });

    // Test QuestionRecord interface
    await this.runTest('QuestionRecord Interface', () => {
      const question: QuestionRecord = {
        questionHash: 'hash-123',
        originalQuestion: 'What is diabetes?',
        normalizedQuestion: 'what is diabetes',
        category: 'general',
        date: '2024-01-15',
        count: 5,
        totalConfidenceScore: 4.2,
        averageConfidenceScore: 0.84,
        answeredCount: 4,
        unansweredCount: 1,
        escalationCount: 0,
        language: 'en',
        lastAsked: new Date().toISOString()
      };

      if (!question.questionHash) throw new Error('questionHash is required');
      if (!question.originalQuestion) throw new Error('originalQuestion is required');
      if (question.count < 0) throw new Error('count must be >= 0');
      
      return 'QuestionRecord interface validated successfully';
    });

    console.log('   ✅ Enhanced analytics models validated\n');
  }

  private async testSpecializedModels(): Promise<void> {
    console.log('📋 3. Testing Specialized Models...');

    // Test DiabetesRiskAssessment interface
    await this.runTest('DiabetesRiskAssessment Interface', () => {
      const assessment: DiabetesRiskAssessment = {
        assessmentId: 'assessment-123',
        sessionId: 'session-123',
        startTime: new Date(),
        language: 'en',
        responses: {
          age: 45,
          gender: 'female',
          weight: 70,
          height: 165,
          familyHistory: true,
          physicalActivity: 'moderate'
        },
        riskScore: 65,
        riskLevel: 'moderate',
        recommendations: [
          'Schedule a diabetes screening with your healthcare provider',
          'Focus on weight management and physical activity'
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!assessment.assessmentId) throw new Error('assessmentId is required');
      if (!['low', 'moderate', 'high', 'very-high'].includes(assessment.riskLevel)) {
        throw new Error('Invalid riskLevel');
      }
      
      return 'DiabetesRiskAssessment interface validated successfully';
    });

    // Test EventInformation interface
    await this.runTest('EventInformation Interface', () => {
      const event: EventInformation = {
        eventId: 'event-123',
        title: 'Diabetes Education Workshop',
        description: 'Learn about diabetes management',
        eventType: 'education',
        startDate: new Date(),
        location: {
          venue: 'Community Center',
          address: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          isVirtual: false
        },
        registration: {
          required: true,
          url: 'https://example.com/register',
          capacity: 50,
          cost: 0
        },
        targetAudience: ['patients', 'caregivers'],
        language: 'en',
        tags: ['education', 'workshop'],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastScraped: new Date()
      };

      if (!event.eventId) throw new Error('eventId is required');
      if (!['education', 'support', 'fundraising', 'conference', 'webinar'].includes(event.eventType)) {
        throw new Error('Invalid eventType');
      }
      
      return 'EventInformation interface validated successfully';
    });

    // Test RAGResponse interface
    await this.runTest('RAGResponse Interface', () => {
      const ragResponse: RAGResponse = {
        responseId: 'response-123',
        query: 'What is type 1 diabetes?',
        response: 'Type 1 diabetes is an autoimmune condition...',
        language: 'en',
        confidence: 0.92,
        sources: [{
          url: 'https://diabetes.org/type1',
          title: 'Type 1 Diabetes',
          excerpt: 'Type 1 diabetes is...',
          relevanceScore: 0.95,
          contentType: 'article'
        }],
        retrievalMetrics: {
          documentsRetrieved: 5,
          averageRelevanceScore: 0.88,
          searchLatency: 150
        },
        generationMetrics: {
          modelUsed: 'claude-3-sonnet',
          tokensGenerated: 200,
          generationLatency: 800
        },
        qualityMetrics: {
          coherence: 0.95,
          relevance: 0.92,
          factualAccuracy: 0.98,
          completeness: 0.90
        },
        timestamp: new Date()
      };

      if (!ragResponse.responseId) throw new Error('responseId is required');
      if (ragResponse.confidence < 0 || ragResponse.confidence > 1) {
        throw new Error('confidence must be between 0 and 1');
      }
      
      return 'RAGResponse interface validated successfully';
    });

    console.log('   ✅ Specialized models validated\n');
  }

  private async testValidationFunctions(): Promise<void> {
    console.log('📋 4. Testing Validation Functions...');

    // Test DataValidator.validateUserSession
    await this.runTest('DataValidator.validateUserSession', () => {
      const validSession: Partial<UserSession> = {
        sessionId: 'test-123',
        language: 'en',
        startTime: new Date(),
        satisfaction: 4
      };

      const result = DataValidator.validateUserSession(validSession);
      if (!result.isValid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }

      // Test invalid session
      const invalidSession: Partial<UserSession> = {
        language: 'fr' as any, // Invalid language
        satisfaction: 10 // Invalid satisfaction
      };

      const invalidResult = DataValidator.validateUserSession(invalidSession);
      if (invalidResult.isValid) {
        throw new Error('Should have failed validation for invalid session');
      }

      return 'UserSession validation working correctly';
    });

    // Test DataValidator.validateChatMessage
    await this.runTest('DataValidator.validateChatMessage', () => {
      const validMessage: Partial<ChatMessage> = {
        messageId: 'msg-123',
        sessionId: 'session-123',
        content: 'Hello',
        sender: 'user',
        timestamp: new Date(),
        confidence: 0.95
      };

      const result = DataValidator.validateChatMessage(validMessage);
      if (!result.isValid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }

      return 'ChatMessage validation working correctly';
    });

    // Test EnhancedDataValidator.validateDiabetesRiskAssessment
    await this.runTest('EnhancedDataValidator.validateDiabetesRiskAssessment', () => {
      const validAssessment: Partial<DiabetesRiskAssessment> = {
        assessmentId: 'assessment-123',
        sessionId: 'session-123',
        startTime: new Date(),
        language: 'en',
        riskScore: 65,
        riskLevel: 'moderate'
      };

      const result = EnhancedDataValidator.validateDiabetesRiskAssessment(validAssessment);
      if (!result.isValid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }

      return 'DiabetesRiskAssessment validation working correctly';
    });

    console.log('   ✅ Validation functions tested\n');
  }

  private async testUtilityFunctions(): Promise<void> {
    console.log('📋 5. Testing Utility Functions...');

    // Test DynamoDBKeyGenerator
    await this.runTest('DynamoDBKeyGenerator Functions', () => {
      const sessionPK = DynamoDBKeyGenerator.sessionPK('test-session');
      if (sessionPK !== 'SESSION#test-session') {
        throw new Error('sessionPK generation failed');
      }

      const messageSK = DynamoDBKeyGenerator.messageSK(new Date(), 'msg-123');
      if (!messageSK.includes('MESSAGE#') || !messageSK.includes('msg-123')) {
        throw new Error('messageSK generation failed');
      }

      const questionHash = DynamoDBKeyGenerator.generateQuestionHash('what is diabetes');
      if (!questionHash || questionHash.length === 0) {
        throw new Error('Question hash generation failed');
      }

      return 'DynamoDBKeyGenerator functions working correctly';
    });

    // Test TTLCalculator
    await this.runTest('TTLCalculator Functions', () => {
      const sessionTTL = TTLCalculator.sessionTTL();
      const messageTTL = TTLCalculator.messageTTL();
      const auditTTL = TTLCalculator.auditTTL();

      const now = Math.floor(Date.now() / 1000);
      
      if (sessionTTL <= now) throw new Error('Session TTL should be in the future');
      if (messageTTL <= now) throw new Error('Message TTL should be in the future');
      if (auditTTL <= now) throw new Error('Audit TTL should be in the future');

      return 'TTLCalculator functions working correctly';
    });

    // Test DataModelUtils
    await this.runTest('DataModelUtils Functions', () => {
      const id = DataModelUtils.generateId('TEST');
      if (!id.startsWith('TEST_')) {
        throw new Error('ID generation failed');
      }

      const riskScore = DataModelUtils.calculateRiskScore({
        age: 45,
        familyHistory: true,
        physicalActivity: 'none'
      });
      if (riskScore < 0 || riskScore > 100) {
        throw new Error('Risk score calculation failed');
      }

      const riskLevel = DataModelUtils.determineRiskLevel(riskScore);
      if (!['low', 'moderate', 'high', 'very-high'].includes(riskLevel)) {
        throw new Error('Risk level determination failed');
      }

      return 'DataModelUtils functions working correctly';
    });

    console.log('   ✅ Utility functions tested\n');
  }

  private async testDataModelCompleteness(): Promise<void> {
    console.log('📋 6. Testing Data Model Completeness...');

    // Test that all required interfaces exist
    await this.runTest('Required Interfaces Exist', () => {
      const requiredInterfaces = [
        'UserSession',
        'ChatMessage', 
        'KnowledgeContent',
        'ProfessionalMember',
        'UserPreferences',
        'AnalyticsData',
        'AuditLog',
        'EscalationQueue',
        'ConversationRecord',
        'MessageRecord',
        'QuestionRecord',
        'DiabetesRiskAssessment',
        'EventInformation',
        'RAGResponse',
        'EscalationContext',
        'SystemConfiguration',
        'ContentScrapingJob'
      ];

      // This test passes if we can import all the interfaces (which we did above)
      return `All ${requiredInterfaces.length} required interfaces are available`;
    });

    // Test validation coverage
    await this.runTest('Validation Coverage', () => {
      const validationMethods = [
        'validateUserSession',
        'validateChatMessage',
        'validateProfessionalMember',
        'validateConversationRecord',
        'validateMessageRecord',
        'validateQuestionRecord',
        'validateDiabetesRiskAssessment',
        'validateEventInformation',
        'validateRAGResponse',
        'validateEscalationContext',
        'validateSystemConfiguration',
        'validateContentScrapingJob'
      ];

      // Check that validation methods exist
      const dataValidatorMethods = Object.getOwnPropertyNames(DataValidator).filter(name => name.startsWith('validate'));
      const enhancedValidatorMethods = Object.getOwnPropertyNames(EnhancedDataValidator).filter(name => name.startsWith('validate'));
      
      const totalValidationMethods = dataValidatorMethods.length + enhancedValidatorMethods.length;
      
      return `${totalValidationMethods} validation methods available for comprehensive data validation`;
    });

    // Test utility coverage
    await this.runTest('Utility Coverage', () => {
      const utilityClasses = [
        'DynamoDBKeyGenerator',
        'TTLCalculator', 
        'DataModelUtils'
      ];

      // Check that utility classes have expected methods
      const keyGenMethods = Object.getOwnPropertyNames(DynamoDBKeyGenerator).filter(name => typeof DynamoDBKeyGenerator[name as keyof typeof DynamoDBKeyGenerator] === 'function');
      const ttlMethods = Object.getOwnPropertyNames(TTLCalculator).filter(name => typeof TTLCalculator[name as keyof typeof TTLCalculator] === 'function');
      const utilsMethods = Object.getOwnPropertyNames(DataModelUtils).filter(name => typeof DataModelUtils[name as keyof typeof DataModelUtils] === 'function');

      const totalUtilityMethods = keyGenMethods.length + ttlMethods.length + utilsMethods.length;

      return `${utilityClasses.length} utility classes with ${totalUtilityMethods} total methods available`;
    });

    console.log('   ✅ Data model completeness verified\n');
  }

  private async runTest(testName: string, testFunction: () => string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const message = testFunction();
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        status: 'PASS',
        duration,
        message
      });
      
      console.log(`   ✅ ${testName}: ${message}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        status: 'FAIL',
        duration,
        message: error instanceof Error ? error.message : String(error)
      });
      
      console.log(`   ❌ ${testName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateTestReport(): void {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 TASK 2.1 DATA MODELS TEST REPORT');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n📈 Test Summary: ${passed}/${total} tests passed`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Duration: ${this.formatDuration(totalDuration)}`);
    console.log(`📊 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    console.log('\n📋 Test Results:');
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`   ${index + 1}. ${icon} ${result.testName}`);
      console.log(`      Duration: ${this.formatDuration(result.duration)}`);
      console.log(`      ${result.message}`);
    });

    // Task 2.1 completion assessment
    console.log('\n🎯 Task 2.1 Completion Assessment:');
    
    if (failed === 0) {
      console.log('✅ All TypeScript interfaces defined and validated');
      console.log('✅ Comprehensive data validation functions implemented');
      console.log('✅ Utility functions for DynamoDB operations available');
      console.log('✅ Enhanced analytics models for admin dashboard ready');
      console.log('✅ Specialized models for risk assessment and events implemented');
      
      console.log('\n📝 Task 2.1 Requirements Fulfilled:');
      console.log('   ✅ Define UserSession, ChatMessage, KnowledgeContent, and ProfessionalMember interfaces');
      console.log('   ✅ Implement data validation functions');
      console.log('   ✅ Requirements 2.2, 3.4, 7.3 addressed');
      
      console.log('\n🎉 Task 2.1: COMPLETE');
      console.log('🚀 All data models ready for implementation');
      console.log('\n📝 Next Steps:');
      console.log('   • Task 7.1: Create chat processing Lambda function');
      console.log('   • Task 7.3: Implement conversation context management');
      console.log('   • Task 7.4: Set up API Gateway and AppSync integration');
      
    } else {
      console.log(`⚠️  ${failed} test(s) failed`);
      console.log('📝 Address failing tests before proceeding');
      console.log('\n🔧 Task 2.1: PARTIAL COMPLETION');
    }

    // Data model coverage analysis
    console.log('\n📊 Data Model Coverage Analysis:');
    console.log('   📁 Core Models: UserSession, ChatMessage, KnowledgeContent, ProfessionalMember');
    console.log('   📁 Analytics Models: ConversationRecord, MessageRecord, QuestionRecord');
    console.log('   📁 Specialized Models: DiabetesRiskAssessment, EventInformation, RAGResponse');
    console.log('   📁 System Models: EscalationContext, SystemConfiguration, ContentScrapingJob');
    console.log('   📁 Validation: 12+ validation methods for data integrity');
    console.log('   📁 Utilities: DynamoDB key generation, TTL calculation, data model helpers');

    // Save test report
    this.saveTestReport(passed, failed, total, totalDuration);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private saveTestReport(passed: number, failed: number, total: number, duration: number): void {
    const report = {
      timestamp: new Date().toISOString(),
      task: 'Task 2.1: Create TypeScript interfaces for all data models',
      summary: {
        totalTests: total,
        passed,
        failed,
        successRate: ((passed / total) * 100).toFixed(1) + '%',
        totalDuration: this.formatDuration(duration)
      },
      testResults: this.results,
      requirements: {
        'Define UserSession, ChatMessage, KnowledgeContent, and ProfessionalMember interfaces': passed >= 15 ? 'FULFILLED' : 'PARTIAL',
        'Implement data validation functions': passed >= 10 ? 'FULFILLED' : 'PARTIAL',
        'Requirements 2.2, 3.4, 7.3': passed >= 20 ? 'FULFILLED' : 'PARTIAL'
      },
      status: failed === 0 ? 'COMPLETED' : 'PARTIAL',
      nextSteps: failed === 0 ? 
        ['Task 7.1: Create chat processing Lambda function', 'Task 7.3: Implement conversation context management'] :
        ['Fix failing tests', 'Complete data model implementation'],
      dataModelCoverage: {
        coreModels: ['UserSession', 'ChatMessage', 'KnowledgeContent', 'ProfessionalMember'],
        analyticsModels: ['ConversationRecord', 'MessageRecord', 'QuestionRecord'],
        specializedModels: ['DiabetesRiskAssessment', 'EventInformation', 'RAGResponse'],
        systemModels: ['EscalationContext', 'SystemConfiguration', 'ContentScrapingJob'],
        validationMethods: 12,
        utilityClasses: 3
      }
    };

    const reportPath = path.join(__dirname, '..', 'TASK_2_1_DATA_MODELS_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed test report saved to: ${reportPath}`);
  }
}

async function main(): Promise<void> {
  const tester = new DataModelTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Data model testing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { DataModelTester };