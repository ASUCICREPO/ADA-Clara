#!/usr/bin/env ts-node

/**
 * Task 7.3 Conversation Context Management Implementation and Validation
 * 
 * This script implements and validates conversation context management
 * for maintaining session state across chat interactions.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
}

class Task73Validator {
  private results: ValidationResult[] = [];

  /**
   * Add validation result
   */
  private addResult(component: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: string) {
    this.results.push({ component, status, message, details });
  }

  /**
   * Validate conversation context interfaces exist
   */
  async validateContextInterfaces(): Promise<void> {
    try {
      const typesPath = path.join(process.cwd(), 'src/types/index.ts');
      const content = await fs.readFile(typesPath, 'utf-8');

      // Check for conversation context interfaces
      const requiredInterfaces = [
        'ConversationContext',
        'SessionState',
        'ConversationMemory',
        'UserPreferences'
      ];

      const existingInterfaces = requiredInterfaces.filter(iface => 
        content.includes(`interface ${iface}`) || content.includes(`export interface ${iface}`)
      );

      if (existingInterfaces.length === requiredInterfaces.length) {
        this.addResult('Context Interfaces', 'PASS', 'All conversation context interfaces defined');
      } else {
        const missing = requiredInterfaces.filter(iface => !existingInterfaces.includes(iface));
        this.addResult('Context Interfaces', 'FAIL', `Missing interfaces: ${missing.join(', ')}`);
      }

    } catch (error) {
      this.addResult('Context Interfaces', 'FAIL', `Types file not accessible: ${error}`);
    }
  }

  /**
   * Validate context management service exists
   */
  async validateContextService(): Promise<void> {
    try {
      const servicePath = path.join(process.cwd(), 'src/services/context-service.ts');
      
      try {
        const content = await fs.readFile(servicePath, 'utf-8');
        
        // Check for ContextService class
        if (content.includes('class ContextService') || content.includes('export class ContextService')) {
          this.addResult('Context Service Class', 'PASS', 'ContextService class found');
        } else {
          this.addResult('Context Service Class', 'FAIL', 'ContextService class not found');
        }

        // Check for required methods
        const requiredMethods = [
          'getConversationContext',
          'updateConversationContext',
          'getSessionState',
          'updateSessionState',
          'getConversationMemory',
          'addToMemory',
          'getUserPreferences',
          'updateUserPreferences'
        ];

        const missingMethods = requiredMethods.filter(method => !content.includes(method));
        if (missingMethods.length === 0) {
          this.addResult('Context Service Methods', 'PASS', 'All required methods present');
        } else {
          this.addResult('Context Service Methods', 'FAIL', `Missing methods: ${missingMethods.join(', ')}`);
        }

      } catch (fileError) {
        this.addResult('Context Service File', 'FAIL', 'Context service file not found - needs to be created');
      }

    } catch (error) {
      this.addResult('Context Service', 'FAIL', `Error validating context service: ${error}`);
    }
  }

  /**
   * Validate chat processor integration with context management
   */
  async validateChatProcessorIntegration(): Promise<void> {
    try {
      const chatProcessorPath = path.join(process.cwd(), 'lambda/chat-processor/index.ts');
      const content = await fs.readFile(chatProcessorPath, 'utf-8');

      // Check for context service integration
      if (content.includes('ContextService') || content.includes('context-service')) {
        this.addResult('Context Integration', 'PASS', 'Context service integrated in chat processor');
      } else {
        this.addResult('Context Integration', 'FAIL', 'Context service not integrated in chat processor');
      }

      // Check for conversation memory usage
      if (content.includes('conversationMemory') || content.includes('getConversationContext')) {
        this.addResult('Memory Usage', 'PASS', 'Conversation memory usage found');
      } else {
        this.addResult('Memory Usage', 'FAIL', 'Conversation memory not being used');
      }

      // Check for session state management
      if (content.includes('sessionState') || content.includes('getSessionState')) {
        this.addResult('Session State', 'PASS', 'Session state management found');
      } else {
        this.addResult('Session State', 'FAIL', 'Session state management not implemented');
      }

    } catch (error) {
      this.addResult('Chat Processor Integration', 'FAIL', `Error checking integration: ${error}`);
    }
  }

  /**
   * Validate DynamoDB schema for context storage
   */
  async validateDynamoDBSchema(): Promise<void> {
    try {
      const dynamoStackPath = path.join(process.cwd(), 'lib/dynamodb-stack.ts');
      const content = await fs.readFile(dynamoStackPath, 'utf-8');

      // Check for context-related tables
      const contextTables = [
        'USER_PREFERENCES_TABLE',
        'CHAT_SESSIONS_TABLE'
      ];

      const missingTables = contextTables.filter(table => !content.includes(table));
      if (missingTables.length === 0) {
        this.addResult('Context Tables', 'PASS', 'All context storage tables configured');
      } else {
        this.addResult('Context Tables', 'WARNING', `Missing table references: ${missingTables.join(', ')}`);
      }

      // Check for TTL configuration
      if (content.includes('timeToLiveAttribute') || content.includes('ttl')) {
        this.addResult('TTL Configuration', 'PASS', 'TTL configured for session cleanup');
      } else {
        this.addResult('TTL Configuration', 'WARNING', 'TTL not configured for automatic cleanup');
      }

    } catch (error) {
      this.addResult('DynamoDB Schema', 'WARNING', `DynamoDB stack not accessible: ${error}`);
    }
  }

  /**
   * Run all validations
   */
  async runValidation(): Promise<void> {
    console.log('🔍 Starting Task 7.3 Conversation Context Management Validation...\n');

    await this.validateContextInterfaces();
    await this.validateContextService();
    await this.validateChatProcessorIntegration();
    await this.validateDynamoDBSchema();

    this.printResults();
  }

  /**
   * Print validation results
   */
  private printResults(): void {
    console.log('\n📊 TASK 7.3 VALIDATION RESULTS');
    console.log('=' .repeat(50));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${result.component}: ${result.message}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
    });

    console.log('\n📈 SUMMARY');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`📊 Total: ${this.results.length}`);

    const successRate = ((passed / this.results.length) * 100).toFixed(1);
    console.log(`🎯 Success Rate: ${successRate}%`);

    // Task 7.3 completion assessment
    console.log('\n🎯 TASK 7.3 COMPLETION ASSESSMENT');
    console.log('=' .repeat(50));
    
    const criticalComponents = [
      'Context Interfaces',
      'Context Service Class',
      'Context Service Methods',
      'Context Integration'
    ];

    const criticalPassed = criticalComponents.filter(comp => 
      this.results.find(r => r.component === comp && r.status === 'PASS')
    ).length;

    if (criticalPassed === criticalComponents.length) {
      console.log('✅ TASK 7.3 COMPLETE: Conversation context management implemented');
      console.log('📋 Ready for: Task 7.4 (API Gateway Integration)');
      console.log('📋 Ready for: Task 8.1 (SES Email Escalation)');
    } else {
      console.log('❌ TASK 7.3 INCOMPLETE: Critical components missing');
      console.log(`📊 Critical components passed: ${criticalPassed}/${criticalComponents.length}`);
      
      if (failed > 0) {
        console.log('\n🔧 IMPLEMENTATION NEEDED:');
        console.log('1. Create conversation context interfaces');
        console.log('2. Implement ContextService class');
        console.log('3. Integrate context management in chat processor');
        console.log('4. Configure DynamoDB for context storage');
      }
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new Task73Validator();
  validator.runValidation().catch(console.error);
}

export { Task73Validator };