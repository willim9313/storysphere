import { useQuery } from '@tanstack/react-query';
import { fetchChapters } from '@/api/chapters';
import { qk } from '@/api/queryKeys';

export function useChapters(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => fetchChapters(bookId!),
    enabled: !!bookId,
  });
}
