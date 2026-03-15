import { useQuery } from '@tanstack/react-query';
import { fetchBook } from '@/api/books';

export function useBook(bookId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId],
    queryFn: () => fetchBook(bookId!),
    enabled: !!bookId,
  });
}
