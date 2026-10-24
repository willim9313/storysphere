import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchEpistemicState, type EpistemicStateResponse } from '@/api/graph';
import { qk } from '@/api/queryKeys';

export function useEpistemicState(
  bookId: string | undefined,
  entityId: string | null,
  upToChapter: number | null,
  { cachedOnly = false }: { cachedOnly?: boolean } = {},
) {
  return useQuery<EpistemicStateResponse>({
    queryKey: cachedOnly
      ? qk.epistemic.atCached(bookId, entityId, upToChapter)
      : qk.epistemic.at(bookId, entityId, upToChapter),
    queryFn: () => fetchEpistemicState(bookId!, entityId!, upToChapter!, { cachedOnly }),
    enabled: !!bookId && !!entityId && upToChapter != null,
    placeholderData: keepPreviousData,
  });
}
