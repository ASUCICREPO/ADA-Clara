'use client';

import { useState, useRef } from 'react';
import Header from './components/Header';
import ChatPanel, { ChatPanelHandle } from './components/ChatPanel';
import { useLanguage } from './context/LanguageContext';
import { translations } from './translations';

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const { language } = useLanguage();
  const t = translations[language];

  const handleSend = () => {
    if (!inputValue.trim() || !chatPanelRef.current) return;
    chatPanelRef.current.handleSend(inputValue);
    setInputValue('');
  };

  const handleLogoClick = () => {
    if (chatPanelRef.current) {
      chatPanelRef.current.resetChat();
      setInputValue('');
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-10">
        <Header onLogoClick={handleLogoClick} />
      </div>
      
      {/* Scrollable Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ marginTop: '70px', marginBottom: '70px' }}>
        <ChatPanel ref={chatPanelRef} />
      </main>
      
      {/* Fixed Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#a6192e]/10 flex-shrink-0 flex justify-center z-10" style={{ padding: '14px 16px' }}>
        <div className="w-full max-w-[900px] flex items-center" style={{ gap: '10px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.input.placeholder}
            className="flex-1 border border-[#cbd5e1] rounded-[10px] h-[48px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 bg-white"
            style={{ paddingLeft: '14px', paddingRight: '14px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={`h-[48px] rounded-[10px] text-sm font-normal text-white flex items-center justify-center transition-all ${
              inputValue.trim()
                ? 'bg-[#a6192e] hover:opacity-90 active:opacity-80'
                : 'bg-[#a6192e] opacity-50 cursor-not-allowed'
            }`}
            style={{ gap: '6px', paddingLeft: '20px', paddingRight: '20px' }}
          >
            <svg
              width="18"
              height="18"
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
            <span>{t.input.send}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
