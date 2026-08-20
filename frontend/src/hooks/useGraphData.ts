import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchGraphData, type GraphSnapshotParams } from '@/api/graph';
import type { GraphData } from '@/api/types';
import { qk } from '@/api/queryKeys';

export function useGraphData(
  bookId: string | undefined,
  params?: GraphSnapshotParams,
  includeInferred?: boolean,
) {
  const hasSnapshot = params?.mode != null && params?.position != null;
  return useQuery<GraphData>({
    queryKey: qk.graph.view(bookId, params?.mode ?? null, params?.position ?? null, includeInferred ?? false),
    queryFn: () => fetchGraphData(bookId!, hasSnapshot ? params : undefined, includeInferred),
    enabled: !!bookId,
    placeholderData: keepPreviousData,
  });
}
