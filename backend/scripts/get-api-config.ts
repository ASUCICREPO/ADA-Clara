#!/usr/bin/env node

/**
 * Get API Configuration Values
 * 
 * This script retrieves the current configuration values from deployed stacks
 * for frontend integration.
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

interface ConfigValues {
  cognitoUserPoolId?: string;
  cognitoAppClientId?: string;
  cognitoIdentityPoolId?: string;
  cognitoDomain?: string;
  unifiedApiUrl?: string;
  unifiedApiId?: string;
}

class ConfigRetriever {
  private cfClient: CloudFormationClient;

  constructor() {
    this.cfClient = new CloudFormationClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  async getStackOutputs(stackName: string): Promise<Record<string, string>> {
    try {
      const command = new DescribeStacksCommand({ StackName: stackName });
      const response = await this.cfClient.send(command);
      
      const stack = response.Stacks?.[0];
      if (!stack) {
        throw new Error(`Stack ${stackName} not found`);
      }

      const outputs: Record<string, string> = {};
      stack.Outputs?.forEach(output => {
        if (output.OutputKey && output.OutputValue) {
          outputs[output.OutputKey] = output.OutputValue;
        }
      });

      return outputs;
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        console.log(`⚠️  Stack ${stackName} not found or not deployed`);
        return {};
      }
      throw error;
    }
  }

  async getAllConfigurations(): Promise<ConfigValues> {
    console.log('🔍 Retrieving configuration values from deployed stacks...\n');

    const config: ConfigValues = {};

    // Get Cognito configuration
    try {
      console.log('📋 Checking Cognito Auth stack...');
      const cognitoOutputs = await this.getStackOutputs('AdaClaraCognitoAuth');
      
      config.cognitoUserPoolId = cognitoOutputs.UserPoolId;
      config.cognitoAppClientId = cognitoOutputs.UserPoolClientId;
      config.cognitoIdentityPoolId = cognitoOutputs.IdentityPoolId;
      config.cognitoDomain = cognitoOutputs.CognitoDomain;
      
      if (config.cognitoUserPoolId) {
        console.log('  ✅ Cognito configuration found');
      } else {
        console.log('  ❌ Cognito configuration not found');
      }
    } catch (error) {
      console.log('  ❌ Failed to get Cognito configuration:', error);
    }

    // Get Unified API configuration
    try {
      console.log('📋 Checking Unified API stack...');
      const apiOutputs = await this.getStackOutputs('AdaClaraUnifiedAPI');
      
      config.unifiedApiUrl = apiOutputs.UnifiedApiUrl;
      config.unifiedApiId = apiOutputs.UnifiedApiId;
      
      if (config.unifiedApiUrl) {
        console.log('  ✅ Unified API configuration found');
      } else {
        console.log('  ❌ Unified API configuration not found');
      }
    } catch (error) {
      console.log('  ❌ Failed to get Unified API configuration:', error);
    }

    return config;
  }

  printConfiguration(config: ConfigValues): void {
    console.log('\n📋 Configuration Values for Frontend Integration');
    console.log('================================================\n');

    if (config.cognitoUserPoolId) {
      console.log('🔐 Cognito Configuration:');
      console.log(`  User Pool ID: ${config.cognitoUserPoolId}`);
      console.log(`  App Client ID: ${config.cognitoAppClientId}`);
      console.log(`  Identity Pool ID: ${config.cognitoIdentityPoolId}`);
      console.log(`  Domain: ${config.cognitoDomain}`);
      console.log('');
    } else {
      console.log('❌ Cognito Configuration: Not deployed');
      console.log('   Run: npm run deploy-unified-api');
      console.log('');
    }

    if (config.unifiedApiUrl) {
      console.log('🌐 Unified API Configuration:');
      console.log(`  API URL: ${config.unifiedApiUrl}`);
      console.log(`  API ID: ${config.unifiedApiId}`);
      console.log('');
    } else {
      console.log('❌ Unified API Configuration: Not deployed');
      console.log('   Run: npm run deploy-unified-api');
      console.log('');
    }

    // Generate environment file content
    if (config.unifiedApiUrl && config.cognitoUserPoolId) {
      console.log('📄 Frontend Environment Configuration (.env.local):');
      console.log('================================================');
      console.log('');
      console.log('# Unified API Configuration');
      console.log(`NEXT_PUBLIC_API_URL=${config.unifiedApiUrl}`);
      console.log('');
      console.log('# Cognito Configuration');
      console.log(`NEXT_PUBLIC_COGNITO_USER_POOL_ID=${config.cognitoUserPoolId}`);
      console.log(`NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${config.cognitoAppClientId}`);
      console.log(`NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=${config.cognitoIdentityPoolId}`);
      console.log(`NEXT_PUBLIC_COGNITO_DOMAIN=${config.cognitoDomain?.replace('https://', '')}`);
      console.log('');
      console.log('# App Configuration');
      console.log('NEXT_PUBLIC_APP_NAME=ADA Clara');
      console.log('NEXT_PUBLIC_ENVIRONMENT=development');
      console.log('');
    }

    // Show available endpoints
    if (config.unifiedApiUrl) {
      console.log('🔗 Available API Endpoints:');
      console.log('==========================');
      console.log('');
      console.log('Authentication:');
      console.log(`  GET  ${config.unifiedApiUrl}/auth - Get user context`);
      console.log(`  POST ${config.unifiedApiUrl}/auth - Validate JWT token`);
      console.log(`  GET  ${config.unifiedApiUrl}/auth/user - Get user context`);
      console.log(`  POST ${config.unifiedApiUrl}/auth/verify-professional - Verify credentials`);
      console.log(`  GET  ${config.unifiedApiUrl}/auth/health - Auth service health`);
      console.log('');
      console.log('Chat:');
      console.log(`  POST ${config.unifiedApiUrl}/chat - Send message`);
      console.log(`  GET  ${config.unifiedApiUrl}/chat/history - Get user sessions`);
      console.log(`  GET  ${config.unifiedApiUrl}/chat/history/{{sessionId}} - Get session messages`);
      console.log(`  GET  ${config.unifiedApiUrl}/chat/sessions - Get user sessions (alias)`);
      console.log(`  GET  ${config.unifiedApiUrl}/chat - Chat service health`);
      console.log('');
      console.log('Query/RAG:');
      console.log(`  POST ${config.unifiedApiUrl}/query - Process RAG query`);
      console.log(`  GET  ${config.unifiedApiUrl}/query - RAG service health`);
      console.log('');
      console.log('Admin (Admin users only):');
      console.log(`  GET  ${config.unifiedApiUrl}/admin/dashboard - Dashboard data`);
      console.log(`  GET  ${config.unifiedApiUrl}/admin/conversations - Conversation analytics`);
      console.log(`  GET  ${config.unifiedApiUrl}/admin/questions - Question analytics`);
      console.log(`  GET  ${config.unifiedApiUrl}/admin/escalations - Escalation analytics`);
      console.log(`  GET  ${config.unifiedApiUrl}/admin/realtime - Real-time metrics`);
      console.log(`  GET  ${config.unifiedApiUrl}/admin/health - Admin service health`);
      console.log('');
      console.log('System:');
      console.log(`  GET  ${config.unifiedApiUrl}/health - Overall system health`);
      console.log('');
    }

    // Next steps
    console.log('🎯 Next Steps:');
    console.log('=============');
    
    if (!config.unifiedApiUrl) {
      console.log('1. Deploy the unified API: npm run deploy-unified-api');
      console.log('2. Run this script again to get configuration values');
    } else {
      console.log('1. Copy the environment configuration to your frontend .env.local file');
      console.log('2. Test the API endpoints: npm run test-unified-api ' + config.unifiedApiUrl);
      console.log('3. Start frontend integration using the API client examples');
      console.log('4. Update Cognito redirect URLs for your frontend domain');
    }
    console.log('');
  }
}

async function main() {
  try {
    const retriever = new ConfigRetriever();
    const config = await retriever.getAllConfigurations();
    retriever.printConfiguration(config);
  } catch (error) {
    console.error('❌ Failed to retrieve configuration:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});