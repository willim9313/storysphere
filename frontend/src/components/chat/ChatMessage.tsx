import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import type { ChatMessage as ChatMessageType } from '@/hooks/useWebSocketChat';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`ss-chat-row${isUser ? ' is-user' : ''}`}>
      <div className={`ss-chat-msg${isUser ? ' is-user' : ''}`}>
        {isUser ? (
          message.content
        ) : (
          <MarkdownRenderer content={message.content} compact />
        )}
      </div>
    </div>
  );
}
