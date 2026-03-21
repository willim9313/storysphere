import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import type { ChatMessage as ChatMessageType } from '@/hooks/useWebSocketChat';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
          background: isUser ? 'var(--accent)' : 'var(--bg-secondary)',
          color: isUser ? 'white' : 'var(--fg-primary)',
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          message.content
        ) : (
          <MarkdownRenderer content={message.content} compact />
        )}
      </div>
    </div>
  );
}
