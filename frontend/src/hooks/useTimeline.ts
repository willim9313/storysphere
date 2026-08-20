import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchTimeline } from '@/api/timeline';
import type { TimelineData, TimelineOrder } from '@/api/types';
import { qk } from '@/api/queryKeys';

export function useTimeline(bookId: string | undefined, order: TimelineOrder) {
  // Matrix view uses narrative order data (same event set, rendered differently)
  const fetchOrder = order === 'matrix' ? 'narrative' : order;
  return useQuery<TimelineData>({
    queryKey: qk.timeline.order(bookId, fetchOrder),
    queryFn: () => fetchTimeline(bookId!, fetchOrder),
    enabled: !!bookId,
    // `order` is part of the key, so switching 章節順序 <-> 故事時序 starts a new
    // query. Without this the page falls back to its top-level loading state and
    // the toolbar — including the view card the user just clicked — disappears.
    placeholderData: keepPreviousData,
  });
}
