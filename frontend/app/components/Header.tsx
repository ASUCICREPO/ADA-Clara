'use client';

import LanguageSwitcher from './LanguageSwitcher';

export default function Header() {
  return (
    <header className="bg-[#a6192e] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] w-full flex-shrink-0" style={{ height: '80px' }}>
      <div className="max-w-[1440px] mx-auto h-full flex items-center" style={{ paddingLeft: '80px', paddingRight: '80px' }}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center flex-1 min-w-0" style={{ gap: '12px' }}>
            <div className="bg-white/10 rounded-[10px] w-12 h-12 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xl font-bold">C</span>
            </div>
            <h1 className="text-white text-xl font-normal m-0 truncate" style={{ lineHeight: '25px' }}>
              Clara – Call & Language Response Assistant
            </h1>
          </div>
          <div className="flex-shrink-0" style={{ marginLeft: '16px' }}>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}

