'use client';

import ReactMarkdown from 'react-markdown';

type MessageType = 'user' | 'assistant';

interface ChatSource {
  url: string;
  title: string;
  excerpt?: string;
  relevanceScore?: number;
}

interface ChatMessageProps {
  type: MessageType;
  content: string;
  sender?: string;
  sources?: ChatSource[];
}

export default function ChatMessage({ type, content, sender = 'Clara', sources }: ChatMessageProps) {
  if (type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#a6192e] text-white rounded-2xl max-w-[306px] break-words" style={{ padding: '16px' }}>
          <p className="text-sm font-normal whitespace-pre-wrap m-0" style={{ lineHeight: '20px', color: 'white' }}>{content}</p>
        </div>
      </div>
    );
  }

  // Filter sources to only show diabetes.org URLs (not S3 URIs)
  const displaySources = sources?.filter(s => s.url?.startsWith('https://diabetes.org')) || [];

  return (
    <div className="flex justify-start">
      <div className="bg-white border-2 border-[rgba(166,25,46,0.2)] rounded-2xl shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] max-w-[700px] break-words" style={{ padding: '16px' }}>
        <p className="text-[#a6192e] text-xs font-normal m-0 mb-1" style={{ lineHeight: '16px' }}>{sender}</p>
        
        {/* Markdown rendered content */}
        <div className="text-[#020617] text-sm font-normal prose prose-sm max-w-none" style={{ lineHeight: '20px' }}>
          <ReactMarkdown
            components={{
              // Style headings
              h1: ({ children }) => <h1 className="text-lg font-semibold text-[#020617] mt-3 mb-2 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-semibold text-[#020617] mt-3 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-[#020617] mt-2 mb-1">{children}</h3>,
              // Style paragraphs
              p: ({ children }) => <p className="text-sm text-[#020617] my-2 first:mt-0 last:mb-0" style={{ lineHeight: '22px' }}>{children}</p>,
              // Style lists
              ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-sm text-[#020617]" style={{ lineHeight: '22px' }}>{children}</li>,
              // Style bold/strong
              strong: ({ children }) => <strong className="font-semibold text-[#020617]">{children}</strong>,
              // Style links
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#a6192e] hover:underline">
                  {children}
                </a>
              ),
              // Style code
              code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>,
              // Style blockquotes
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-[#a6192e] pl-3 my-2 italic text-gray-600">
                  {children}
                </blockquote>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {/* Sources section */}
        {displaySources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Sources:</p>
            <div className="flex flex-wrap gap-2">
              {displaySources.slice(0, 3).map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded-md text-xs text-[#a6192e] hover:text-[#8a1526] transition-colors"
                  title={source.title}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span className="truncate max-w-[150px]">{source.title || 'diabetes.org'}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
