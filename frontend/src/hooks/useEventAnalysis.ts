import { useQuery } from '@tanstack/react-query';
import { fetchEventAnalyses } from '@/api/analysis';
import { qk } from '@/api/queryKeys';

export function useEventAnalysis(bookId: string | undefined) {
  return useQuery({
    queryKey: qk.analysis.events(bookId),
    queryFn: () => fetchEventAnalyses(bookId!),
    enabled: !!bookId,
  });
}
