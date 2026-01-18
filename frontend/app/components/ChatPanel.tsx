'use client';

import { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import WelcomeLanding from './WelcomeLanding';
import TalkToPersonForm from './TalkToPersonForm';
import { sendChatMessage, getChatHistory } from '../../lib/api/chat.service';
import { useLanguage } from '../context/LanguageContext';

interface ChatSource {
  url: string;
  title: string;
  excerpt?: string;
  relevanceScore?: number;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  showTalkToPersonButton?: boolean;
  sources?: ChatSource[];
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
  const { language } = useLanguage();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [lastUserQuestion, setLastUserQuestion] = useState<string>('');

  // Load chat history on mount if session exists
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await getChatHistory(sessionId);

        if (history.messages && history.messages.length > 0) {
          // Transform backend format to frontend format
          const transformedMessages: Message[] = history.messages.map((msg, index) => ({
            id: msg.messageId || `${msg.sender}-${index}`,
            type: msg.sender === 'bot' ? 'assistant' : 'user',
            content: msg.content,
            // Note: We don't persist showTalkToPersonButton in history
            // Users can still use the button in the input area if needed
          }));

          setMessages(transformedMessages);
          setHasStartedChat(true); // Show chat mode if we have history
          messageIdCounter.current = transformedMessages.length;
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // Continue with empty messages - don't block the user
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  // Auto-scroll to bottom when messages change or loading state changes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (hasStartedChat && !isLoadingHistory) {
      scrollToBottom();
    }
  }, [messages, isLoading, hasStartedChat, isLoadingHistory]);

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

    // Track the last user question for escalation
    setLastUserQuestion(inputValue);

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendChatMessage({
        message: inputValue,
        sessionId: sessionId,
        language: language,
      });

      messageIdCounter.current += 1;
      const assistantMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        type: 'assistant',
        content: response.message,
        showTalkToPersonButton: response.escalated === true,
        sources: response.sources,
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
                sources={message.sources}
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
        questionText={lastUserQuestion}
      />
    </>
  );
});

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;
