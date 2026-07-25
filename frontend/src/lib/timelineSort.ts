import type { TimelineEvent, TimelineOrder } from '@/api/types';

/**
 * Order the timeline's events for a given view.
 *
 * `chronological` mirrors the backend's ordering exactly — see
 * `get_book_timeline` in `backend/storysphere/api/routers/books.py`, which sorts
 * by `(chronological_rank ?? float("inf"), chapter)`. The two rules that matter:
 *
 * 1. `chronologicalRank === null` means "story-time position not computed yet",
 *    so those events **sink to the end**. Treating null as rank 0 (the previous
 *    behaviour here) placed them first, i.e. claimed they were the earliest
 *    things to happen in the story — and silently reversed the backend's order.
 * 2. `chapter` breaks ties, so equal-rank events stay in reading order instead
 *    of depending on the sort's stability.
 *
 * Other views are returned in the order the backend sent them: `narrative` is
 * already chapter-sorted server-side, and `matrix` positions events by axis
 * rather than by sequence.
 */
export function sortEventsForOrder(
  events: readonly TimelineEvent[],
  order: TimelineOrder,
): TimelineEvent[] {
  const sorted = [...events];
  if (order !== 'chronological') return sorted;
  return sorted.sort((a, b) => {
    const rankA = a.chronologicalRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.chronologicalRank ?? Number.POSITIVE_INFINITY;
    // Guarded so two unranked events don't produce Infinity - Infinity = NaN.
    if (rankA !== rankB) return rankA - rankB;
    return a.chapter - b.chapter;
  });
}
