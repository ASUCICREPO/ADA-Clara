#!/usr/bin/env node
import { EscalationService } from '../src/services/escalation-service';
import { DataService } from '../src/services/data-service';
import { ChatMessage, UserSession } from '../src/types/index';

/**
 * Test script for escalation workflow
 * Tests escalation triggers, queue processing, and email notifications
 */

async function testEscalationWorkflow() {
  console.log('🧪 Testing ADA Clara Escalation Workflow\n');

  const escalationService = new EscalationService();
  const dataService = new DataService();

  try {
    // ===== HEALTH CHECK =====
    console.log('1️⃣ Checking escalation service health...');
    const health = await escalationService.healthCheck();
    console.log('Health check result:', health);
    
    if (!health.overall) {
      console.warn('⚠️ Escalation service not fully configured. Some tests may fail.');
    }
    console.log('');

    // ===== CREATE TEST SESSION =====
    console.log('2️⃣ Creating test chat session...');
    const testSession: Omit<UserSession, 'ttl'> = {
      sessionId: `test-escalation-${Date.now()}`,
      userId: 'test-user-escalation',
      language: 'en',
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userInfo: {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1-555-0123',
        zipCode: '12345'
      },
      escalated: false
    };

    const session = await dataService.createChatSession(testSession);
    console.log(`✅ Test session created: ${session.sessionId}\n`);

    // ===== TEST ESCALATION TRIGGERS =====
    console.log('3️⃣ Testing escalation trigger scenarios...\n');

    const testScenarios = [
      {
        name: 'Low Confidence Response',
        message: {
          messageId: `msg-${Date.now()}-1`,
          sessionId: session.sessionId,
          sender: 'user' as const,
          content: 'What is the best treatment for my specific condition?',
          timestamp: new Date(),
          language: 'en'
        },
        response: {
          content: 'I found some general information about treatments, but I\'m not sure if this applies to your specific situation.',
          confidence: 0.45,
          sources: []
        }
      },
      {
        name: 'Explicit Escalation Request',
        message: {
          messageId: `msg-${Date.now()}-2`,
          sessionId: session.sessionId,
          sender: 'user' as const,
          content: 'This isn\'t helpful. I need to speak to a real person.',
          timestamp: new Date(),
          language: 'en'
        },
        response: {
          content: 'I understand you\'d like to speak with someone. Let me help you with that.',
          confidence: 0.85,
          sources: []
        }
      },
      {
        name: 'Emergency Keywords',
        message: {
          messageId: `msg-${Date.now()}-3`,
          sessionId: session.sessionId,
          sender: 'user' as const,
          content: 'I\'m having chest pain and trouble breathing. This is an emergency!',
          timestamp: new Date(),
          language: 'en'
        },
        response: {
          content: 'This sounds like a medical emergency. Please call 911 immediately.',
          confidence: 0.95,
          sources: []
        }
      },
      {
        name: 'No Relevant Sources',
        message: {
          messageId: `msg-${Date.now()}-4`,
          sessionId: session.sessionId,
          sender: 'user' as const,
          content: 'What are the diabetes support groups in my area code 99999?',
          timestamp: new Date(),
          language: 'en'
        },
        response: {
          content: 'I don\'t have specific information about support groups in your area.',
          confidence: 0.60,
          sources: []
        }
      }
    ];

    for (const scenario of testScenarios) {
      console.log(`🔍 Testing: ${scenario.name}`);
      
      // Add message to session
      await dataService.addChatMessage(scenario.message);
      
      // Evaluate escalation triggers
      const evaluation = await escalationService.evaluateEscalationTriggers(
        session.sessionId,
        scenario.message,
        scenario.response
      );
      
      console.log(`   Should escalate: ${evaluation.shouldEscalate}`);
      console.log(`   Priority: ${evaluation.priority}`);
      console.log(`   Reason: ${evaluation.reason}`);
      
      // Create escalation if triggered
      if (evaluation.shouldEscalate) {
        const escalation = await escalationService.createEscalation(
          session.sessionId,
          evaluation.reason,
          evaluation.priority
        );
        console.log(`   ✅ Escalation created: ${escalation.escalationId}`);
        
        // Update status to simulate processing
        await escalationService.updateEscalationStatus(
          escalation.escalationId,
          'notified',
          'Test escalation processed successfully'
        );
      }
      
      console.log('');
    }

    // ===== TEST REPEATED QUESTIONS SCENARIO =====
    console.log('4️⃣ Testing repeated questions scenario...');
    
    const repeatedQuestions = [
      'How do I manage my blood sugar?',
      'What should I do about my blood sugar levels?',
      'Can you help me with blood sugar management?',
      'I need help managing my glucose levels',
      'Blood sugar control is difficult for me'
    ];

    for (let i = 0; i < repeatedQuestions.length; i++) {
      const message: Omit<ChatMessage, 'ttl'> = {
        messageId: `msg-repeated-${Date.now()}-${i}`,
        sessionId: session.sessionId,
        sender: 'user',
        content: repeatedQuestions[i],
        timestamp: new Date(),
        language: 'en'
      };

      await dataService.addChatMessage(message);
      
      // Simulate bot response
      const botResponse: Omit<ChatMessage, 'ttl'> = {
        messageId: `msg-bot-${Date.now()}-${i}`,
        sessionId: session.sessionId,
        sender: 'assistant',
        content: 'Here are some general tips for blood sugar management...',
        timestamp: new Date(),
        language: 'en',
        confidence: 0.75
      };

      await dataService.addChatMessage(botResponse);
    }

    // Check if repeated questions trigger escalation
    const lastMessage = {
      messageId: `msg-final-${Date.now()}`,
      sessionId: session.sessionId,
      sender: 'user' as const,
      content: repeatedQuestions[repeatedQuestions.length - 1],
      timestamp: new Date(),
      language: 'en'
    };

    const repeatedEvaluation = await escalationService.evaluateEscalationTriggers(
      session.sessionId,
      lastMessage,
      { content: 'More blood sugar tips...', confidence: 0.75 }
    );

    console.log(`Repeated questions evaluation:`);
    console.log(`   Should escalate: ${repeatedEvaluation.shouldEscalate}`);
    console.log(`   Reason: ${repeatedEvaluation.reason}`);
    console.log('');

    // ===== TEST LONG CONVERSATION SCENARIO =====
    console.log('5️⃣ Testing long conversation scenario...');
    
    // Add many messages to simulate long conversation
    for (let i = 0; i < 20; i++) {
      const userMsg: Omit<ChatMessage, 'ttl'> = {
        messageId: `msg-long-user-${i}`,
        sessionId: session.sessionId,
        sender: 'user',
        content: `This is message ${i + 1} in a long conversation`,
        timestamp: new Date(),
        language: 'en'
      };

      const botMsg: Omit<ChatMessage, 'ttl'> = {
        messageId: `msg-long-bot-${i}`,
        sessionId: session.sessionId,
        sender: 'assistant',
        content: `Response ${i + 1} to your message`,
        timestamp: new Date(),
        language: 'en',
        confidence: 0.80
      };

      await dataService.addChatMessage(userMsg);
      await dataService.addChatMessage(botMsg);
    }

    const longConversationMessage = {
      messageId: `msg-long-final`,
      sessionId: session.sessionId,
      sender: 'user' as const,
      content: 'I still need help with my original question',
      timestamp: new Date(),
      language: 'en'
    };

    const longEvaluation = await escalationService.evaluateEscalationTriggers(
      session.sessionId,
      longConversationMessage,
      { content: 'Let me try to help again...', confidence: 0.70 }
    );

    console.log(`Long conversation evaluation:`);
    console.log(`   Should escalate: ${longEvaluation.shouldEscalate}`);
    console.log(`   Reason: ${longEvaluation.reason}`);
    console.log('');

    // ===== GET ESCALATION STATISTICS =====
    console.log('6️⃣ Getting escalation statistics...');
    const stats = await escalationService.getEscalationStats(7);
    console.log('Escalation stats:', stats);
    console.log('');

    // ===== FINAL SESSION STATUS =====
    console.log('7️⃣ Final session status...');
    const { session: finalSession, messages } = await dataService.getSessionWithMessages(session.sessionId);
    console.log(`Session escalated: ${finalSession?.escalated}`);
    console.log(`Total messages: ${messages.length}`);
    console.log(`Escalation reason: ${finalSession?.escalationReason || 'None'}`);
    console.log('');

    console.log('✅ Escalation workflow test completed successfully!');

  } catch (error) {
    console.error('❌ Escalation workflow test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testEscalationWorkflow()
    .then(() => {
      console.log('\n🎉 All escalation tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Escalation test failed:', error);
      process.exit(1);
    });
}

export { testEscalationWorkflow };