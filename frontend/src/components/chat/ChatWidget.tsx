import { useChatContext } from '@/contexts/ChatContext';
import { ChatBubble } from './ChatBubble';
import { ChatWindow } from './ChatWindow';

export function ChatWidget() {
  const {
    isChatOpen, openChat, closeChat, ws, pageContext, prefillMessage, clearPrefill,
    isDeepChatOpen, openDeepChat, closeDeepChat, deepWs, deepPrefillMessage, clearDeepPrefill,
  } = useChatContext();

  return (
    <>
      {/* Right side — original LangGraph agent */}
      {isChatOpen && (
        <ChatWindow
          side="right"
          title="StorySphere Chat"
          ws={ws}
          pageContext={pageContext}
          prefillMessage={prefillMessage}
          clearPrefill={clearPrefill}
        />
      )}
      <ChatBubble
        side="right"
        isOpen={isChatOpen}
        onToggle={() => (isChatOpen ? closeChat() : openChat())}
      />

      {/* Left side — DeepAgent */}
      {isDeepChatOpen && (
        <ChatWindow
          side="left"
          title="DeepAgent Chat"
          accentColor="#7c3aed"
          ws={deepWs}
          pageContext={pageContext}
          prefillMessage={deepPrefillMessage}
          clearPrefill={clearDeepPrefill}
        />
      )}
      <ChatBubble
        side="left"
        accentColor="#7c3aed"
        isOpen={isDeepChatOpen}
        onToggle={() => (isDeepChatOpen ? closeDeepChat() : openDeepChat())}
        icon="bot"
      />
    </>
  );
}
