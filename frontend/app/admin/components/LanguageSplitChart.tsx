'use client';

import { useLanguageSplit } from '../hooks/useAdminData';

export default function LanguageSplitChart() {
  const { data, loading, error } = useLanguageSplit();
  
  if (loading) {
    return (
      <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Language Split</h2>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Language Split</h2>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-600">Error: {error || 'Failed to load data'}</div>
        </div>
      </div>
    );
  }

  const englishPercent = data.english || 0;
  const spanishPercent = data.spanish || 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const englishLength = (englishPercent / 100) * circumference;
  const spanishLength = (spanishPercent / 100) * circumference;

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Language Split</h2>
      
      <div className="flex flex-col items-center justify-center flex-1" style={{ gap: '24px' }}>
        {/* Donut Chart - no center text */}
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
            {/* English segment (70%) - red */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#a6192e"
              strokeWidth="35"
              strokeDasharray={`${englishLength} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Spanish segment (30%) - grey */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#64748b"
              strokeWidth="35"
              strokeDasharray={`${spanishLength} ${circumference}`}
              strokeDashoffset={-englishLength}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Legend - horizontal */}
        <div className="flex items-center justify-center" style={{ gap: '32px' }}>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#a6192e' }}></div>
            <span className="text-[#a6192e] text-sm font-normal">English – {englishPercent}%</span>
          </div>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#64748b' }}></div>
            <span className="text-[#64748b] text-sm font-normal">Spanish – {spanishPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

