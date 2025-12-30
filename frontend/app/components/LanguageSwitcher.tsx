'use client';

import { useState } from 'react';

type Language = 'en' | 'es';

export default function LanguageSwitcher() {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');

  return (
    <div className="bg-white/10 rounded-[10px] flex" style={{ padding: '4px', height: '44px', gap: '0px', minWidth: '160px' }}>
      <button
        onClick={() => setSelectedLanguage('en')}
        className={`flex-1 rounded-lg text-sm transition-all flex items-center justify-center ${
          selectedLanguage === 'en'
            ? 'bg-white text-[#a6192e] font-medium shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]'
            : 'text-white/80 font-normal hover:text-white bg-transparent'
        }`}
        style={{ height: '36px', paddingLeft: '15px', paddingRight: '15px' }}
      >
        English
      </button>
      <button
        onClick={() => setSelectedLanguage('es')}
        className={`flex-1 rounded-lg text-sm transition-all flex items-center justify-center ${
          selectedLanguage === 'es'
            ? 'bg-white text-[#a6192e] font-medium shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]'
            : 'text-white/80 font-normal hover:text-white bg-transparent'
        }`}
        style={{ height: '36px', paddingLeft: '15px', paddingRight: '15px' }}
      >
        Español
      </button>
    </div>
  );
}

