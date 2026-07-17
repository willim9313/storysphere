import { useQuery } from '@tanstack/react-query';
import { fetchCharacterMetrics } from '@/api/characterMetrics';

// #6e — backs the character-overview quadrant view's Y axis (pagerank) and
// bubble radius (degree). Synchronous graph computation, no task polling.
export function useCharacterMetrics(bookId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId, 'analysis', 'character-metrics'],
    queryFn: () => fetchCharacterMetrics(bookId!),
    enabled: !!bookId,
  });
}
