'use client';

import { useLanguage } from '../context/LanguageContext';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="bg-white/10 rounded-[8px] flex" style={{ padding: '3px', height: '38px', gap: '0px', minWidth: '150px' }}>
      <button
        onClick={() => setLanguage('en')}
        className={`flex-1 rounded-lg text-xs transition-all flex items-center justify-center ${
          language === 'en'
            ? 'bg-white text-[#a6192e] font-medium shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]'
            : 'text-white/80 font-normal hover:text-white bg-transparent'
        }`}
        style={{ height: '32px', paddingLeft: '12px', paddingRight: '12px' }}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('es')}
        className={`flex-1 rounded-lg text-xs transition-all flex items-center justify-center ${
          language === 'es'
            ? 'bg-white text-[#a6192e] font-medium shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]'
            : 'text-white/80 font-normal hover:text-white bg-transparent'
        }`}
        style={{ height: '32px', paddingLeft: '12px', paddingRight: '12px' }}
      >
        Español
      </button>
    </div>
  );
}

