import { MessageCircle, X } from 'lucide-react';

interface ChatBubbleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatBubble({ isOpen, onToggle }: ChatBubbleProps) {
  const Icon = isOpen ? X : MessageCircle;

  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-lg)',
        transition: 'transform var(--transition-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
    >
      <Icon size={22} />
    </button>
  );
}
