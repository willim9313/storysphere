import { useQuery } from '@tanstack/react-query';
import { fetchGraphData } from '@/api/graph';
import type { GraphData } from '@/api/types';

export function useGraphData(bookId: string | undefined) {
  return useQuery<GraphData>({
    queryKey: ['books', bookId, 'graph'],
    queryFn: () => fetchGraphData(bookId!),
    enabled: !!bookId,
  });
}
