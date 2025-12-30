'use client';

import LanguageSwitcher from './LanguageSwitcher';

export default function Header() {
  return (
    <header className="bg-[#a6192e] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] w-full flex-shrink-0" style={{ height: '70px' }}>
      <div className="max-w-[1440px] mx-auto h-full flex items-center" style={{ paddingLeft: '80px', paddingRight: '80px' }}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center flex-1 min-w-0" style={{ gap: '10px' }}>
            <div className="bg-white/10 rounded-[8px] w-10 h-10 flex items-center justify-center flex-shrink-0 p-1.5">
              <img 
                src="/logo.png" 
                alt="ADA Clara Logo" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div className="flex flex-col justify-center" style={{ height: '40px', minWidth: 0 }}>
              <h1 className="text-white text-xl font-semibold m-0 truncate" style={{ lineHeight: '24px' }}>
                ADA Clara
              </h1>
              <p className="text-white text-sm font-normal m-0 truncate" style={{ lineHeight: '16px' }}>
                Call & Language Response Assistant
              </p>
            </div>
          </div>
          <div className="flex-shrink-0" style={{ marginLeft: '16px' }}>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}

