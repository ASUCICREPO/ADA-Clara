'use client';

import { useConversationChart } from '../hooks/useAdminData';

export default function ConversationsChart() {
  const { data, loading, error } = useConversationChart();
  
  if (loading) {
    return (
      <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%' }}>
        <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Conversations Over Time</h2>
        <div className="animate-pulse">Loading chart data...</div>
      </div>
    );
  }

  if (error || !data || !data.data || data.data.length === 0) {
    return (
      <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%' }}>
        <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Conversations Over Time</h2>
        <div className="text-red-600">Error loading chart: {error || 'No data available'}</div>
      </div>
    );
  }

  const chartData = data.data;
  
  // Calculate max value dynamically
  const maxConversations = Math.max(...chartData.map(d => d.conversations), 0);
  const maxValue = Math.ceil(maxConversations * 1.1); // Add 10% padding
  const yAxisSteps = [maxValue, Math.floor(maxValue * 0.75), Math.floor(maxValue * 0.5), Math.floor(maxValue * 0.25), 0];
  const chartWidth = 600;
  const chartHeight = 240;

  // Calculate points for the line
  const points = chartData.map((point, index) => {
    const x = (index / (chartData.length - 1 || 1)) * chartWidth;
    const y = ((maxValue - point.conversations) / (maxValue || 1)) * chartHeight;
    return { x, y };
  });


  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%' }}>
      <h2 className="text-[#020617] text-lg font-medium m-0" style={{ marginBottom: '24px' }}>Conversations Over Time</h2>
      
      <div style={{ position: 'relative', height: '300px' }}>
        {/* Y-axis labels */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: '30px', width: '35px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {yAxisSteps.map((step) => (
            <span key={step} className="text-[#64748b] text-xs font-normal text-right">{step}</span>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ marginLeft: '45px', position: 'relative', height: '270px' }}>
          {/* Grid lines - dashed */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {yAxisSteps.map((step) => (
              <div key={step} style={{ borderTop: '1px dashed #e2e8f0', width: '100%' }}></div>
            ))}
          </div>

          {/* SVG for line chart */}
          <svg 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 'calc(100% - 30px)', overflow: 'visible' }}
          >
            {/* Draw the line */}
            <polyline
              fill="none"
              stroke="#a6192e"
              strokeWidth="2"
              points={points.map(p => `${p.x},${p.y}`).join(' ')}
            />
            {/* Draw the points */}
            {points.map((p, index) => (
              <circle
                key={index}
                cx={p.x}
                cy={p.y}
                r="6"
                fill="#a6192e"
                stroke="white"
                strokeWidth="2"
              />
            ))}
          </svg>

          {/* X-axis labels */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between' }}>
            {chartData.map((point) => (
              <span key={point.date} className="text-[#64748b] text-xs font-normal">{point.date}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

