import { useQuery } from '@tanstack/react-query';
import { fetchChunks } from '@/api/chunks';
import { qk } from '@/api/queryKeys';

export function useChunks(bookId: string | undefined, chapterId: string | null) {
  return useQuery({
    queryKey: qk.chunks(bookId, chapterId),
    queryFn: () => fetchChunks(bookId!, chapterId!),
    enabled: !!bookId && !!chapterId,
  });
}
