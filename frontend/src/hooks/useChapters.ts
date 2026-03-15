import { useQuery } from '@tanstack/react-query';
import { fetchChapters } from '@/api/chapters';

export function useChapters(bookId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId, 'chapters'],
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId,
  });
}
