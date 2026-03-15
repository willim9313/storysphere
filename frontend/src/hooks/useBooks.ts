import { useQuery } from '@tanstack/react-query';
import { fetchBooks } from '@/api/books';

export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: fetchBooks,
  });
}
