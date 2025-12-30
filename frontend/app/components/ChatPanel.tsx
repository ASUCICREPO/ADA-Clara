'use client';

import { useState, useRef } from 'react';
import ChatMessage from './ChatMessage';
import MedicalDisclaimer from './MedicalDisclaimer';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
}

export default function ChatPanel() {
  const messageIdCounter = useRef(1);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Hi, I'm Clara. I can help with questions about diabetes using trusted ADA resources. What would you like to know?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;

    messageIdCounter.current += 1;
    const userMessage: Message = {
      id: `user-${messageIdCounter.current}`,
      type: 'user',
      content: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Simulate assistant response (replace with actual API call)
    setTimeout(() => {
      messageIdCounter.current += 1;
      const assistantMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        type: 'assistant',
        content: 'Thank you for your question. I\'m processing your request...',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)] flex flex-col overflow-hidden w-full" style={{ height: '680px', maxHeight: '85vh' }}>
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-[#f9fafb] to-white border-b border-[#cbd5e1] flex-shrink-0" style={{ padding: '16px', minHeight: '86px', display: 'flex', alignItems: 'center' }}>
        <div className="flex items-center w-full" style={{ gap: '12px' }}>
          <div className="bg-[#a6192e] rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-bold">C</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[#020617] text-xl font-normal m-0" style={{ lineHeight: '30px', marginBottom: '4px' }}>Clara</h2>
            <div className="flex items-center" style={{ gap: '8px' }}>
              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
              <p className="text-[#64748b] text-sm font-normal m-0" style={{ lineHeight: '20px' }}>
                Online – Here to help with diabetes questions based on ADA resources
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 bg-[#f8fafc] overflow-y-auto min-h-0" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Medical Disclaimer at the beginning */}
          <div style={{ marginBottom: '8px' }}>
            <MedicalDisclaimer />
          </div>
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              type={message.type}
              content={message.content}
            />
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-white bg-white flex-shrink-0" style={{ padding: '16px', minHeight: '84px', display: 'flex', alignItems: 'center' }}>
        <div className="flex items-center w-full" style={{ gap: '12px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about diabetes…"
            className="flex-1 border border-[#cbd5e1] rounded-[10px] h-[52px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
            style={{ paddingLeft: '16px', paddingRight: '16px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={`h-[52px] rounded-[10px] text-base font-normal text-white flex items-center justify-center transition-all ${
              inputValue.trim()
                ? 'bg-[#a6192e] hover:opacity-90 active:opacity-80'
                : 'bg-[#a6192e] opacity-50 cursor-not-allowed'
            }`}
            style={{ gap: '8px', paddingLeft: '24px', paddingRight: '24px' }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="flex-shrink-0"
            >
              <path
                d="M2.5 18.75L18.75 10L2.5 1.25L2.5 8.33333L13.75 10L2.5 11.6667L2.5 18.75Z"
                fill="white"
              />
            </svg>
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

