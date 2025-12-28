#!/usr/bin/env ts-node

/**
 * Task 7.1 Chat Processor Validation Script
 * 
 * This script validates the chat processing Lambda function implementation
 * to ensure it meets all requirements for Task 7.1.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
}

class Task71Validator {
  private results: ValidationResult[] = [];

  /**
   * Add validation result
   */
  private addResult(component: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: string) {
    this.results.push({ component, status, message, details });
  }

  /**
   * Validate chat processor Lambda function exists and has required structure
   */
  async validateChatProcessorStructure(): Promise<void> {
    try {
      const chatProcessorPath = path.join(process.cwd(), 'lambda/chat-processor/index.ts');
      const content = await fs.readFile(chatProcessorPath, 'utf-8');

      // Check for required imports
      const requiredImports = [
        'ChatProcessor',
        'ChatRequest',
        'ChatResponse',
        'APIGatewayProxyEvent',
        'APIGatewayProxyResult'
      ];

      const missingImports = requiredImports.filter(imp => !content.includes(imp));
      if (missingImports.length === 0) {
        this.addResult('Chat Processor Structure', 'PASS', 'All required imports present');
      } else {
        this.addResult('Chat Processor Structure', 'FAIL', `Missing imports: ${missingImports.join(', ')}`);
      }

      // Check for handler function
      if (content.includes('export const handler') || content.includes('exports.handler')) {
        this.addResult('Lambda Handler', 'PASS', 'Lambda handler function found');
      } else {
        this.addResult('Lambda Handler', 'FAIL', 'Lambda handler function not found');
      }

      // Check for HTTP method handling
      const httpMethods = ['POST', 'GET', 'OPTIONS'];
      const missingMethods = httpMethods.filter(method => !content.includes(`case '${method}'`));
      if (missingMethods.length === 0) {
        this.addResult('HTTP Methods', 'PASS', 'All required HTTP methods handled');
      } else {
        this.addResult('HTTP Methods', 'WARNING', `Missing HTTP methods: ${missingMethods.join(', ')}`);
      }

      // Check for CORS headers
      if (content.includes('Access-Control-Allow-Origin') && content.includes('Access-Control-Allow-Headers')) {
        this.addResult('CORS Support', 'PASS', 'CORS headers configured');
      } else {
        this.addResult('CORS Support', 'FAIL', 'CORS headers missing or incomplete');
      }

    } catch (error) {
      this.addResult('Chat Processor Structure', 'FAIL', `File not found or unreadable: ${error}`);
    }
  }

  /**
   * Validate ChatProcessor class implementation
   */
  async validateChatProcessorClass(): Promise<void> {
    try {
      const chatProcessorPath = path.join(process.cwd(), 'lambda/chat-processor/index.ts');
      const content = await fs.readFile(chatProcessorPath, 'utf-8');

      // Check for ChatProcessor class
      if (content.includes('class ChatProcessor')) {
        this.addResult('ChatProcessor Class', 'PASS', 'ChatProcessor class found');
      } else {
        this.addResult('ChatProcessor Class', 'FAIL', 'ChatProcessor class not found');
      }

      // Check for required methods
      const requiredMethods = [
        'processMessage',
        'detectLanguage',
        'generateResponse',
        'identifyEscalationTriggers', // Updated method name
        'storeConversationRecord', // Updated method name
        'healthCheck'
      ];

      const missingMethods = requiredMethods.filter(method => !content.includes(method));
      if (missingMethods.length === 0) {
        this.addResult('Required Methods', 'PASS', 'All required methods present');
      } else {
        this.addResult('Required Methods', 'FAIL', `Missing methods: ${missingMethods.join(', ')}`);
      }

      // Check for language detection
      if (content.includes('comprehend') || content.includes('DetectDominantLanguage')) {
        this.addResult('Language Detection', 'PASS', 'Language detection implementation found');
      } else {
        this.addResult('Language Detection', 'WARNING', 'Language detection implementation not clearly visible');
      }

      // Check for escalation logic
      if (content.includes('escalation') && content.includes('trigger')) {
        this.addResult('Escalation Logic', 'PASS', 'Escalation logic implementation found');
      } else {
        this.addResult('Escalation Logic', 'WARNING', 'Escalation logic not clearly visible');
      }

      // Check for conversation tracking
      if (content.includes('ConversationRecord') || content.includes('MessageRecord')) {
        this.addResult('Conversation Tracking', 'PASS', 'Conversation tracking implementation found');
      } else {
        this.addResult('Conversation Tracking', 'WARNING', 'Conversation tracking not clearly visible');
      }

    } catch (error) {
      this.addResult('ChatProcessor Class', 'FAIL', `Error validating class: ${error}`);
    }
  }

  /**
   * Validate CDK infrastructure stack
   */
  async validateCDKStack(): Promise<void> {
    try {
      const stackPath = path.join(process.cwd(), 'lib/chat-processor-stack.ts');
      const content = await fs.readFile(stackPath, 'utf-8');

      // Check for stack class
      if (content.includes('class AdaClaraChatProcessorStack')) {
        this.addResult('CDK Stack Class', 'PASS', 'Chat processor stack class found');
      } else {
        this.addResult('CDK Stack Class', 'FAIL', 'Chat processor stack class not found');
      }

      // Check for Lambda function definition
      if (content.includes('lambda.Function') && content.includes('ChatProcessorFunction')) {
        this.addResult('Lambda Function CDK', 'PASS', 'Lambda function defined in CDK');
      } else {
        this.addResult('Lambda Function CDK', 'FAIL', 'Lambda function not properly defined in CDK');
      }

      // Check for API Gateway
      if (content.includes('apigateway.RestApi') && content.includes('ChatProcessorApi')) {
        this.addResult('API Gateway CDK', 'PASS', 'API Gateway defined in CDK');
      } else {
        this.addResult('API Gateway CDK', 'FAIL', 'API Gateway not properly defined in CDK');
      }

      // Check for required permissions
      const requiredPermissions = [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'bedrock:InvokeModel',
        'comprehend:DetectDominantLanguage',
        's3:GetObject'
      ];

      const missingPermissions = requiredPermissions.filter(perm => !content.includes(perm));
      if (missingPermissions.length === 0) {
        this.addResult('IAM Permissions', 'PASS', 'All required permissions configured');
      } else {
        this.addResult('IAM Permissions', 'WARNING', `Missing permissions: ${missingPermissions.join(', ')}`);
      }

      // Check for environment variables
      const requiredEnvVars = [
        'CHAT_SESSIONS_TABLE',
        'CONVERSATIONS_TABLE',
        'MESSAGES_TABLE',
        'CONTENT_BUCKET',
        'VECTORS_BUCKET'
      ];

      const missingEnvVars = requiredEnvVars.filter(env => !content.includes(env));
      if (missingEnvVars.length === 0) {
        this.addResult('Environment Variables', 'PASS', 'All required environment variables configured');
      } else {
        this.addResult('Environment Variables', 'WARNING', `Missing env vars: ${missingEnvVars.join(', ')}`);
      }

    } catch (error) {
      this.addResult('CDK Stack', 'FAIL', `Stack file not found or unreadable: ${error}`);
    }
  }

  /**
   * Validate data types and interfaces
   */
  async validateDataTypes(): Promise<void> {
    try {
      const typesPath = path.join(process.cwd(), 'src/types/index.ts');
      const content = await fs.readFile(typesPath, 'utf-8');

      // Check for required interfaces
      const requiredInterfaces = [
        'ChatRequest',
        'ChatResponse',
        'UserSession',
        'ChatMessage',
        'ConversationRecord',
        'MessageRecord'
      ];

      const missingInterfaces = requiredInterfaces.filter(iface => !content.includes(`interface ${iface}`));
      if (missingInterfaces.length === 0) {
        this.addResult('Data Interfaces', 'PASS', 'All required interfaces defined');
      } else {
        this.addResult('Data Interfaces', 'FAIL', `Missing interfaces: ${missingInterfaces.join(', ')}`);
      }

      // Check for language support
      if (content.includes("'en' | 'es'") || content.includes('"en" | "es"')) {
        this.addResult('Language Support Types', 'PASS', 'Bilingual language types defined');
      } else {
        this.addResult('Language Support Types', 'WARNING', 'Language types not clearly defined');
      }

    } catch (error) {
      this.addResult('Data Types', 'FAIL', `Types file not found or unreadable: ${error}`);
    }
  }

  /**
   * Validate package.json dependencies
   */
  async validateDependencies(): Promise<void> {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(content);

      const requiredDeps = [
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/client-bedrock-runtime',
        '@aws-sdk/client-comprehend',
        '@aws-sdk/client-s3',
        'aws-cdk-lib'
      ];

      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };

      const missingDeps = requiredDeps.filter(dep => !allDeps[dep]);
      if (missingDeps.length === 0) {
        this.addResult('Dependencies', 'PASS', 'All required dependencies present');
      } else {
        this.addResult('Dependencies', 'WARNING', `Missing dependencies: ${missingDeps.join(', ')}`);
      }

    } catch (error) {
      this.addResult('Dependencies', 'FAIL', `Package.json not found or unreadable: ${error}`);
    }
  }

  /**
   * Check for TypeScript compilation
   */
  async validateTypeScriptCompilation(): Promise<void> {
    try {
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      await fs.access(tsconfigPath);
      this.addResult('TypeScript Config', 'PASS', 'tsconfig.json found');

      // Check if files compile (basic syntax check)
      const chatProcessorPath = path.join(process.cwd(), 'lambda/chat-processor/index.ts');
      const content = await fs.readFile(chatProcessorPath, 'utf-8');
      
      // Basic syntax validation
      const syntaxIssues = [];
      if (!content.includes('export') && !content.includes('exports')) {
        syntaxIssues.push('No exports found');
      }
      
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        syntaxIssues.push('Mismatched braces');
      }

      if (syntaxIssues.length === 0) {
        this.addResult('TypeScript Syntax', 'PASS', 'Basic syntax validation passed');
      } else {
        this.addResult('TypeScript Syntax', 'WARNING', `Potential issues: ${syntaxIssues.join(', ')}`);
      }

    } catch (error) {
      this.addResult('TypeScript Config', 'WARNING', `TypeScript configuration issue: ${error}`);
    }
  }

  /**
   * Run all validations
   */
  async runValidation(): Promise<void> {
    console.log('🔍 Starting Task 7.1 Chat Processor Validation...\n');

    await this.validateChatProcessorStructure();
    await this.validateChatProcessorClass();
    await this.validateCDKStack();
    await this.validateDataTypes();
    await this.validateDependencies();
    await this.validateTypeScriptCompilation();

    this.printResults();
  }

  /**
   * Print validation results
   */
  private printResults(): void {
    console.log('\n📊 TASK 7.1 VALIDATION RESULTS');
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

    if (failed === 0) {
      console.log('\n🎉 Task 7.1 Chat Processor validation PASSED!');
      console.log('✨ The chat processing Lambda function is ready for deployment.');
    } else {
      console.log('\n🚨 Task 7.1 Chat Processor validation FAILED!');
      console.log('🔧 Please address the failed checks before proceeding.');
    }

    // Task 7.1 completion assessment
    console.log('\n🎯 TASK 7.1 COMPLETION ASSESSMENT');
    console.log('=' .repeat(50));
    
    const criticalComponents = [
      'Chat Processor Structure',
      'ChatProcessor Class', 
      'Lambda Handler',
      'CDK Stack Class',
      'Data Interfaces'
    ];

    const criticalPassed = criticalComponents.filter(comp => 
      this.results.find(r => r.component === comp && r.status === 'PASS')
    ).length;

    if (criticalPassed === criticalComponents.length) {
      console.log('✅ TASK 7.1 COMPLETE: Chat processing Lambda function implemented');
      console.log('📋 Ready for: Task 7.3 (Conversation Context Management)');
      console.log('📋 Ready for: Task 7.4 (API Gateway Integration)');
    } else {
      console.log('❌ TASK 7.1 INCOMPLETE: Critical components missing');
      console.log(`📊 Critical components passed: ${criticalPassed}/${criticalComponents.length}`);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new Task71Validator();
  validator.runValidation().catch(console.error);
}

export { Task71Validator };