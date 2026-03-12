import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none"
      style={{
        fontFamily: 'var(--font-serif)',
        color: 'var(--color-text)',
        lineHeight: 1.8,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
