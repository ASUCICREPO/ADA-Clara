'use client';

import { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import MedicalDisclaimer from './MedicalDisclaimer';
import TalkToPersonForm from './TalkToPersonForm';
import { sendChatMessage } from '../../lib/api/chat.service';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  showTalkToPersonButton?: boolean;
}

export interface ChatPanelHandle {
  handleSend: (inputValue: string) => void;
}

// Session management
function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  let sessionId = localStorage.getItem('ada-clara-session-id');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('ada-clara-session-id', sessionId);
  }
  return sessionId;
}

const ChatPanel = forwardRef<ChatPanelHandle>((props, ref) => {
  const messageIdCounter = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showTalkToPersonForm, setShowTalkToPersonForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Hi, I'm Clara. I can help with questions about diabetes using trusted ADA resources. What would you like to know?",
    },
  ]);

  // Auto-scroll to bottom when messages change or loading state changes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (inputValue: string) => {
    if (!inputValue.trim() || isLoading) return;

    messageIdCounter.current += 1;
    const userMessage: Message = {
      id: `user-${messageIdCounter.current}`,
      type: 'user',
      content: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendChatMessage({
        message: inputValue,
        sessionId: sessionId,
        language: 'en',
      });

      messageIdCounter.current += 1;
      const assistantMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        type: 'assistant',
        content: response.message,
        showTalkToPersonButton: response.escalated === true,
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      messageIdCounter.current += 1;
      const errorMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        type: 'assistant',
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    handleSend,
  }));

  const handleTalkToPersonClick = () => {
    setShowTalkToPersonForm(true);
  };

  const handleFormSubmit = async (formData: any) => {
    // Form submission is handled by TalkToPersonForm component
    setShowTalkToPersonForm(false);
  };

  return (
    <>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex justify-center" style={{ paddingBottom: '40px' }}>
        <div className="w-full max-w-[900px] mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          {/* Medical Disclaimer at the beginning */}
          <div style={{ marginBottom: '8px' }}>
            <MedicalDisclaimer />
          </div>
          {messages.map((message) => (
            <div key={message.id}>
              <ChatMessage
                type={message.type}
                content={message.content}
              />
              {message.showTalkToPersonButton && (
                <div className="flex justify-center" style={{ marginTop: '16px' }}>
                  <button
                    onClick={handleTalkToPersonClick}
                    className="bg-[#a6192e] text-white rounded-[10px] text-sm font-normal hover:opacity-90 transition-opacity"
                    style={{ padding: '12px 24px', height: '48px' }}
                  >
                    Talk to a person
                  </button>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-center">
              <div className="text-[#64748b] text-sm">Clara is thinking...</div>
            </div>
          )}
          {/* Scroll anchor - always at the bottom */}
          <div ref={messagesEndRef} style={{ height: '1px', flexShrink: 0 }}></div>
        </div>
      </div>

      {/* Talk to Person Form Modal */}
      <TalkToPersonForm
        isOpen={showTalkToPersonForm}
        onClose={() => setShowTalkToPersonForm(false)}
        onSubmit={handleFormSubmit}
      />
    </>
  );
});

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;

