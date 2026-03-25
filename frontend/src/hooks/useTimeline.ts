import { useQuery } from '@tanstack/react-query';
import { fetchTimeline } from '@/api/timeline';
import type { TimelineData, TimelineOrder } from '@/api/types';

export function useTimeline(bookId: string | undefined, order: TimelineOrder) {
  return useQuery<TimelineData>({
    queryKey: ['books', bookId, 'timeline', order],
    queryFn: () => fetchTimeline(bookId!, order),
    enabled: !!bookId,
  });
}
