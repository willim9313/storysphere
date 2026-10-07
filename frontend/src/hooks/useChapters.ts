import { useQuery } from '@tanstack/react-query';
import { fetchChapters } from '@/api/chapters';
import { qk } from '@/api/queryKeys';

/** `includeNonBody` adds 卷首／卷末 matter (reader only). The flag extends the
 *  key rather than replacing it, so invalidating qk.chapters still hits both. */
export function useChapters(bookId: string | undefined, includeNonBody = false) {
  return useQuery({
    queryKey: includeNonBody ? [...qk.chapters(bookId), 'withNonBody'] : qk.chapters(bookId),
    queryFn: () => fetchChapters(bookId!, includeNonBody),
    enabled: !!bookId,
  });
}
