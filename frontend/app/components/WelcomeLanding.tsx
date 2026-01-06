'use client';

import Image from 'next/image';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../translations';

interface WelcomeLandingProps {
  onQuickAction: (question: string) => void;
}

// Icons for quick actions (kept separate as they don't need translation)
const icons = [
  <svg key="info" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/>
  </svg>,
  <svg key="chart" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM9 17H7V10H9V17ZM13 17H11V7H13V17ZM17 17H15V13H17V17Z" fill="currentColor"/>
  </svg>,
  <svg key="heart" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z" fill="currentColor"/>
  </svg>,
  <svg key="food" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.06 22.99H19.72C20.56 22.99 21.25 22.35 21.35 21.53L23 6.89H20V2.89H4V6.89H1L2.65 21.53C2.75 22.35 3.44 22.99 4.28 22.99H5.94L6 22.12L6.94 22.99H17.06L18 22.12L18.06 22.99ZM6 4.89H18V6.89H6V4.89Z" fill="currentColor"/>
  </svg>,
  <svg key="exercise" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.5 5.5C14.6 5.5 15.5 4.6 15.5 3.5C15.5 2.4 14.6 1.5 13.5 1.5C12.4 1.5 11.5 2.4 11.5 3.5C11.5 4.6 12.4 5.5 13.5 5.5ZM9.8 8.9L7 23H9.1L10.9 15L13 17V23H15V15.5L12.9 13.5L13.5 10.5C14.8 12 16.8 13 19 13V11C17.1 11 15.5 10 14.7 8.6L13.7 7C13.3 6.4 12.7 6 12 6C11.7 6 11.5 6.1 11.2 6.1L6 8.3V13H8V9.6L9.8 8.9Z" fill="currentColor"/>
  </svg>,
  <svg key="check" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3H5C3.9 3 3.01 3.9 3.01 5L3 19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="currentColor"/>
  </svg>,
];

export default function WelcomeLanding({ onQuickAction }: WelcomeLandingProps) {
  const { language } = useLanguage();
  const t = translations[language];

  // First 3 are primary (red buttons)
  const isPrimary = (index: number) => index < 3;

  return (
    <div className="flex flex-col items-center w-full max-w-[800px] mx-auto px-4" style={{ gap: '16px' }}>
      
      {/* Welcome Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full" style={{ padding: '24px 24px' }}>
        {/* Logo */}
        <div className="flex justify-center" style={{ marginBottom: '14px' }}>
          <div className="w-14 h-14 bg-[#a6192e] rounded-xl flex items-center justify-center shadow-md">
            <Image
              src="/logo.png"
              alt="ADA Clara Logo"
              width={32}
              height={32}
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* Welcome Text */}
        <h1 className="text-2xl font-semibold text-center text-gray-900" style={{ marginBottom: '16px' }}>
          {t.welcome.title}
        </h1>
        <p className="text-gray-600 text-center text-sm leading-relaxed m-0">
          {t.welcome.intro}
        </p>
      </div>

      {/* Medical Disclaimer - Separate */}
      <div className="bg-gradient-to-r from-[rgba(225,113,0,0.08)] to-[rgba(225,113,0,0.05)] border border-[rgba(225,113,0,0.2)] rounded-xl w-full" style={{ padding: '16px 20px' }}>
        <div className="flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="#e17100"/>
          </svg>
          <div>
            <h3 className="text-[#e17100] text-sm font-semibold mb-1">{t.disclaimer.title}</h3>
            <p className="text-xs text-gray-600 leading-relaxed m-0">
              {t.disclaimer.text} <strong>911</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Questions - No box */}
      <div className="w-full">
        <h2 className="text-base font-semibold text-gray-800 text-center" style={{ marginBottom: '16px' }}>
          {t.quickQuestions.title}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {t.quickQuestions.questions.map((q, index) => (
            <button
              key={index}
              onClick={() => onQuickAction(q.question)}
              className={`flex items-center gap-3 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm ${
                isPrimary(index)
                  ? 'bg-[#a6192e] text-white hover:bg-[#8a1526]'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
              style={{ padding: '14px 16px' }}
            >
              <span className={isPrimary(index) ? 'text-white/90' : 'text-[#a6192e]'}>
                {icons[index]}
              </span>
              <span className="text-sm font-medium">{q.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
