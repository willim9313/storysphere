import { useQuery } from '@tanstack/react-query';
import { fetchBooks } from '@/api/books';
import { qk } from '@/api/queryKeys';

export function useBooks() {
  return useQuery({
    queryKey: qk.books,
    queryFn: fetchBooks,
  });
}
