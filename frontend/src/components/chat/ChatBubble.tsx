import { MessageCircle, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { RAIL } from '@/contexts/FloatRailContext';

interface ChatBubbleProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly pos: { x: number; y: number };
  readonly isDragging: boolean;
  readonly onDragMouseDown: (e: MouseEvent) => void;
  readonly draggedRef: { current: boolean };
}

export function ChatBubble({ isOpen, onToggle, pos, isDragging, onDragMouseDown, draggedRef }: ChatBubbleProps) {
  const Icon = isOpen ? X : MessageCircle;

  return (
    <button
      className={`ss-chat-bubble${isDragging ? ' is-dragging' : ''}`}
      onMouseDown={onDragMouseDown}
      onClick={() => {
        if (draggedRef.current) return;
        onToggle();
      }}
      style={{ left: pos.x, top: pos.y, zIndex: RAIL.z.bubble }}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
    >
      <Icon size={22} />
    </button>
  );
}
