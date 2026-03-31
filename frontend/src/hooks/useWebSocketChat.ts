import { useState, useRef, useCallback } from 'react';
import type { PageContext } from '@/contexts/ChatContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseWebSocketChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string, context: PageContext) => void;
  isConnecting: boolean;
  isStreaming: boolean;
  isThinking: boolean;
  clearMessages: () => void;
}

const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${window.location.host}`;
const MAX_RECONNECT = 3;

function toSnakeContext(ctx: PageContext): Record<string, unknown> {
  return {
    page: ctx.page,
    book_id: ctx.bookId ?? null,
    book_title: ctx.bookTitle ?? null,
    chapter_id: ctx.chapterId ?? null,
    chapter_title: ctx.chapterTitle ?? null,
    chapter_number: ctx.chapterNumber ?? null,
    selected_entity: ctx.selectedEntity ?? null,
    analysis_tab: ctx.analysisTab ?? null,
  };
}

export function useWebSocketChat(wsPath: string = '/ws/chat'): UseWebSocketChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const reconnectCountRef = useRef(0);
  const streamBufferRef = useRef('');
  const pendingSendRef = useRef<{ text: string; context: PageContext } | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setIsConnecting(true);
    const url = `${WS_BASE}${wsPath}?session_id=${sessionIdRef.current}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      reconnectCountRef.current = 0;
      // Send pending message if any
      if (pendingSendRef.current) {
        const { text, context } = pendingSendRef.current;
        pendingSendRef.current = null;
        doSend(ws, text, context);
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'thinking') {
        setIsThinking(true);
      } else if (data.type === 'chunk') {
        setIsThinking(false);
        streamBufferRef.current += data.content ?? '';
        // Update the last assistant message in-place for streaming
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: streamBufferRef.current }];
          }
          return [...prev, { role: 'assistant', content: streamBufferRef.current }];
        });
      } else if (data.type === 'done') {
        setIsStreaming(false);
        setIsThinking(false);
        streamBufferRef.current = '';
      } else if (data.type === 'error') {
        setIsStreaming(false);
        setIsThinking(false);
        streamBufferRef.current = '';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.detail ?? 'Unknown error'}` },
        ]);
      }
    };

    ws.onclose = () => {
      setIsConnecting(false);
      if (reconnectCountRef.current < MAX_RECONNECT && pendingSendRef.current) {
        reconnectCountRef.current++;
        const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 8000);
        setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const doSend = useCallback((ws: WebSocket, text: string, context: PageContext) => {
    setIsStreaming(true);
    streamBufferRef.current = '';
    ws.send(JSON.stringify({
      message: text,
      language: 'auto',
      context: toSnakeContext(context),
    }));
  }, []);

  const sendMessage = useCallback(
    (text: string, context: PageContext) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Add user message immediately
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        doSend(ws, trimmed, context);
      } else {
        // Lazy connect
        pendingSendRef.current = { text: trimmed, context };
        connect();
      }
    },
    [connect, doSend],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Close old socket and create new session
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  return { messages, sendMessage, isConnecting, isStreaming, isThinking, clearMessages };
}
