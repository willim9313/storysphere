import { useChatContext } from '@/contexts/ChatContext';
import { ChatBubble } from './ChatBubble';
import { ChatWindow } from './ChatWindow';

export function ChatWidget() {
  const { isChatOpen, openChat, closeChat, ws, pageContext, prefillMessage, clearPrefill } =
    useChatContext();

  return (
    <>
      {isChatOpen && (
        <ChatWindow
          ws={ws}
          pageContext={pageContext}
          prefillMessage={prefillMessage}
          clearPrefill={clearPrefill}
        />
      )}
      <ChatBubble
        isOpen={isChatOpen}
        onToggle={() => (isChatOpen ? closeChat() : openChat())}
      />
    </>
  );
}
