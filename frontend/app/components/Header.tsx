'use client';

import LanguageSwitcher from './LanguageSwitcher';

export default function Header() {
  return (
    <header className="bg-[#a6192e] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] w-full flex-shrink-0" style={{ height: '70px' }}>
      <div className="max-w-[1440px] mx-auto h-full flex items-center" style={{ paddingLeft: '80px', paddingRight: '80px' }}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center flex-1 min-w-0" style={{ gap: '10px' }}>
            <div className="bg-white/10 rounded-[8px] w-10 h-10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z" fill="white"/>
                <path d="M7 9H17V11H7V9ZM7 12H15V14H7V12Z" fill="white"/>
              </svg>
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

