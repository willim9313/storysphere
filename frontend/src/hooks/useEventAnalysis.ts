import { useQuery } from '@tanstack/react-query';
import { fetchEventAnalyses } from '@/api/analysis';

export function useEventAnalysis(bookId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId, 'analysis', 'events'],
    queryFn: () => fetchEventAnalyses(bookId!),
    enabled: !!bookId,
  });
}
