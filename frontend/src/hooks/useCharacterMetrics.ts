import { useQuery } from '@tanstack/react-query';
import { fetchCharacterMetrics } from '@/api/characterMetrics';
import { qk } from '@/api/queryKeys';

// #6e — backs the character-overview quadrant view's Y axis (pagerank) and
// bubble radius (degree). Synchronous graph computation, no task polling.
export function useCharacterMetrics(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.analysis.characterMetrics(bookId),
    queryFn: () => fetchCharacterMetrics(bookId!),
    enabled: !!bookId,
  });
}
