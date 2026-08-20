import { useQuery } from '@tanstack/react-query';
import { fetchFactionAnalysis } from '@/api/factions';
import { qk } from '@/api/queryKeys';

// #6d — backs the character-overview quadrant view's colour coding (faction
// membership) and the faction legend. Synchronous graph computation.
export function useFactions(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.analysis.factions(bookId),
    queryFn: () => fetchFactionAnalysis(bookId!),
    enabled: !!bookId,
  });
}
