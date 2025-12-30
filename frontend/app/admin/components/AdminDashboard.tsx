'use client';

import AdminHeader from './AdminHeader';
import MetricCards from './MetricCards';
import ConversationsChart from './ConversationsChart';
import LanguageSplitChart from './LanguageSplitChart';
import EscalationRequestsTable from './EscalationRequestsTable';
import FrequentlyAskedQuestions from './FrequentlyAskedQuestions';
import TopUnansweredQuestions from './TopUnansweredQuestions';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Main Header */}
      <AdminHeader />
      
      {/* Red Separator Line */}
      <div className="bg-[#a6192e] w-full" style={{ height: '2px' }}></div>
      
      {/* Main Content Area */}
      <div className="bg-[#f8fafc] w-full" style={{ padding: '32px 80px', paddingBottom: '48px' }}>
        <div className="max-w-[1440px] mx-auto">
          <div style={{ marginBottom: '32px' }}>
            <MetricCards />
          </div>

          <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <ConversationsChart />
            <LanguageSplitChart />
          </div>

          {/* Escalation Requests - Full Width */}
          <div style={{ marginBottom: '32px' }}>
            <EscalationRequestsTable />
          </div>

          {/* FAQ and Top Unanswered - Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <FrequentlyAskedQuestions />
            <TopUnansweredQuestions />
          </div>
        </div>
      </div>
    </div>
  );
}

