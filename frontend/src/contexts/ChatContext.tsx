import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWebSocketChat, type UseWebSocketChatReturn } from '@/hooks/useWebSocketChat';

export interface PageContext {
  page: 'library' | 'reader' | 'graph' | 'analysis' | 'timeline' | 'other';
  bookId?: string;
  bookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  selectedEntity?: { id: string; name: string; type: string };
  analysisTab?: 'characters' | 'events';
}

const ALL_CLEARABLE_KEYS: Array<keyof Omit<PageContext, 'page'>> = [
  'bookId', 'bookTitle', 'chapterId', 'chapterTitle', 'chapterNumber',
  'selectedEntity', 'analysisTab',
];

const PAGE_ALLOWED_FIELDS: Record<PageContext['page'], Array<keyof Omit<PageContext, 'page'>>> = {
  library:  [],
  reader:   ['bookId', 'bookTitle', 'chapterId', 'chapterTitle', 'chapterNumber'],
  graph:    ['bookId', 'bookTitle', 'selectedEntity'],
  analysis: ['bookId', 'bookTitle', 'selectedEntity', 'analysisTab'],
  timeline: ['bookId', 'bookTitle', 'selectedEntity'],
  other:    [],
};

interface ChatContextValue {
  pageContext: PageContext;
  setPageContext: (ctx: Partial<PageContext>) => void;
  isChatOpen: boolean;
  openChat: (prefill?: string) => void;
  closeChat: () => void;
  prefillMessage: string | null;
  clearPrefill: () => void;
  ws: UseWebSocketChatReturn;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext>({ page: 'library' });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const ws = useWebSocketChat('/ws/chat');

  const setPageContext = useCallback((ctx: Partial<PageContext>) => {
    setPageContextState((prev) => {
      const next = { ...prev, ...ctx };
      if (ctx.page && ctx.page !== prev.page) {
        const allowed = new Set<string>(PAGE_ALLOWED_FIELDS[ctx.page] ?? []);
        for (const key of ALL_CLEARABLE_KEYS) {
          if (!allowed.has(key)) {
            (next as Record<string, unknown>)[key] = undefined;
          }
        }
      }
      return next;
    });
  }, []);

  const openChat = useCallback((prefill?: string) => {
    if (prefill) setPrefillMessage(prefill);
    setIsChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const clearPrefill = useCallback(() => {
    setPrefillMessage(null);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        pageContext,
        setPageContext,
        isChatOpen,
        openChat,
        closeChat,
        prefillMessage,
        clearPrefill,
        ws,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatContextProvider');
  return ctx;
}
