import { QueryClient } from '@tanstack/react-query';

// 即時狀態靠 SSE 事件 invalidate（hooks/useEventStream），不靠輪詢或視窗聚焦重抓。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
