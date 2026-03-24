import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWebSocketChat, type ChatMessage, type UseWebSocketChatReturn } from '@/hooks/useWebSocketChat';

export interface PageContext {
  page: 'library' | 'reader' | 'graph' | 'analysis' | 'other';
  bookId?: string;
  bookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  selectedEntity?: { id: string; name: string; type: string };
}

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
    setPageContextState((prev) => ({ ...prev, ...ctx }));
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
