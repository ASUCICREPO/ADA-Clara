'use client';

export default function TopUnansweredQuestions() {
  const questions = [
    'Can you help me schedule a doctor appointment?',
    'What insurance plans do you accept?',
    'How do I apply for financial assistance programs?',
    'Can you prescribe medication for me?',
    'Where is the nearest diabetes clinic?',
  ];

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%' }}>
      <h2 className="text-[#a6192e] text-lg font-medium m-0" style={{ marginBottom: '16px' }}>
        Top Unanswered Questions
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {questions.map((question, index) => (
          <div key={index}>
            <div className="text-[#020617] text-sm font-normal" style={{ padding: '12px 0' }}>
              {question}
            </div>
            {index < questions.length - 1 && (
              <div style={{ borderBottom: '1px solid #e2e8f0' }}></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

