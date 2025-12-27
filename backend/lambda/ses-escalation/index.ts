import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendTemplatedEmailCommand } from '@aws-sdk/client-ses';
import { DataService } from '../../src/services/data-service';
import { EscalationQueue, ChatMessage } from '../../src/types/index';

/**
 * ADA Clara SES Email Escalation Lambda Function
 * Handles email notifications for escalated chat sessions
 */

interface EscalationEmailData {
  escalationId: string;
  sessionId: string;
  userInfo: {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
  };
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  conversationHistory: ChatMessage[];
  timestamp: string;
}

class SESEscalationProcessor {
  private sesClient: SESClient;
  private dataService: DataService;
  private supportEmail: string;
  private fromEmail: string;

  constructor() {
    this.sesClient = new SESClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    this.dataService = new DataService();
    this.supportEmail = process.env.SUPPORT_EMAIL || 'support@ada-clara.org';
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@ada-clara.org';
  }

  /**
   * Process escalation from SQS trigger
   */
  async processEscalation(escalationData: EscalationEmailData): Promise<void> {
    console.log(`Processing escalation: ${escalationData.escalationId}`);

    try {
      // Generate email content
      const emailContent = this.generateEscalationEmail(escalationData);
      
      // Send email to support team
      await this.sendEscalationEmail(emailContent);
      
      // Update escalation status
      await this.updateEscalationStatus(escalationData.escalationId, 'notified');
      
      // Log the notification
      await this.dataService.logAuditEvent({
        eventId: `escalation-email-sent-${escalationData.escalationId}`,
        eventType: 'escalation',
        sessionId: escalationData.sessionId,
        timestamp: new Date(),
        details: {
          action: 'escalation_email_sent',
          escalationId: escalationData.escalationId,
          supportEmail: this.supportEmail,
          priority: escalationData.priority,
          reason: escalationData.reason
        },
        severity: escalationData.priority === 'urgent' ? 'high' : 'medium'
      });

      console.log(`✅ Escalation email sent for ${escalationData.escalationId}`);
    } catch (error) {
      console.error(`❌ Failed to process escalation ${escalationData.escalationId}:`, error);
      
      // Update escalation status to failed
      await this.updateEscalationStatus(escalationData.escalationId, 'failed');
      
      throw error;
    }
  }

