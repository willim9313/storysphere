import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchEpistemicState, type EpistemicStateResponse } from '@/api/graph';

export function useEpistemicState(
  bookId: string | undefined,
  entityId: string | null,
  upToChapter: number | null,
) {
  return useQuery<EpistemicStateResponse>({
    queryKey: ['books', bookId, 'epistemic-state', entityId, upToChapter],
    queryFn: () => fetchEpistemicState(bookId!, entityId!, upToChapter!),
    enabled: !!bookId && !!entityId && upToChapter != null,
    placeholderData: keepPreviousData,
  });
}
