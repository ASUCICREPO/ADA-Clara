'use client';

type MessageType = 'user' | 'assistant';

interface ChatMessageProps {
  type: MessageType;
  content: string;
  sender?: string;
}

export default function ChatMessage({ type, content, sender = 'Clara' }: ChatMessageProps) {
  if (type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#a6192e] text-white rounded-2xl max-w-[306px] break-words" style={{ padding: '16px' }}>
          <p className="text-sm font-normal whitespace-pre-wrap m-0" style={{ lineHeight: '20px', color: 'white' }}>{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-white border-2 border-[rgba(166,25,46,0.2)] rounded-2xl shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] max-w-[700px] break-words" style={{ padding: '16px' }}>
        <p className="text-[#a6192e] text-xs font-normal m-0 mb-1" style={{ lineHeight: '16px' }}>{sender}</p>
        <p className="text-[#020617] text-sm font-normal whitespace-pre-wrap m-0" style={{ lineHeight: '20px' }}>{content}</p>
      </div>
    </div>
  );
}