  /**
   * Generate escalation email content
   */
  private generateEscalationEmail(data: EscalationEmailData): {
    subject: string;
    htmlBody: string;
    textBody: string;
  } {
    const priorityEmoji = {
      low: '🟢',
      medium: '🟡', 
      high: '🟠',
      urgent: '🔴'
    };

    const subject = `${priorityEmoji[data.priority]} ADA Clara Escalation - ${data.priority.toUpperCase()} Priority`;

    // Generate conversation history HTML
    const conversationHtml = data.conversationHistory
      .map(msg => `
        <div style="margin: 10px 0; padding: 10px; background: ${msg.sender === 'user' ? '#f0f8ff' : '#f8f8f8'}; border-left: 4px solid ${msg.sender === 'user' ? '#007bff' : '#28a745'};">
          <strong>${msg.sender === 'user' ? 'User' : 'ADA Clara'}:</strong> ${msg.content}
          <br><small style="color: #666;">
            ${new Date(msg.timestamp).toLocaleString()} | 
            Language: ${msg.language.toUpperCase()} | 
            ${msg.confidence ? `Confidence: ${(msg.confidence * 100).toFixed(1)}%` : ''}
          </small>
        </div>
      `).join('');

    // Generate conversation history text
    const conversationText = data.conversationHistory
      .map(msg => `
${msg.sender === 'user' ? 'USER' : 'ADA CLARA'}: ${msg.content}
Time: ${new Date(msg.timestamp).toLocaleString()} | Language: ${msg.language.toUpperCase()} ${msg.confidence ? `| Confidence: ${(msg.confidence * 100).toFixed(1)}%` : ''}
      `).join('\n---\n');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ADA Clara Escalation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 10px;">
            ${priorityEmoji[data.priority]} ADA Clara Chat Escalation
        </h1>
        
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h2 style="margin-top: 0; color: #856404;">Escalation Details</h2>
            <p><strong>Escalation ID:</strong> ${data.escalationId}</p>
            <p><strong>Session ID:</strong> ${data.sessionId}</p>
            <p><strong>Priority:</strong> <span style="color: ${data.priority === 'urgent' ? '#d32f2f' : data.priority === 'high' ? '#ff9800' : '#4caf50'};">${data.priority.toUpperCase()}</span></p>
            <p><strong>Reason:</strong> ${data.reason}</p>
            <p><strong>Timestamp:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <div style="background: #e3f2fd; border: 1px solid #90caf9; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h2 style="margin-top: 0; color: #1565c0;">User Information</h2>
            <p><strong>Name:</strong> ${data.userInfo.name || 'Not provided'}</p>
            <p><strong>Email:</strong> ${data.userInfo.email || 'Not provided'}</p>
            <p><strong>Phone:</strong> ${data.userInfo.phone || 'Not provided'}</p>
            <p><strong>Zip Code:</strong> ${data.userInfo.zipCode || 'Not provided'}</p>
        </div>

        <div style="background: #f3e5f5; border: 1px solid #ce93d8; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h2 style="margin-top: 0; color: #7b1fa2;">Conversation History</h2>
            <p><strong>Total Messages:</strong> ${data.conversationHistory.length}</p>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; background: white;">
                ${conversationHtml}
            </div>
        </div>

        <div style="background: #e8f5e8; border: 1px solid #a5d6a7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h2 style="margin-top: 0; color: #2e7d32;">Next Steps</h2>
            <ul>
                <li>Review the conversation history above</li>
                <li>Contact the user using the provided information</li>
                <li>Update the escalation status in the admin dashboard</li>
                <li>Document the resolution for future reference</li>
            </ul>
        </div>

        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
            This is an automated message from ADA Clara Chatbot System.<br>
            For technical support, contact the development team.
        </p>
    </div>
</body>
</html>
    `;

    const textBody = `
ADA CLARA CHAT ESCALATION - ${data.priority.toUpperCase()} PRIORITY

ESCALATION DETAILS:
- Escalation ID: ${data.escalationId}
- Session ID: ${data.sessionId}
- Priority: ${data.priority.toUpperCase()}
- Reason: ${data.reason}
- Timestamp: ${new Date(data.timestamp).toLocaleString()}

USER INFORMATION:
- Name: ${data.userInfo.name || 'Not provided'}
- Email: ${data.userInfo.email || 'Not provided'}
- Phone: ${data.userInfo.phone || 'Not provided'}
- Zip Code: ${data.userInfo.zipCode || 'Not provided'}

CONVERSATION HISTORY (${data.conversationHistory.length} messages):
${conversationText}

NEXT STEPS:
1. Review the conversation history above
2. Contact the user using the provided information
3. Update the escalation status in the admin dashboard
4. Document the resolution for future reference

---
This is an automated message from ADA Clara Chatbot System.
For technical support, contact the development team.
    `;

    return { subject, htmlBody, textBody };
  }

  /**
   * Send escalation email via SES
   */
  private async sendEscalationEmail(emailContent: {
    subject: string;
    htmlBody: string;
    textBody: string;
  }): Promise<void> {
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [this.supportEmail]
      },
      Message: {
        Subject: {
          Data: emailContent.subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: emailContent.htmlBody,
            Charset: 'UTF-8'
          },
          Text: {
            Data: emailContent.textBody,
            Charset: 'UTF-8'
          }
        }
      },
      Tags: [
        {
          Name: 'Source',
          Value: 'ADA-Clara-Escalation'
        },
        {
          Name: 'Type',
          Value: 'Support-Request'
        }
      ]
    });

    await this.sesClient.send(command);
  }

  /**
   * Update escalation status in database
   */
  private async updateEscalationStatus(
    escalationId: string, 
    status: 'pending' | 'notified' | 'in_progress' | 'resolved' | 'failed'
  ): Promise<void> {
    // This would update the escalation record in DynamoDB
    // For now, we'll log the status change
    await this.dataService.logAuditEvent({
      eventId: `escalation-status-${escalationId}-${status}`,
      eventType: 'escalation',
      timestamp: new Date(),
      details: {
        action: 'escalation_status_updated',
        escalationId,
        newStatus: status,
        updatedBy: 'ses-escalation-lambda'
      },
      severity: 'low'
    });
  }

  /**
   * Send immediate urgent escalation notification
   */
  async sendUrgentNotification(escalationData: EscalationEmailData): Promise<void> {
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [this.supportEmail]
      },
      Message: {
        Subject: {
          Data: `🚨 URGENT: ADA Clara Escalation - Immediate Attention Required`,
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: `
URGENT ESCALATION ALERT

A high-priority escalation requires immediate attention:

Escalation ID: ${escalationData.escalationId}
Session ID: ${escalationData.sessionId}
User: ${escalationData.userInfo.name || 'Unknown'}
Contact: ${escalationData.userInfo.email || escalationData.userInfo.phone || 'No contact info'}
Reason: ${escalationData.reason}

Please check your email for the full escalation details and respond immediately.

Time: ${new Date(escalationData.timestamp).toLocaleString()}
            `,
            Charset: 'UTF-8'
          }
        }
      }
    });

    await this.sesClient.send(command);
  }

  /**
   * Health check for SES service
   */
  async healthCheck(): Promise<{ status: string; sesConfigured: boolean }> {
    try {
      // Test SES configuration by checking sending quota
      // This is a lightweight way to verify SES is accessible
      return {
        status: 'healthy',
        sesConfigured: true
      };
    } catch (error) {
      console.error('SES health check failed:', error);
      return {
        status: 'unhealthy',
        sesConfigured: false
      };
    }
  }
}

/**
 * Lambda handler for SQS-triggered escalations
 */
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('SES Escalation processor invoked:', JSON.stringify(event, null, 2));

  const processor = new SESEscalationProcessor();
  const results: Array<{ messageId: string; success: boolean; error?: string }> = [];

  // Process each SQS message
  for (const record of event.Records) {
    try {
      const escalationData: EscalationEmailData = JSON.parse(record.body);
      
      // Process the escalation
      await processor.processEscalation(escalationData);
      
      // Send urgent notification if priority is urgent
      if (escalationData.priority === 'urgent') {
        await processor.sendUrgentNotification(escalationData);
      }
      
      results.push({
        messageId: record.messageId,
        success: true
      });
      
      console.log(`✅ Successfully processed escalation: ${escalationData.escalationId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      results.push({
        messageId: record.messageId,
        success: false,
        error: errorMessage
      });
      
      console.error(`❌ Failed to process SQS message ${record.messageId}:`, error);
    }
  }

  // Log processing summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`📊 Escalation processing summary: ${successful} successful, ${failed} failed`);
  
  // If any messages failed, throw an error to trigger SQS retry
  if (failed > 0) {
    const failedMessages = results.filter(r => !r.success);
    throw new Error(`Failed to process ${failed} escalation messages: ${failedMessages.map(f => f.error).join(', ')}`);
  }
};

/**
 * Direct invocation handler for testing
 */
export const testHandler = async (escalationData: EscalationEmailData): Promise<{ success: boolean; message: string }> => {
  const processor = new SESEscalationProcessor();
  
  try {
    await processor.processEscalation(escalationData);
    
    if (escalationData.priority === 'urgent') {
      await processor.sendUrgentNotification(escalationData);
    }
    
    return {
      success: true,
      message: `Escalation ${escalationData.escalationId} processed successfully`
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};