'use client';

export default function FrequentlyAskedQuestions() {
  const questions = [
    'What are the symptoms of diabetes?',
    'How can I test my blood sugar at home?',
    'What foods should I avoid with diabetes?',
    'How often should I check my blood sugar?',
    'What is a normal blood sugar level?',
  ];

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px', height: '100%' }}>
      <h2 className="text-[#a6192e] text-lg font-medium m-0" style={{ marginBottom: '16px' }}>
        Frequently Asked Questions
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

