'use client';

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  trend: string;
  trendPositive: boolean;
  icon: React.ReactNode;
}

function MetricCard({ title, value, description, trend, trendPositive, icon }: MetricCardProps) {
  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
          {/* Top row: Title on left, Icon on right */}
          <div className="flex items-start justify-between">
            <p className="text-[#020617] text-sm font-semibold m-0">{title}</p>
        <div className="bg-[#fef2f2] rounded-[10px] w-10 h-10 flex items-center justify-center flex-shrink-0">
          <div className="text-[#a6192e]">
            {icon}
          </div>
        </div>
      </div>
      
      {/* Middle: Value */}
      <p className="text-[#a6192e] text-3xl font-bold m-0">{value}</p>
      
      {/* Bottom row: Description on left, Trend on right */}
      <div className="flex items-end justify-between">
        <p className="text-[#64748b] text-xs font-normal m-0">{description}</p>
        <div className="flex items-center" style={{ gap: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 10L6 6L9 9L14 4" stroke={trendPositive ? '#16a34a' : '#dc2626'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 4H14V8" stroke={trendPositive ? '#16a34a' : '#dc2626'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className={`text-sm font-normal ${trendPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MetricCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
      {/* First two cards - aligned with Conversations Over Time chart */}
      <div className="flex" style={{ gap: '24px' }}>
        <MetricCard
          title="Total Conversations"
          value="1,234"
          description="in selected date range"
          trend="+12%"
          trendPositive={true}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor" />
            </svg>
          }
        />
        <MetricCard
          title="Escalation Rate"
          value="18%"
          description="Conversations escalated to human"
          trend="+6%"
          trendPositive={true}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="currentColor" />
            </svg>
          }
        />
      </div>
      
      {/* Third card - aligned with Language Split chart */}
      <MetricCard
        title="Out-of-Scope Rate"
        value="7%"
        description="Questions not answered"
        trend="+2%"
        trendPositive={true}
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor" />
          </svg>
        }
      />
    </div>
  );
}

