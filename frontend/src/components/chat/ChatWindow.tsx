import { useState, useEffect, useRef } from 'react';
import { SquarePen } from 'lucide-react';
import { useChatContext } from '@/contexts/ChatContext';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

const SUGGESTED_PROMPTS: Record<string, (entity?: string) => string[]> = {
  graph: (entity) =>
    entity
      ? [`${entity} 是誰？`, `${entity} 的關係網？`, '這本書的主要角色有哪些？']
      : ['這本書的主要角色有哪些？', '最重要的事件是什麼？'],
  reader: () => ['總結這一章', '這章的重要角色？', '這章發生了什麼事件？'],
  analysis: (entity) =>
    entity
      ? [`深入分析 ${entity}`, `${entity} 的角色原型？`]
      : ['這本書的主要角色有哪些？'],
  library: () => ['推薦我先分析哪本書？'],
};

function ContextBadge() {
  const { pageContext } = useChatContext();
  const { page, bookTitle, chapterTitle, selectedEntity } = pageContext;

  if (page === 'library') return null;

  const icons: Record<string, string> = {
    reader: '\u{1F4D6}',
    graph: '\u{1F517}',
    analysis: '\u{1F52C}',
  };
  const parts = [icons[page] ?? '', bookTitle].filter(Boolean);
  if (chapterTitle) parts.push(chapterTitle);
  if (selectedEntity) parts.push(selectedEntity.name);

  return (
    <span
      style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--fg-muted)',
        background: 'var(--bg-secondary)',
        padding: '2px 8px',
        borderRadius: 12,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 260,
        display: 'inline-block',
      }}
    >
      {parts.join(' · ')}
    </span>
  );
}

function NewChatConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: 280,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--fg-primary)',
            fontFamily: 'var(--font-sans)',
            marginBottom: 16,
          }}
        >
          開啟新對話？目前的對話紀錄將會清除。
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--fg-secondary)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatWindow() {
  const { pageContext, prefillMessage, clearPrefill, ws } = useChatContext();
  const { messages, sendMessage, isStreaming, isConnecting, clearMessages } = ws;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle prefill
  useEffect(() => {
    if (prefillMessage) {
      sendMessage(prefillMessage, pageContext);
      clearPrefill();
    }
  }, [prefillMessage, clearPrefill, sendMessage, pageContext]);

  const handleSend = (text: string) => {
    sendMessage(text, pageContext);
  };

  const handleNewChat = () => {
    if (messages.length > 0) {
      setShowNewChatConfirm(true);
    }
  };

  const confirmNewChat = () => {
    clearMessages();
    setShowNewChatConfirm(false);
  };

  const entityName = pageContext.selectedEntity?.name;
  const suggestions = SUGGESTED_PROMPTS[pageContext.page]?.(entityName) ?? [];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '5.5rem',
        right: '1.5rem',
        zIndex: 50,
        width: 380,
        height: 520,
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'calc(100vh - 7rem)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'chatWindowIn 150ms ease',
      }}
    >
      {/* Confirm overlay */}
      {showNewChatConfirm && (
        <NewChatConfirm
          onConfirm={confirmNewChat}
          onCancel={() => setShowNewChatConfirm(false)}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--fg-primary)',
            }}
          >
            StorySphere Chat
          </span>
          <ContextBadge />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleNewChat}
            title="新對話"
            style={{
              background: 'none',
              border: 'none',
              cursor: messages.length > 0 ? 'pointer' : 'default',
              color: messages.length > 0 ? 'var(--fg-muted)' : 'var(--bg-tertiary)',
              padding: 4,
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--transition-fast)',
            }}
            disabled={messages.length === 0}
          >
            <SquarePen size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 12,
              padding: '24px 0',
            }}
          >
            <span
              style={{
                color: 'var(--fg-muted)',
                fontSize: 'var(--font-size-sm)',
                textAlign: 'center',
              }}
            >
              Ask me anything about this story
            </span>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--fg-secondary)',
                      fontFamily: 'var(--font-sans)',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--bg-tertiary)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'var(--bg-secondary)')
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {isStreaming && messages[messages.length - 1]?.role === 'assistant' && (
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 14,
              background: 'var(--accent)',
              marginLeft: 2,
              animation: 'blink 1s step-end infinite',
            }}
          />
        )}

        {isConnecting && (
          <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--font-size-xs)' }}>
            Connecting...
          </span>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isStreaming} />

      <style>{`
        @keyframes chatWindowIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
