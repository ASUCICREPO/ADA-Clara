#!/usr/bin/env node

/**
 * Simple Test script for Task 12: CDK Stack Updates
 * Validates CDK infrastructure configuration without full instantiation
 */

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

class SimpleCDKValidator {
  private results: TestResult[] = [];

  private addResult(test: string, status: 'PASS' | 'FAIL', details?: string): void {
    this.results.push({ test, status, details });
    const emoji = status === 'PASS' ? '✅' : '❌';
    console.log(`${emoji} ${test}${details ? `: ${details}` : ''}`);
  }

  async validateDynamoDBStackCode(): Promise<void> {
    console.log('\n🧪 Testing DynamoDB Stack Code...');

    try {
      // Import and check the stack class
      const { AdaClaraDynamoDBStack } = await import('../lib/dynamodb-stack');
      
      // Test 1: Verify stack class exists
      if (AdaClaraDynamoDBStack) {
        this.addResult('DynamoDB stack class exists', 'PASS');
      } else {
        this.addResult('DynamoDB stack class exists', 'FAIL', 'Class not found');
      }

      // Test 2: Check if the class has the expected properties (by checking prototype)
      const stackPrototype = AdaClaraDynamoDBStack.prototype as any;
      const expectedMethods = ['grantFullAccess', 'grantReadAccess', 'createLambdaAccessPolicy'];
      
      for (const method of expectedMethods) {
        if (typeof stackPrototype[method] === 'function') {
          this.addResult(`DynamoDB stack method ${method} exists`, 'PASS');
        } else {
          this.addResult(`DynamoDB stack method ${method} exists`, 'FAIL', 'Method not found');
        }
      }

    } catch (error) {
      this.addResult('DynamoDB stack code validation', 'FAIL', `Error: ${error}`);
    }
  }

  async validateAdminAnalyticsStackCode(): Promise<void> {
    console.log('\n🧪 Testing Admin Analytics Stack Code...');

    try {
      // Import and check the stack class
      const { AdminAnalyticsStack } = await import('../lib/admin-analytics-stack');
      
      // Test 1: Verify stack class exists
      if (AdminAnalyticsStack) {
        this.addResult('Admin Analytics stack class exists', 'PASS');
      } else {
        this.addResult('Admin Analytics stack class exists', 'FAIL', 'Class not found');
      }

      // Test 2: Check if the class has the expected methods
      const stackPrototype = AdminAnalyticsStack.prototype as any;
      const expectedMethods = ['grantInvokeAdmin', 'getApiUrl', 'getLambdaFunction'];
      
      for (const method of expectedMethods) {
        if (typeof stackPrototype[method] === 'function') {
          this.addResult(`Admin Analytics method ${method} exists`, 'PASS');
        } else {
          this.addResult(`Admin Analytics method ${method} exists`, 'FAIL', 'Method not found');
        }
      }

    } catch (error) {
      this.addResult('Admin Analytics stack code validation', 'FAIL', `Error: ${error}`);
    }
  }

  async validateChatProcessorStackCode(): Promise<void> {
    console.log('\n🧪 Testing Chat Processor Stack Code...');

    try {
      // Import and check the stack class
      const { AdaClaraChatProcessorStack } = await import('../lib/chat-processor-stack');
      
      // Test 1: Verify stack class exists
      if (AdaClaraChatProcessorStack) {
        this.addResult('Chat Processor stack class exists', 'PASS');
      } else {
        this.addResult('Chat Processor stack class exists', 'FAIL', 'Class not found');
      }

    } catch (error) {
      this.addResult('Chat Processor stack code validation', 'FAIL', `Error: ${error}`);
    }
  }

  async validateEnvironmentVariables(): Promise<void> {
    console.log('\n🧪 Testing Environment Variable Configuration...');

    try {
      // Read the admin analytics stack file and check for environment variables
      const fs = await import('fs');
      const path = await import('path');
      
      const adminStackPath = path.join(__dirname, '../lib/admin-analytics-stack.ts');
      const adminStackContent = fs.readFileSync(adminStackPath, 'utf8');
      
      const requiredEnvVars = [
        'CONVERSATIONS_TABLE',
        'MESSAGES_TABLE',
        'QUESTIONS_TABLE',
        'UNANSWERED_QUESTIONS_TABLE'
      ];

      for (const envVar of requiredEnvVars) {
        if (adminStackContent.includes(envVar)) {
          this.addResult(`Admin Analytics env var ${envVar} configured`, 'PASS');
        } else {
          this.addResult(`Admin Analytics env var ${envVar} configured`, 'FAIL', 'Variable not found in code');
        }
      }

      // Check chat processor stack
      const chatStackPath = path.join(__dirname, '../lib/chat-processor-stack.ts');
      const chatStackContent = fs.readFileSync(chatStackPath, 'utf8');
      
      for (const envVar of requiredEnvVars) {
        if (chatStackContent.includes(envVar)) {
          this.addResult(`Chat Processor env var ${envVar} configured`, 'PASS');
        } else {
          this.addResult(`Chat Processor env var ${envVar} configured`, 'FAIL', 'Variable not found in code');
        }
      }

      // Check that AWS_REGION is not manually set
      if (!adminStackContent.includes('AWS_REGION:') && !chatStackContent.includes('AWS_REGION:')) {
        this.addResult('AWS_REGION not manually set', 'PASS', 'Reserved variable properly handled');
      } else {
        this.addResult('AWS_REGION not manually set', 'FAIL', 'Reserved variable found in code');
      }

    } catch (error) {
      this.addResult('Environment variable validation', 'FAIL', `Error: ${error}`);
    }
  }

