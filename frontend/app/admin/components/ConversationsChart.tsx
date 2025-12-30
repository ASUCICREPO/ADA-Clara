'use client';

export default function ConversationsChart() {
  // Sample data - replace with actual data from your API
  const data = [
    { date: '12/15', conversations: 140 },
    { date: '12/16', conversations: 165 },
    { date: '12/17', conversations: 155 },
    { date: '12/18', conversations: 180 },
    { date: '12/19', conversations: 195 },
    { date: '12/20', conversations: 175 },
    { date: '12/21', conversations: 165 },
  ];

  const maxValue = 220;
  const yAxisSteps = [220, 165, 110, 55, 0]; // Top to bottom
  const chartWidth = 600;
  const chartHeight = 240;

  // Calculate points for the line
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * chartWidth;
    const y = ((maxValue - point.conversations) / maxValue) * chartHeight;
    return { x, y };
  });

  // Create path string for smooth line
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

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
            <path
              d={pathD}
              fill="none"
              stroke="#a6192e"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            {/* Draw the points */}
            {points.map((p, index) => (
              <circle
                key={index}
                cx={p.x}
                cy={p.y}
                r="8"
                fill="#a6192e"
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* X-axis labels */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between' }}>
            {data.map((point) => (
              <span key={point.date} className="text-[#64748b] text-xs font-normal">{point.date}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

