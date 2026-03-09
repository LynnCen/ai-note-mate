"use client";

import ReactMarkdown from "react-markdown";

interface AgentMarkdownProps {
  content: string;
  className?: string;
}

export function AgentMarkdown({ content, className = "" }: AgentMarkdownProps) {
  return (
    <div className={`agent-markdown text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-2.5 mb-1 text-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 mb-0.5 text-sm font-medium">{children}</h3>,
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-1.5 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-1.5 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          code: ({ children, className: cls }) => {
            const isBlock = cls?.startsWith("language-");
            return isBlock ? (
              <code className={`block font-mono text-xs ${cls ?? ""}`}>{children}</code>
            ) : (
              <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-border pl-3 italic text-muted-foreground">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-primary underline hover:no-underline">{children}</a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          hr: () => <hr className="my-2 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
