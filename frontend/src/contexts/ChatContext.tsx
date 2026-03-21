import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWebSocketChat, type ChatMessage, type UseWebSocketChatReturn } from '@/hooks/useWebSocketChat';

export interface PageContext {
  page: 'library' | 'reader' | 'graph' | 'analysis' | 'other';
  bookId?: string;
  bookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  selectedEntity?: { id: string; name: string; type: string };
}

interface ChatContextValue {
  pageContext: PageContext;
  setPageContext: (ctx: Partial<PageContext>) => void;
  isChatOpen: boolean;
  openChat: (prefill?: string) => void;
  closeChat: () => void;
  prefillMessage: string | null;
  clearPrefill: () => void;
  // WebSocket chat (lifted so state survives open/close)
  ws: UseWebSocketChatReturn;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext>({ page: 'library' });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const ws = useWebSocketChat();

  const setPageContext = useCallback((ctx: Partial<PageContext>) => {
    setPageContextState((prev) => ({ ...prev, ...ctx }));
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
