import { useQuery } from '@tanstack/react-query';
import { fetchCharacterAnalyses } from '@/api/analysis';
import { qk } from '@/api/queryKeys';

export function useCharacterAnalysis(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.analysis.characters(bookId),
    queryFn: () => fetchCharacterAnalyses(bookId!),
    enabled: !!bookId,
  });
}
