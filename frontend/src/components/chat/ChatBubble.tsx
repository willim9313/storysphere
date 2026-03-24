import { MessageCircle, X, Bot } from 'lucide-react';

interface ChatBubbleProps {
  side?: 'left' | 'right';
  accentColor?: string;
  isOpen: boolean;
  onToggle: () => void;
  icon?: 'message' | 'bot';
}

export function ChatBubble({
  side = 'right',
  accentColor = 'var(--accent)',
  isOpen,
  onToggle,
  icon = 'message',
}: ChatBubbleProps) {
  const Icon = isOpen ? X : icon === 'bot' ? Bot : MessageCircle;

  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        ...(side === 'right' ? { right: '1.5rem' } : { left: '1.5rem' }),
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: accentColor,
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
