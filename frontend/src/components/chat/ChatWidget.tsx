import { useChatContext } from '@/contexts/ChatContext';
import { ChatBubble } from './ChatBubble';
import { ChatWindow } from './ChatWindow';

export function ChatWidget() {
  const { isChatOpen } = useChatContext();

  return (
    <>
      {isChatOpen && <ChatWindow />}
      <ChatBubble />
    </>
  );
}
