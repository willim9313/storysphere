import { MessageCircle, X } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';

export function ChatBubble() {
  const { isChatOpen, openChat, closeChat } = useChatContext();

  return (
    <button
      onClick={() => (isChatOpen ? closeChat() : openChat())}
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
      aria-label={isChatOpen ? 'Close chat' : 'Open chat'}
    >
      {isChatOpen ? <X size={22} /> : <MessageCircle size={22} />}
    </button>
  );
}
