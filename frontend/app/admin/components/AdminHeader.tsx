'use client';

import { useState } from 'react';

export default function AdminHeader() {
  const [timeFilter, setTimeFilter] = useState('All Time');

  return (
    <div className="bg-white w-full" style={{ padding: '24px 80px' }}>
      <div className="max-w-[1440px] mx-auto flex items-center justify-between">
        <h1 className="text-[#a6192e] text-2xl font-normal m-0">Clara – Admin Dashboard</h1>
        
        <div className="flex items-center" style={{ gap: '16px' }}>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="border border-[#cbd5e1] rounded-[10px] text-xs text-[#020617] bg-white focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
            style={{ height: '36px', minWidth: '110px', paddingLeft: '12px', paddingRight: '32px' }}
          >
            <option value="All Time">All Time</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
          
          <div className="flex items-center bg-white border border-[#e2e8f0] rounded-full" style={{ gap: '8px', height: '36px', paddingLeft: '12px', paddingRight: '12px' }}>
            <div className="w-6 h-6 bg-[#a6192e] rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" fill="white"/>
                <path d="M8 9C5.79086 9 4 10.7909 4 13V14H12V13C12 10.7909 10.2091 9 8 9Z" fill="white"/>
              </svg>
            </div>
            <span className="text-[#020617] text-xs font-normal">Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}

