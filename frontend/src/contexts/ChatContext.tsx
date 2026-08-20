import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react';
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

/* ── Two contexts, not one ────────────────────────────────────────────────
   `ws.messages` is rebuilt on every streamed token, so anything subscribed to
   the chat *state* re-renders once per token. Nine of the ten consumers are
   pages that only ever call setPageContext — keeping them on the same context
   meant every token re-rendered GraphPage, TimelinePage, the analysis pages,
   and so on.

   So the stable callbacks live in their own context (its value never changes
   identity after mount) and the streaming state stays in the other. Pages take
   useChatDispatch(); only ChatWidget, which actually renders the conversation,
   takes useChatContext(). Same split ToastContext already uses.
   ───────────────────────────────────────────────────────────────────────── */

interface ChatDispatch {
  setPageContext: (ctx: Partial<PageContext>) => void;
  openChat: (prefill?: string) => void;
  closeChat: () => void;
  clearPrefill: () => void;
}

interface ChatState {
  pageContext: PageContext;
  isChatOpen: boolean;
  prefillMessage: string | null;
  ws: UseWebSocketChatReturn;
}

const ChatDispatchContext = createContext<ChatDispatch | null>(null);
const ChatStateContext = createContext<ChatState | null>(null);

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

  // All four are useCallback with empty deps, so this object is built once and
  // keeps its identity for the life of the provider — that is the whole point.
  const dispatch = useMemo<ChatDispatch>(
    () => ({ setPageContext, openChat, closeChat, clearPrefill }),
    [setPageContext, openChat, closeChat, clearPrefill],
  );

  const state = useMemo<ChatState>(
    () => ({ pageContext, isChatOpen, prefillMessage, ws }),
    [pageContext, isChatOpen, prefillMessage, ws],
  );

  return (
    <ChatDispatchContext.Provider value={dispatch}>
      <ChatStateContext.Provider value={state}>{children}</ChatStateContext.Provider>
    </ChatDispatchContext.Provider>
  );
}

// The provider is only mounted inside BookLayout, so pages outside
// /books/:bookId (library, settings, search …) still call these hooks with no
// provider above them. They get inert no-ops rather than a thrown error.
const NO_OP_DISPATCH: ChatDispatch = {
  setPageContext: () => {},
  openChat: () => {},
  closeChat: () => {},
  clearPrefill: () => {},
};

const NO_OP_STATE: ChatState = {
  pageContext: { page: 'library' },
  isChatOpen: false,
  prefillMessage: null,
  ws: {
    messages: [],
    sendMessage: () => {},
    isConnecting: false,
    isStreaming: false,
    isThinking: false,
    clearMessages: () => {},
  },
};

/** Stable chat actions. Safe to call from any page — never re-renders on chat
 *  activity. This is what a page wants when it only publishes its page context. */
// Hooks co-located with their provider (intentional); only affects HMR granularity.
// eslint-disable-next-line react-refresh/only-export-components
export function useChatDispatch(): ChatDispatch {
  return useContext(ChatDispatchContext) ?? NO_OP_DISPATCH;
}

/** Full chat state *and* actions. Re-renders on every streamed token, so this
 *  belongs only in components that render the conversation itself. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChatContext(): ChatState & ChatDispatch {
  const state = useContext(ChatStateContext) ?? NO_OP_STATE;
  const dispatch = useChatDispatch();
  return { ...state, ...dispatch };
}
