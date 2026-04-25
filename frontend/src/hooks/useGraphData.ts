import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchGraphData, type GraphSnapshotParams } from '@/api/graph';
import type { GraphData } from '@/api/types';

export function useGraphData(bookId: string | undefined, params?: GraphSnapshotParams) {
  const hasSnapshot = params?.mode != null && params?.position != null;
  return useQuery<GraphData>({
    queryKey: ['books', bookId, 'graph', params?.mode ?? null, params?.position ?? null],
    queryFn: () => fetchGraphData(bookId!, hasSnapshot ? params : undefined),
    enabled: !!bookId,
    placeholderData: keepPreviousData,
  });
}
