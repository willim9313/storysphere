import { useQuery } from '@tanstack/react-query';
import { fetchCharacterAnalyses } from '@/api/analysis';

export function useCharacterAnalysis(bookId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId, 'analysis', 'characters'],
    queryFn: () => fetchCharacterAnalyses(bookId!),
    enabled: !!bookId,
  });
}
