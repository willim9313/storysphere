import { useState, useEffect, useRef } from 'react';
import { Microscope, Network, ScrollText, SquarePen, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MouseEvent } from 'react';
import type { PageContext } from '@/contexts/ChatContext';
import { RAIL } from '@/contexts/FloatRailContext';
import type { UseWebSocketChatReturn } from '@/hooks/useWebSocketChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 520;

export { WINDOW_WIDTH, WINDOW_HEIGHT };

interface ChatWindowProps {
  ws: UseWebSocketChatReturn;
  pageContext: PageContext;
  prefillMessage: string | null;
  clearPrefill: () => void;
  pos: { x: number; y: number };
  isDragging: boolean;
  onDragMouseDown: (e: MouseEvent) => void;
}

// timeline／other 沒有圖示，維持沒有
const CONTEXT_ICONS: Partial<Record<PageContext['page'], LucideIcon>> = {
  reader: ScrollText,
  graph: Network,
  analysis: Microscope,
};

function ContextBadge({ pageContext }: { pageContext: PageContext }) {
  const { page, bookTitle, chapterTitle, selectedEntity } = pageContext;
  if (page === 'library') return null;

  const Icon = CONTEXT_ICONS[page];
  const parts = [bookTitle].filter(Boolean);
  if (chapterTitle) parts.push(chapterTitle);
  if (selectedEntity) parts.push(selectedEntity.name);

  return (
    <span className="ss-chat-context">
      {Icon && (
        <span className="ss-chat-context-icon">
          <Icon size={13} />
        </span>
      )}
      <span className="ss-chat-context-text">{parts.join(' · ')}</span>
    </span>
  );
}

function NewChatConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation('chat');
  const { t: tc } = useTranslation('common');
  return (
    <div className="ss-chat-overlay">
      <div className="ss-chat-confirm">
        <p className="ss-chat-confirm-text">{t('newChatConfirm')}</p>
        <div className="ss-chat-confirm-actions">
          <button className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onCancel}>
            {tc('cancel')}
          </button>
          <button className="ss-btn ss-btn-sm ss-btn-primary" onClick={onConfirm}>
            {tc('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatWindow({
  ws,
  pageContext,
  prefillMessage,
  clearPrefill,
  pos,
  isDragging,
  onDragMouseDown,
}: ChatWindowProps) {
  const { messages, sendMessage, isStreaming, isThinking, isConnecting, clearMessages } = ws;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const { t } = useTranslation('chat');

  const entityName = pageContext.selectedEntity?.name;

  // timeline／other 沒有專屬建議，沿用 graph 無選中實體那組
  const fallbackPrompts = () => [t('prompts.mainCharacters'), t('prompts.importantEvents')];
  const SUGGESTED_PROMPTS: Record<string, (entity?: string) => string[]> = {
    graph: (entity) => entity
      ? [t('prompts.whoIs', { entity }), t('prompts.relationNetwork', { entity }), t('prompts.mainCharacters')]
      : fallbackPrompts(),
    reader: () => [t('prompts.chapterSummary'), t('prompts.chapterCharacters'), t('prompts.chapterEvents')],
    analysis: (entity) => entity
      ? [t('prompts.deepAnalysis', { entity }), t('prompts.archetype', { entity })]
      : [t('prompts.mainCharacters')],
    timeline: fallbackPrompts,
    other: fallbackPrompts,
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (prefillMessage) {
      sendMessage(prefillMessage, pageContext);
      clearPrefill();
    }
  }, [prefillMessage, clearPrefill, sendMessage, pageContext]);

  const handleSend = (text: string) => { sendMessage(text, pageContext); };
  const handleNewChat = () => { if (messages.length > 0) setShowNewChatConfirm(true); };
  const confirmNewChat = () => { clearMessages(); setShowNewChatConfirm(false); };

  const suggestions = SUGGESTED_PROMPTS[pageContext.page]?.(entityName) ?? [];

  return (
    <div
      className={`ss-chat-window${isDragging ? ' is-dragging' : ''}`}
      style={{ left: pos.x, top: pos.y, zIndex: RAIL.z.window }}
    >
      {showNewChatConfirm && (
        <NewChatConfirm onConfirm={confirmNewChat} onCancel={() => setShowNewChatConfirm(false)} />
      )}

      {/* Header — drag handle */}
      <div className="ss-chat-header" onMouseDown={onDragMouseDown}>
        <div className="ss-chat-header-main">
          <span className="ss-chat-title">{t('title')}</span>
          <ContextBadge pageContext={pageContext} />
        </div>
        {/* New chat button — stop drag propagation so click still works */}
        <button
          className="ss-chat-new"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleNewChat}
          title={t('newChat')}
          disabled={messages.length === 0}
        >
          <SquarePen size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="ss-chat-messages">
        {messages.length === 0 && (
          <div className="ss-chat-empty">
            <span className="ss-chat-empty-text">{t('emptyPrompt')}</span>
            {suggestions.length > 0 && (
              <div className="ss-chat-suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="ss-chat-suggestion" onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}

        {isThinking && (
          <div className="ss-chat-thinking">
            <span className="ss-chat-dots">
              {[0, 1, 2].map((i) => <span key={i} className="ss-chat-dot" />)}
            </span>
            <span className="ss-chat-thinking-text">{t('thinking')}</span>
          </div>
        )}

        {isStreaming && messages.at(-1)?.role === 'assistant' && <span className="ss-chat-cursor" />}

        {isConnecting && <span className="ss-chat-connecting">Connecting...</span>}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={isStreaming || isThinking} />
    </div>
  );
}
