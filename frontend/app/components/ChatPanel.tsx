'use client';

import { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import ChatMessage from './ChatMessage';
import MedicalDisclaimer from './MedicalDisclaimer';
import TalkToPersonForm from './TalkToPersonForm';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  showTalkToPersonButton?: boolean;
}

export interface ChatPanelHandle {
  handleSend: (inputValue: string) => void;
}

const ChatPanel = forwardRef<ChatPanelHandle>((props, ref) => {
  const messageIdCounter = useRef(1);
  const [showTalkToPersonForm, setShowTalkToPersonForm] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: "Hi, I'm Clara. I can help with questions about diabetes using trusted ADA resources. What would you like to know?",
    },
  ]);

  const handleSend = (inputValue: string) => {
    if (!inputValue.trim()) return;

    messageIdCounter.current += 1;
    const userMessage: Message = {
      id: `user-${messageIdCounter.current}`,
      type: 'user',
      content: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = inputValue.toLowerCase();

    // Simulate assistant response (replace with actual API call)
    setTimeout(() => {
      messageIdCounter.current += 1;
      
      // Simulate low confidence scenario - show "Talk to a Person" button
      const shouldShowButton = userInput.includes('prescribe') || userInput.includes('medication') || userInput.includes('doctor');
      
      const assistantMessage: Message = {
        id: `assistant-${messageIdCounter.current}`,
        type: 'assistant',
        content: shouldShowButton 
          ? "I'm not able to answer that based on the information I have. I cannot provide medical advice, diagnoses, or prescriptions. Would you like to talk to a person from the American Diabetes Association?"
          : 'Thank you for your question. I\'m processing your request...',
        showTalkToPersonButton: shouldShowButton,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  useImperativeHandle(ref, () => ({
    handleSend,
  }));

  const handleTalkToPersonClick = () => {
    setShowTalkToPersonForm(true);
  };

  const handleFormSubmit = (formData: any) => {
    console.log('Form submitted:', formData);
    // Here you would send the form data to your backend
    alert('Thank you! Someone will reach out to you shortly.');
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
          {/* Spacer for bottom padding */}
          <div style={{ height: '10px', flexShrink: 0 }}></div>
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

