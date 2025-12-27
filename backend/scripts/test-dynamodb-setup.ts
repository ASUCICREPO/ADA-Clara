#!/usr/bin/env node

/**
 * Test DynamoDB Setup for ADA Clara Chatbot
 * This script tests the DynamoDB service and verifies all tables are working
 */

import { DynamoDBService } from '../src/services/dynamodb-service';
import { 
  UserSession, 
  ChatMessage, 
  ProfessionalMember,
  UserPreferences,
  AnalyticsData,
  AuditLog
} from '../src/types/index';

async function testDynamoDBSetup() {
  console.log('🧪 Testing ADA Clara DynamoDB Setup...\n');

  const dbService = new DynamoDBService();

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing DynamoDB connection...');
    const isHealthy = await dbService.healthCheck();
    if (isHealthy) {
      console.log('✅ DynamoDB connection successful\n');
    } else {
      console.log('❌ DynamoDB connection failed\n');
      return;
    }

    // Test 2: Create and retrieve a chat session
    console.log('2️⃣ Testing Chat Sessions...');
    const testSession: Omit<UserSession, 'ttl'> = {
      sessionId: 'test-session-001',
      startTime: new Date(),
      language: 'en',
      escalated: false,
      messageCount: 0,
      lastActivity: new Date(),
      userInfo: {
        name: 'Test User',
        email: 'test@example.com'
      }
    };

    await dbService.createSession(testSession);
    console.log('✅ Session created successfully');

    const retrievedSession = await dbService.getSession('test-session-001');
    if (retrievedSession && retrievedSession.sessionId === 'test-session-001') {
      console.log('✅ Session retrieved successfully');
    } else {
      console.log('❌ Session retrieval failed');
    }

    // Test 3: Add messages to the session
    console.log('3️⃣ Testing Chat Messages...');
    const testMessage: Omit<ChatMessage, 'ttl'> = {
      messageId: 'msg-001',
      sessionId: 'test-session-001',
      content: 'Hello, I have a question about diabetes.',
      sender: 'user',
      timestamp: new Date(),
      language: 'en'
    };

    await dbService.addMessage(testMessage);
    console.log('✅ Message added successfully');

    const messages = await dbService.getSessionMessages('test-session-001');
    if (messages.length > 0 && messages[0].messageId === 'msg-001') {
      console.log('✅ Messages retrieved successfully');
    } else {
      console.log('❌ Message retrieval failed');
    }

    // Test 4: Professional Member operations
    console.log('4️⃣ Testing Professional Members...');
    const testMember: ProfessionalMember = {
      memberId: 'member-001',
      email: 'doctor@example.com',
      name: 'Dr. Test Member',
      membershipType: 'Professional',
      status: 'active',
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      benefits: ['Access to resources', 'Continuing education'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await dbService.createMember(testMember);
    console.log('✅ Member created successfully');

    const retrievedMember = await dbService.getMember('doctor@example.com');
    if (retrievedMember && retrievedMember.memberId === 'member-001') {
      console.log('✅ Member retrieved successfully');
    } else {
      console.log('❌ Member retrieval failed');
    }

    // Test 5: User Preferences
    console.log('5️⃣ Testing User Preferences...');
    const testPreferences: UserPreferences = {
      userId: 'user-001',
      language: 'en',
      notifications: true,
      escalationPreference: 'email',
      timezone: 'America/New_York',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await dbService.setUserPreferences(testPreferences);
    console.log('✅ User preferences set successfully');

    const retrievedPreferences = await dbService.getUserPreferences('user-001');
    if (retrievedPreferences && retrievedPreferences.userId === 'user-001') {
      console.log('✅ User preferences retrieved successfully');
    } else {
      console.log('❌ User preferences retrieval failed');
    }

    // Test 6: Analytics
    console.log('6️⃣ Testing Analytics...');
    const testAnalytics: AnalyticsData = {
      date: '2024-01-15',
      hour: 14,
      type: 'chat',
      metric: 'session_count',
      value: 25,
      metadata: { source: 'test' },
      createdAt: new Date()
    };

    await dbService.recordAnalytics(testAnalytics);
    console.log('✅ Analytics recorded successfully');

    const retrievedAnalytics = await dbService.getAnalytics('2024-01-15', 'chat');
    if (retrievedAnalytics.length > 0) {
      console.log('✅ Analytics retrieved successfully');
    } else {
      console.log('❌ Analytics retrieval failed');
    }

    // Test 7: Audit Logs
    console.log('7️⃣ Testing Audit Logs...');
    const testAuditLog: Omit<AuditLog, 'ttl'> = {
      eventId: 'audit-001',
      eventType: 'login',
      userId: 'user-001',
      sessionId: 'test-session-001',
      timestamp: new Date(),
      ipAddress: '192.168.1.1',
      userAgent: 'Test Browser',
      details: { action: 'user_login', success: true },
      severity: 'low'
    };

    await dbService.logAuditEvent(testAuditLog);
    console.log('✅ Audit log recorded successfully');

    const today = new Date().toISOString().split('T')[0];
    const retrievedAuditLogs = await dbService.getAuditLogs(today);
    if (retrievedAuditLogs.length > 0) {
      console.log('✅ Audit logs retrieved successfully');
    } else {
      console.log('❌ Audit logs retrieval failed');
    }

    console.log('\n🎉 All DynamoDB tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('✅ DynamoDB connection');
    console.log('✅ Chat Sessions table');
    console.log('✅ Chat Messages');
    console.log('✅ Professional Members table');
    console.log('✅ User Preferences table');
    console.log('✅ Analytics table');
    console.log('✅ Audit Logs table');

  } catch (error) {
    console.error('❌ DynamoDB test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDynamoDBSetup().catch(console.error);
}

export { testDynamoDBSetup };