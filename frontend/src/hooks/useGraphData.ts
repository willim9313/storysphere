import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchGraphData, type GraphSnapshotParams } from '@/api/graph';
import type { GraphData } from '@/api/types';

export function useGraphData(
  bookId: string | undefined,
  params?: GraphSnapshotParams,
  includeInferred?: boolean,
) {
  const hasSnapshot = params?.mode != null && params?.position != null;
  return useQuery<GraphData>({
    queryKey: ['books', bookId, 'graph', params?.mode ?? null, params?.position ?? null, includeInferred ?? false],
    queryFn: () => fetchGraphData(bookId!, hasSnapshot ? params : undefined, includeInferred),
    enabled: !!bookId,
    placeholderData: keepPreviousData,
  });
}
