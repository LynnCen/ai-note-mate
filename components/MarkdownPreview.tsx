"use client";

import ReactMarkdown from "react-markdown";

export interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with basic prose-style classes.
 * Used in the note detail page "Preview" tab.
 */
export function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <p className={`text-muted-foreground ${className}`.trim()}>
        暂无内容，在「编辑」中填写后即可预览。
      </p>
    );
  }

  return (
    <div
      className={`markdown-preview min-h-[200px] rounded-lg border border-border bg-card px-3 py-3 text-foreground ${className}`.trim()}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-lg font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-base font-medium">{children}</h3>,
          p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-6">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-sm">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
