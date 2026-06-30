import { MessageCircle, X } from 'lucide-react';
import type { MouseEvent } from 'react';

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
      onMouseDown={onDragMouseDown}
      onClick={() => {
        if (draggedRef.current) return;
        onToggle();
      }}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'white',
        border: 'none',
        cursor: isDragging ? 'grabbing' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-lg)',
        transition: isDragging ? 'none' : 'transform var(--transition-fast)',
      }}
      onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
    >
      <Icon size={22} />
    </button>
  );
}
