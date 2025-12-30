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
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {questions.map((question, index) => (
          <li key={index} className="text-[#020617] text-sm font-normal" style={{ paddingLeft: '20px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: '6px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#a6192e' }}></span>
            {question}
          </li>
        ))}
      </ul>
    </div>
  );
}

