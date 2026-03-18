import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownRenderer({ content, className, compact }: { content: string; className?: string; compact?: boolean }) {
  return (
    <div
      className={`prose max-w-none ${compact ? '' : 'prose-sm'} ${className ?? ''}`}
      style={{
        fontFamily: 'var(--font-serif)',
        color: 'var(--fg-primary)',
        lineHeight: compact ? 1.6 : 1.8,
        fontSize: compact ? '0.75rem' : undefined,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