  async validateDynamoDBTableConfiguration(): Promise<void> {
    console.log('\n🧪 Testing DynamoDB Table Configuration...');

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const dynamoStackPath = path.join(__dirname, '../lib/dynamodb-stack.ts');
      const dynamoStackContent = fs.readFileSync(dynamoStackPath, 'utf8');
      
      // Test 1: Check for new table definitions
      const requiredTables = [
        'conversationsTable',
        'messagesTable',
        'questionsTable',
        'unansweredQuestionsTable'
      ];

      for (const table of requiredTables) {
        if (dynamoStackContent.includes(`public readonly ${table}`)) {
          this.addResult(`DynamoDB table ${table} defined`, 'PASS');
        } else {
          this.addResult(`DynamoDB table ${table} defined`, 'FAIL', 'Table definition not found');
        }
      }

      // Test 2: Check for GSI configurations
      const requiredGSIs = [
        'CategoryIndex',
        'ConversationIndex',
        'ConfidenceIndex',
        'DateRangeIndex'
      ];

      for (const gsi of requiredGSIs) {
        if (dynamoStackContent.includes(`indexName: '${gsi}'`)) {
          this.addResult(`GSI ${gsi} configured`, 'PASS');
        } else {
          this.addResult(`GSI ${gsi} configured`, 'FAIL', 'GSI not found');
        }
      }

      // Test 3: Check for access policy updates
      if (dynamoStackContent.includes('unansweredQuestionsTable.grantReadWriteData')) {
        this.addResult('Unanswered questions table access policy', 'PASS');
      } else {
        this.addResult('Unanswered questions table access policy', 'FAIL', 'Access policy not found');
      }

    } catch (error) {
      this.addResult('DynamoDB table configuration validation', 'FAIL', `Error: ${error}`);
    }
  }

  async validateCloudWatchConfiguration(): Promise<void> {
    console.log('\n🧪 Testing CloudWatch Configuration...');

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const adminStackPath = path.join(__dirname, '../lib/admin-analytics-stack.ts');
      const adminStackContent = fs.readFileSync(adminStackPath, 'utf8');
      
      // Test 1: Check for CloudWatch Dashboard
      if (adminStackContent.includes('cloudwatch.Dashboard')) {
        this.addResult('CloudWatch Dashboard configured', 'PASS');
      } else {
        this.addResult('CloudWatch Dashboard configured', 'FAIL', 'Dashboard not found');
      }

      // Test 2: Check for CloudWatch Alarms
      const requiredAlarms = [
        'AdminAPIHighErrorRate',
        'AdminAPIHighLatency',
        'AdminLambdaErrors'
      ];

      for (const alarm of requiredAlarms) {
        if (adminStackContent.includes(alarm)) {
          this.addResult(`CloudWatch alarm ${alarm} configured`, 'PASS');
        } else {
          this.addResult(`CloudWatch alarm ${alarm} configured`, 'FAIL', 'Alarm not found');
        }
      }

      // Test 3: Check for enhanced monitoring alarms
      const enhancedAlarms = [
        'ConversationEndpointErrors',
        'QuestionAnalysisErrors',
        'EscalationAnalysisErrors'
      ];

      for (const alarm of enhancedAlarms) {
        if (adminStackContent.includes(alarm)) {
          this.addResult(`Enhanced alarm ${alarm} configured`, 'PASS');
        } else {
          this.addResult(`Enhanced alarm ${alarm} configured`, 'FAIL', 'Enhanced alarm not found');
        }
      }

    } catch (error) {
      this.addResult('CloudWatch configuration validation', 'FAIL', `Error: ${error}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Task 12 CDK Stack Validation Tests (Simple)\n');

    await this.validateDynamoDBStackCode();
    await this.validateAdminAnalyticsStackCode();
    await this.validateChatProcessorStackCode();
    await this.validateEnvironmentVariables();
    await this.validateDynamoDBTableConfiguration();
    await this.validateCloudWatchConfiguration();

    // Summary
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log('\n📊 Test Summary:');
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed === 0) {
      console.log('\n🎉 All CDK stack updates completed successfully!');
      console.log('✅ Task 12 requirements have been implemented and validated.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the failed tests above.');
      process.exit(1);
    }
  }
}

// Run the tests
async function main() {
  const validator = new SimpleCDKValidator();
  await validator.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { SimpleCDKValidator };