import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload, type Schemas } from './client';
import { queryKeys } from './queryKeys';

export type Book = Schemas['Book'];
export type BookDetail = Schemas['BookDetail'];
export type UploadAccepted = Schemas['UploadAccepted'];

/** N-01a 書庫列表（含入庫中的書）。 */
export function useBooks() {
  return useQuery({
    queryKey: queryKeys.books,
    queryFn: () => apiFetch<Book[]>('/books'),
  });
}

/** N-01c 單本書；書籍層的麵包屑與各頁標頭用。 */
export function useBook(bookId: string) {
  return useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => apiFetch<BookDetail>(`/books/${encodeURIComponent(bookId)}`),
  });
}

/** N-01b 上傳一個檔案並建立 ingest job（會呼叫 LLM）。書在 P1 之後才出現在書單。 */
export function useUploadBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<UploadAccepted>('/books/upload', form);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.books });
      void client.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}
