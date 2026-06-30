import { useChatContext } from '@/contexts/ChatContext';
import { useDraggable } from '@/hooks/useDraggable';
import { ChatBubble } from './ChatBubble';
import { ChatWindow, WINDOW_WIDTH, WINDOW_HEIGHT } from './ChatWindow';

const BUBBLE_SIZE = 48;
const MARGIN = 24;
const WINDOW_BUBBLE_GAP = 8;

export function ChatWidget() {
  const { isChatOpen, openChat, closeChat, ws, pageContext, prefillMessage, clearPrefill } =
    useChatContext();

  // Single anchor = bubble top-left. Window is rendered above-left of bubble.
  const { pos, isDragging, dragHandleProps, draggedRef } = useDraggable({
    storageKey: 'chat-widget-pos',
    defaultPos: () => ({
      x: window.innerWidth - BUBBLE_SIZE - MARGIN,
      y: window.innerHeight - BUBBLE_SIZE - MARGIN,
    }),
    elementWidth: BUBBLE_SIZE,
    elementHeight: BUBBLE_SIZE,
  });

  // Derive window position from bubble anchor, clamped to stay on-screen
  const windowPos = {
    x: Math.max(8, Math.min(pos.x + BUBBLE_SIZE - WINDOW_WIDTH, window.innerWidth - WINDOW_WIDTH - 8)),
    y: Math.max(8, pos.y - WINDOW_HEIGHT - WINDOW_BUBBLE_GAP),
  };

  return (
    <>
      {isChatOpen && (
        <ChatWindow
          ws={ws}
          pageContext={pageContext}
          prefillMessage={prefillMessage}
          clearPrefill={clearPrefill}
          pos={windowPos}
          isDragging={isDragging}
          onDragMouseDown={dragHandleProps.onMouseDown}
        />
      )}
      <ChatBubble
        isOpen={isChatOpen}
        onToggle={() => (isChatOpen ? closeChat() : openChat())}
        pos={pos}
        isDragging={isDragging}
        onDragMouseDown={dragHandleProps.onMouseDown}
        draggedRef={draggedRef}
      />
    </>
  );
}
