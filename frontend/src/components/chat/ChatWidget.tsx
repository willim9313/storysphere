import { useMemo } from 'react';
import { useChatContext } from '@/contexts/ChatContext';
import { useDraggable } from '@/hooks/useDraggable';
import { ChatBubble } from './ChatBubble';
import { ChatWindow, WINDOW_WIDTH, WINDOW_HEIGHT } from './ChatWindow';
import { RAIL, isOnRail, useRailOccupant } from '@/contexts/FloatRailContext';

const BUBBLE_SIZE = 48;
const MARGIN = RAIL.right;
const WINDOW_BUBBLE_GAP = RAIL.windowGap;

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

  // Floating rail occupancy: a bubble dragged off the rail releases its slot;
  // an open window over the rail makes the toast sit above it (R2/R3).
  useRailOccupant(
    'bubbleOnRail',
    isOnRail(pos.x, pos.y, BUBBLE_SIZE, window.innerWidth, window.innerHeight),
  );
  const { x: winX, y: winY } = windowPos;
  const chatWindow = useMemo(
    () => (isChatOpen ? { left: winX, top: winY, width: WINDOW_WIDTH, height: WINDOW_HEIGHT } : null),
    [isChatOpen, winX, winY],
  );
  useRailOccupant('chatWindow', chatWindow);

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
