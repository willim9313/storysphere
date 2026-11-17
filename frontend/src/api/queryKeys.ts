// react-query 的 key 集中在這裡，SSE 事件 invalidate 時才找得到。
export const queryKeys = {
  books: ['books'] as const,
  book: (bookId: string) => ['books', bookId] as const,
  ingest: (bookId: string) => ['books', bookId, 'ingest'] as const,
  jobs: ['jobs'] as const,
  // 書籍層的資料都掛在 ['books', id, …] 底下：SSE 收到 resync 時整本 invalidate。
  bookData: (bookId: string, ...rest: unknown[]) => ['books', bookId, ...rest] as const,
};
