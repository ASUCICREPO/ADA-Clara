'use client';

import { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import WelcomeLanding from './WelcomeLanding';
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
  resetChat: () => void;
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
  const messageIdCounter = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showTalkToPersonForm, setShowTalkToPersonForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [hasStartedChat, setHasStartedChat] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);

  // Auto-scroll to bottom when messages change or loading state changes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (hasStartedChat) {
      scrollToBottom();
    }
  }, [messages, isLoading, hasStartedChat]);

  const handleSend = async (inputValue: string) => {
    if (!inputValue.trim() || isLoading) return;

    // Start chat mode if not already started
    if (!hasStartedChat) {
      setHasStartedChat(true);
    }

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

  const resetChat = () => {
    setMessages([]);
    messageIdCounter.current = 0;
    setHasStartedChat(false);
    setIsLoading(false);
    setShowTalkToPersonForm(false);
  };

  useImperativeHandle(ref, () => ({
    handleSend,
    resetChat,
  }));

  const handleTalkToPersonClick = () => {
    setShowTalkToPersonForm(true);
  };

  const handleFormSubmit = async (formData: any) => {
    // Form submission is handled by TalkToPersonForm component
    setShowTalkToPersonForm(false);
  };

  const handleQuickAction = (question: string) => {
    handleSend(question);
  };

  // Show welcome landing if chat hasn't started
  if (!hasStartedChat) {
    return (
      <div className="flex-1 overflow-y-auto min-h-0 flex justify-center" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <WelcomeLanding onQuickAction={handleQuickAction} />
      </div>
    );
  }

  return (
    <>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex justify-center" style={{ paddingBottom: '40px' }}>
        <div className="w-full max-w-[900px] mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
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
          {isLoading && <TypingIndicator />}
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
