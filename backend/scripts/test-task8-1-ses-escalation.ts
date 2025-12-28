#!/usr/bin/env ts-node

/**
 * Task 8.1 SES Email Escalation Implementation and Validation
 * 
 * This script implements and validates SES email escalation integration
 * for handling chat escalations to human agents.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
}

class Task81Validator {
  private results: ValidationResult[] = [];

  /**
   * Add validation result
   */
  private addResult(component: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: string) {
    this.results.push({ component, status, message, details });
  }

  /**
   * Validate SES escalation Lambda function exists
   */
  async validateSESLambdaFunction(): Promise<void> {
    try {
      const lambdaPath = path.join(process.cwd(), 'lambda/ses-escalation/index.ts');
      
      try {
        const content = await fs.readFile(lambdaPath, 'utf-8');
        
        // Check for SES client import
        if (content.includes('@aws-sdk/client-ses') || content.includes('SESClient')) {
          this.addResult('SES Client Import', 'PASS', 'SES client properly imported');
        } else {
          this.addResult('SES Client Import', 'FAIL', 'SES client not imported');
        }

        // Check for escalation handler
        if (content.includes('handler') && content.includes('export')) {
          this.addResult('Lambda Handler', 'PASS', 'Lambda handler function found');
        } else {
          this.addResult('Lambda Handler', 'FAIL', 'Lambda handler function not found');
        }

        // Check for email sending functionality
        if (content.includes('sendEmail') || content.includes('SendEmailCommand')) {
          this.addResult('Email Sending', 'PASS', 'Email sending functionality found');
        } else {
          this.addResult('Email Sending', 'FAIL', 'Email sending functionality not implemented');
        }

        // Check for escalation trigger logic
        if (content.includes('escalation') && content.includes('trigger')) {
          this.addResult('Escalation Logic', 'PASS', 'Escalation trigger logic found');
        } else {
          this.addResult('Escalation Logic', 'FAIL', 'Escalation trigger logic not implemented');
        }

      } catch (fileError) {
        this.addResult('SES Lambda File', 'FAIL', 'SES escalation Lambda file not found - needs to be created');
      }

    } catch (error) {
      this.addResult('SES Lambda Function', 'FAIL', `Error validating SES Lambda: ${error}`);
    }
  }

  /**
   * Validate escalation service exists
   */
  async validateEscalationService(): Promise<void> {
    try {
      const servicePath = path.join(process.cwd(), 'src/services/escalation-service.ts');
      
      try {
        const content = await fs.readFile(servicePath, 'utf-8');
        
        // Check for EscalationService class
        if (content.includes('class EscalationService') || content.includes('export class EscalationService')) {
          this.addResult('Escalation Service Class', 'PASS', 'EscalationService class found');
        } else {
          this.addResult('Escalation Service Class', 'FAIL', 'EscalationService class not found');
        }

        // Check for required methods
        const requiredMethods = [
          'createEscalation',
          'sendEscalationEmail',
          'getEscalationTemplate',
          'trackEscalationStatus',
          'handleEscalationCallback'
        ];

        const missingMethods = requiredMethods.filter(method => !content.includes(method));
        if (missingMethods.length === 0) {
          this.addResult('Escalation Service Methods', 'PASS', 'All required methods present');
        } else {
          this.addResult('Escalation Service Methods', 'FAIL', `Missing methods: ${missingMethods.join(', ')}`);
        }

      } catch (fileError) {
        this.addResult('Escalation Service File', 'FAIL', 'Escalation service file not found - needs to be created');
      }

    } catch (error) {
      this.addResult('Escalation Service', 'FAIL', `Error validating escalation service: ${error}`);
    }
  }

  /**
   * Validate SES CDK stack configuration
   */
  async validateSESCDKStack(): Promise<void> {
    try {
      const stackPath = path.join(process.cwd(), 'lib/ses-escalation-stack.ts');
      
      try {
        const content = await fs.readFile(stackPath, 'utf-8');
        
        // Check for SES configuration
        if (content.includes('ses') || content.includes('SES')) {
          this.addResult('SES CDK Configuration', 'PASS', 'SES configuration found in CDK');
        } else {
          this.addResult('SES CDK Configuration', 'FAIL', 'SES configuration not found in CDK');
        }

        // Check for Lambda function definition
        if (content.includes('lambda.Function') && (content.includes('EscalationFunction') || content.includes('escalationLambda'))) {
          this.addResult('Escalation Lambda CDK', 'PASS', 'Escalation Lambda defined in CDK');
        } else {
          this.addResult('Escalation Lambda CDK', 'FAIL', 'Escalation Lambda not defined in CDK');
        }

        // Check for IAM permissions
        if (content.includes('ses:SendEmail') || content.includes('ses:SendRawEmail')) {
          this.addResult('SES Permissions', 'PASS', 'SES permissions configured');
        } else {
          this.addResult('SES Permissions', 'FAIL', 'SES permissions not configured');
        }

      } catch (fileError) {
        this.addResult('SES CDK Stack File', 'FAIL', 'SES CDK stack file not found - needs to be created');
      }

    } catch (error) {
      this.addResult('SES CDK Stack', 'FAIL', `Error validating SES CDK stack: ${error}`);
    }
  }

  /**
   * Validate escalation data models
   */
  async validateEscalationDataModels(): Promise<void> {
    try {
      const typesPath = path.join(process.cwd(), 'src/types/index.ts');
      const content = await fs.readFile(typesPath, 'utf-8');

      // Check for escalation interfaces
      const requiredInterfaces = [
        'EscalationRequest',
        'EscalationResponse',
        'EscalationStatus',
        'EmailTemplate'
      ];

      const existingInterfaces = requiredInterfaces.filter(iface => 
        content.includes(`interface ${iface}`) || content.includes(`export interface ${iface}`)
      );

      if (existingInterfaces.length === requiredInterfaces.length) {
        this.addResult('Escalation Interfaces', 'PASS', 'All escalation interfaces defined');
      } else {
        const missing = requiredInterfaces.filter(iface => !existingInterfaces.includes(iface));
        this.addResult('Escalation Interfaces', 'FAIL', `Missing interfaces: ${missing.join(', ')}`);
      }

    } catch (error) {
      this.addResult('Escalation Data Models', 'FAIL', `Types file not accessible: ${error}`);
    }
  }

  /**
   * Validate chat processor escalation integration
   */
  async validateChatProcessorIntegration(): Promise<void> {
    try {
      const chatProcessorPath = path.join(process.cwd(), 'lambda/chat-processor/index.ts');
      const content = await fs.readFile(chatProcessorPath, 'utf-8');

      // Check for escalation service integration
      if (content.includes('EscalationService') || content.includes('escalation-service')) {
        this.addResult('Escalation Service Integration', 'PASS', 'Escalation service integrated in chat processor');
      } else {
        this.addResult('Escalation Service Integration', 'FAIL', 'Escalation service not integrated in chat processor');
      }

      // Check for escalation trigger handling
      if (content.includes('createEscalation') || content.includes('sendEscalationEmail')) {
        this.addResult('Escalation Trigger Handling', 'PASS', 'Escalation trigger handling found');
      } else {
        this.addResult('Escalation Trigger Handling', 'FAIL', 'Escalation trigger handling not implemented');
      }

    } catch (error) {
      this.addResult('Chat Processor Integration', 'FAIL', `Error checking integration: ${error}`);
    }
  }

  /**
   * Validate email templates
   */
  async validateEmailTemplates(): Promise<void> {
    try {
      // Check for email templates directory or configuration
      const templatesPath = path.join(process.cwd(), 'templates');
      
      try {
        await fs.access(templatesPath);
        this.addResult('Email Templates Directory', 'PASS', 'Email templates directory found');
        
        // Check for specific template files
        const templateFiles = ['escalation-email.html', 'escalation-email.txt'];
        const existingTemplates = [];
        
        for (const template of templateFiles) {
          try {
            await fs.access(path.join(templatesPath, template));
            existingTemplates.push(template);
          } catch {
            // Template doesn't exist
          }
        }
        
        if (existingTemplates.length > 0) {
          this.addResult('Email Template Files', 'PASS', `Found templates: ${existingTemplates.join(', ')}`);
        } else {
          this.addResult('Email Template Files', 'WARNING', 'No email template files found');
        }
        
      } catch {
        this.addResult('Email Templates Directory', 'WARNING', 'Email templates directory not found - templates may be inline');
      }

    } catch (error) {
      this.addResult('Email Templates', 'WARNING', `Error checking templates: ${error}`);
    }
  }

  /**
   * Run all validations
   */
  async runValidation(): Promise<void> {
    console.log('🔍 Starting Task 8.1 SES Email Escalation Validation...\n');

    await this.validateSESLambdaFunction();
    await this.validateEscalationService();
    await this.validateSESCDKStack();
    await this.validateEscalationDataModels();
    await this.validateChatProcessorIntegration();
    await this.validateEmailTemplates();

    this.printResults();
  }

  /**
   * Print validation results
   */
  private printResults(): void {
    console.log('\n📊 TASK 8.1 VALIDATION RESULTS');
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

    // Task 8.1 completion assessment
    console.log('\n🎯 TASK 8.1 COMPLETION ASSESSMENT');
    console.log('=' .repeat(50));
    
    const criticalComponents = [
      'SES Client Import',
      'Lambda Handler',
      'Email Sending',
      'Escalation Service Class',
      'Escalation Service Methods'
    ];

    const criticalPassed = criticalComponents.filter(comp => 
      this.results.find(r => r.component === comp && r.status === 'PASS')
    ).length;

    if (criticalPassed === criticalComponents.length) {
      console.log('✅ TASK 8.1 COMPLETE: SES email escalation implemented');
      console.log('📋 Ready for: Task 8.2 (Property Test for Escalation)');
      console.log('📋 Ready for: Task 8.3 (Escalation Workflow)');
    } else {
      console.log('❌ TASK 8.1 INCOMPLETE: Critical components missing');
      console.log(`📊 Critical components passed: ${criticalPassed}/${criticalComponents.length}`);
      
      if (failed > 0) {
        console.log('\n🔧 IMPLEMENTATION NEEDED:');
        console.log('1. Create SES escalation Lambda function');
        console.log('2. Implement EscalationService class');
        console.log('3. Create SES CDK stack configuration');
        console.log('4. Add escalation data models');
        console.log('5. Integrate with chat processor');
      }
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new Task81Validator();
  validator.runValidation().catch(console.error);
}

export { Task81Validator };