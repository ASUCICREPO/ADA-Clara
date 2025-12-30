'use client';

export default function QuestionsLists() {
  const frequentlyAsked = [
    'What are the symptoms of diabetes?',
    'How can I test my blood sugar at home?',
    'What foods should I avoid if I have diabetes?',
    'How often should I check my blood sugar?',
    'What is the difference between type 1 and type 2 diabetes?',
  ];

  const unansweredQuestions = [
    'Can you help me schedule a doctor appointment?',
    'Can you prescribe medication for me?',
    'What is the best insulin pump for me?',
    'Can you review my medical records?',
    'How do I get a medical marijuana card?',
  ];

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Frequently Asked Questions */}
        <div>
          <h2 className="text-[#a6192e] text-lg font-normal m-0" style={{ marginBottom: '16px' }}>
            Frequently Asked Questions
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {frequentlyAsked.map((question, index) => (
              <li key={index} className="text-[#020617] text-sm font-normal" style={{ paddingLeft: '20px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, top: '6px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#a6192e' }}></span>
                {question}
              </li>
            ))}
          </ul>
        </div>

        {/* Top Unanswered Questions */}
        <div>
          <h2 className="text-[#a6192e] text-lg font-normal m-0" style={{ marginBottom: '16px' }}>
            Top Unanswered Questions
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {unansweredQuestions.map((question, index) => (
              <li key={index} className="text-[#020617] text-sm font-normal" style={{ paddingLeft: '20px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, top: '6px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#a6192e' }}></span>
                {question}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

