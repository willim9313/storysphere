import { useQuery } from '@tanstack/react-query';
import { fetchBook } from '@/api/books';
import { qk } from '@/api/queryKeys';

export function useBook(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.book(bookId),
    queryFn: () => fetchBook(bookId!),
    enabled: !!bookId,
  });
}
