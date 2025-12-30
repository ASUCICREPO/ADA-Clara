'use client';

import { useState } from 'react';

export default function AdminHeader() {
  const [timeFilter, setTimeFilter] = useState('All Time');

  return (
    <div className="bg-[#a6192e] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] w-full flex-shrink-0" style={{ height: '70px' }}>
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
            <h1 className="text-white text-2xl font-normal m-0 truncate">Clara – Admin Dashboard</h1>
          </div>
        
          <div className="flex items-center flex-shrink-0" style={{ gap: '16px' }}>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="border border-white/20 rounded-[10px] text-xs text-[#a6192e] bg-white focus:outline-none focus:ring-2 focus:ring-white/20"
            style={{ height: '36px', minWidth: '110px', paddingLeft: '12px', paddingRight: '32px' }}
          >
            <option value="All Time">All Time</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
          
          <div className="flex items-center bg-white border border-white/20 rounded-full" style={{ gap: '8px', height: '36px', paddingLeft: '12px', paddingRight: '12px' }}>
            <div className="w-6 h-6 bg-[#a6192e] rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" fill="white"/>
                <path d="M8 9C5.79086 9 4 10.7909 4 13V14H12V13C12 10.7909 10.2091 9 8 9Z" fill="white"/>
              </svg>
            </div>
            <span className="text-[#a6192e] text-xs font-normal">Admin</span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

