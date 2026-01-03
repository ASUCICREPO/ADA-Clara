'use client';

import { useFrequentlyAskedQuestions } from '../hooks/useAdminData';

export default function FrequentlyAskedQuestions() {
  const { data, loading, error } = useFrequentlyAskedQuestions();
  
  const questions = data?.questions?.map(q => q.question) || [];

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '16px' }}>
      <div className="bg-[#f8fafc] rounded-[10px] mb-4" style={{ padding: '12px 16px' }}>
        <h2 className="text-[#a6192e] text-lg font-medium m-0">
          Frequently Asked Questions
        </h2>
      </div>
      {loading && <div className="animate-pulse py-4">Loading...</div>}
      {error && <div className="text-red-600 py-4">Error: {error}</div>}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {questions.length === 0 ? (
            <div className="text-[#64748b] text-sm py-4">No questions available</div>
          ) : (
            questions.map((question, index) => (
              <div key={index}>
                <div className="text-[#020617] text-sm font-normal" style={{ padding: '12px 0' }}>
                  {question}
                </div>
                {index < questions.length - 1 && (
                  <div style={{ borderBottom: '1px solid #e2e8f0', marginLeft: '0', marginRight: '0' }}></div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

