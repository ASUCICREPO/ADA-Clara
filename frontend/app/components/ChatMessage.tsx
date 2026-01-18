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

  // Filter sources to only show diabetes.org URLs (not S3 URIs) and deduplicate
  const displaySources = sources?.filter(s => s.url?.startsWith('https://diabetes.org')) || [];
  const uniqueSources = displaySources.reduce((acc: ChatSource[], current) => {
    const exists = acc.find(item => item.url === current.url);
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);

  // Extract domain-friendly title from URL
  const getCleanTitle = (url: string, title: string) => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        // Get last meaningful part of path
        const lastPart = pathParts[pathParts.length - 1];
        return lastPart
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
      }
      return title || 'diabetes.org';
    } catch {
      return title || 'diabetes.org';
    }
  };

  return (
    <div className="flex justify-start">
      <div 
        className="rounded-2xl max-w-[720px] break-words"
        style={{ 
          background: 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
          border: '1px solid rgba(166, 25, 46, 0.12)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Header with sender name */}
        <div 
          style={{ 
            padding: '12px 20px',
            borderBottom: '1px solid rgba(166, 25, 46, 0.08)',
            background: 'linear-gradient(135deg, rgba(166, 25, 46, 0.03) 0%, rgba(166, 25, 46, 0.01) 100%)',
            borderRadius: '16px 16px 0 0',
          }}
        >
          <div className="flex items-center gap-2">
            <div 
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #a6192e 0%, #8a1526 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(166, 25, 46, 0.2)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
            <span style={{ 
              color: '#a6192e', 
              fontSize: '13px', 
              fontWeight: 600,
              letterSpacing: '0.01em',
            }}>
              {sender}
            </span>
          </div>
        </div>
        
        {/* Content area */}
        <div style={{ padding: '20px' }}>
          {/* Markdown rendered content */}
          <div 
            className="prose prose-sm max-w-none"
            style={{ 
              color: '#1e293b',
              fontSize: '14.5px',
              lineHeight: '1.7',
            }}
          >
            <ReactMarkdown
              components={{
                // Style headings
                h1: ({ children }) => (
                  <h1 style={{ 
                    fontSize: '20px', 
                    fontWeight: 700, 
                    color: '#0f172a',
                    marginTop: '0',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '2px solid rgba(166, 25, 46, 0.1)',
                  }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ 
                    fontSize: '17px', 
                    fontWeight: 600, 
                    color: '#1e293b',
                    marginTop: '20px',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      width: '4px',
                      height: '18px',
                      background: 'linear-gradient(180deg, #a6192e 0%, #d4364d 100%)',
                      borderRadius: '2px',
                      display: 'inline-block',
                    }}></span>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ 
                    fontSize: '15px', 
                    fontWeight: 600, 
                    color: '#334155',
                    marginTop: '16px',
                    marginBottom: '8px',
                  }}>
                    {children}
                  </h3>
                ),
                // Style paragraphs
                p: ({ children }) => (
                  <p style={{ 
                    fontSize: '14.5px',
                    color: '#334155',
                    marginTop: '0',
                    marginBottom: '10px',
                    lineHeight: '1.75',
                  }}>
                    {children}
                  </p>
                ),
                // Style lists
                ul: ({ children }) => (
                  <ul style={{ 
                    marginTop: '12px',
                    marginBottom: '12px',
                    paddingLeft: '0',
                    listStyle: 'none',
                  }}>
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ 
                    marginTop: '12px',
                    marginBottom: '12px',
                    paddingLeft: '24px',
                    listStyleType: 'decimal',
                  }}>
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li style={{ 
                    fontSize: '14.5px',
                    color: '#334155',
                    lineHeight: '1.7',
                    marginBottom: '8px',
                    paddingLeft: '24px',
                    position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: '0',
                      top: '8px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a6192e 0%, #d4364d 100%)',
                    }}></span>
                    {children}
                  </li>
                ),
                // Style bold/strong
                strong: ({ children }) => (
                  <strong style={{ 
                    fontWeight: 600, 
                    color: '#0f172a',
                  }}>
                    {children}
                  </strong>
                ),
                // Style emphasis/italic
                em: ({ children }) => (
                  <em style={{ 
                    fontStyle: 'italic',
                    color: '#475569',
                  }}>
                    {children}
                  </em>
                ),
                // Style links
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{
                      color: '#a6192e',
                      textDecoration: 'none',
                      borderBottom: '1px solid rgba(166, 25, 46, 0.3)',
                      transition: 'border-color 0.2s ease',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#a6192e'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(166, 25, 46, 0.3)'}
                  >
                    {children}
                  </a>
                ),
                // Style code
                code: ({ children }) => (
                  <code style={{
                    backgroundColor: '#f1f5f9',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontFamily: 'ui-monospace, monospace',
                    color: '#a6192e',
                  }}>
                    {children}
                  </code>
                ),
                // Style blockquotes
                blockquote: ({ children }) => (
                  <blockquote style={{
                    borderLeft: '3px solid #a6192e',
                    paddingLeft: '16px',
                    marginLeft: '0',
                    marginTop: '16px',
                    marginBottom: '16px',
                    fontStyle: 'italic',
                    color: '#64748b',
                    background: 'rgba(166, 25, 46, 0.02)',
                    padding: '12px 16px',
                    borderRadius: '0 8px 8px 0',
                  }}>
                    {children}
                  </blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Sources section */}
        {uniqueSources.length > 0 && (
          <div 
            style={{ 
              padding: '16px 20px',
              borderTop: '1px solid rgba(166, 25, 46, 0.08)',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              borderRadius: '0 0 16px 16px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
              </svg>
              <span style={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Sources
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {uniqueSources.slice(0, 3).map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#475569',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#a6192e';
                    e.currentTarget.style.color = '#a6192e';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(166, 25, 46, 0.12)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
                  }}
                  title={source.url}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <span style={{ 
                    maxWidth: '180px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}>
                    {getCleanTitle(source.url, source.title)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
