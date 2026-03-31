import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWebSocketChat, type ChatMessage, type UseWebSocketChatReturn } from '@/hooks/useWebSocketChat';

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

// All clearable keys (everything except 'page')
const ALL_CLEARABLE_KEYS: Array<keyof Omit<PageContext, 'page'>> = [
  'bookId', 'bookTitle', 'chapterId', 'chapterTitle', 'chapterNumber',
  'selectedEntity', 'analysisTab',
];

// Allowed fields per page — drives auto-clear on page navigation
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
  // Original agent (right side)
  isChatOpen: boolean;
  openChat: (prefill?: string) => void;
  closeChat: () => void;
  prefillMessage: string | null;
  clearPrefill: () => void;
  ws: UseWebSocketChatReturn;
  // DeepAgent (left side)
  isDeepChatOpen: boolean;
  openDeepChat: (prefill?: string) => void;
  closeDeepChat: () => void;
  deepPrefillMessage: string | null;
  clearDeepPrefill: () => void;
  deepWs: UseWebSocketChatReturn;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext>({ page: 'library' });

  // Original agent
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const ws = useWebSocketChat('/ws/chat');

  // DeepAgent
  const [isDeepChatOpen, setIsDeepChatOpen] = useState(false);
  const [deepPrefillMessage, setDeepPrefillMessage] = useState<string | null>(null);
  const deepWs = useWebSocketChat('/ws/chat-deep');

  const setPageContext = useCallback((ctx: Partial<PageContext>) => {
    setPageContextState((prev) => {
      const next = { ...prev, ...ctx };
      // On page change, auto-clear fields not allowed for the new page
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

  // Original agent callbacks
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

  // DeepAgent callbacks
  const openDeepChat = useCallback((prefill?: string) => {
    if (prefill) setDeepPrefillMessage(prefill);
    setIsDeepChatOpen(true);
  }, []);

  const closeDeepChat = useCallback(() => {
    setIsDeepChatOpen(false);
  }, []);

  const clearDeepPrefill = useCallback(() => {
    setDeepPrefillMessage(null);
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
        isDeepChatOpen,
        openDeepChat,
        closeDeepChat,
        deepPrefillMessage,
        clearDeepPrefill,
        deepWs,
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
