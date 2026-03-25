import { useQuery } from '@tanstack/react-query';
import { fetchTimeline } from '@/api/timeline';
import type { TimelineData, TimelineOrder } from '@/api/types';

export function useTimeline(bookId: string | undefined, order: TimelineOrder) {
  // Matrix view uses narrative order data (same event set, rendered differently)
  const fetchOrder = order === 'matrix' ? 'narrative' : order;
  return useQuery<TimelineData>({
    queryKey: ['books', bookId, 'timeline', fetchOrder],
    queryFn: () => fetchTimeline(bookId!, fetchOrder),
    enabled: !!bookId,
  });
}
