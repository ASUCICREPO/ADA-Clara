'use client';

export default function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border-2 border-[rgba(166,25,46,0.2)] rounded-2xl shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]" style={{ padding: '16px 20px' }}>
        <div className="flex items-center gap-1">
          <div 
            className="w-2 h-2 bg-[#a6192e] rounded-full animate-bounce"
            style={{ animationDelay: '0ms', animationDuration: '600ms' }}
          />
          <div 
            className="w-2 h-2 bg-[#a6192e] rounded-full animate-bounce"
            style={{ animationDelay: '150ms', animationDuration: '600ms' }}
          />
          <div 
            className="w-2 h-2 bg-[#a6192e] rounded-full animate-bounce"
            style={{ animationDelay: '300ms', animationDuration: '600ms' }}
          />
        </div>
      </div>
    </div>
  );
}

