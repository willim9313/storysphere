import { useQuery } from '@tanstack/react-query';
import { fetchChunks } from '@/api/chunks';

export function useChunks(bookId: string | undefined, chapterId: string | null) {
  return useQuery({
    queryKey: ['books', bookId, 'chapters', chapterId, 'chunks'],
    queryFn: () => fetchChunks(bookId!, chapterId!),
    enabled: !!bookId && !!chapterId,
  });
}
