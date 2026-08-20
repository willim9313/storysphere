import { apiFetch } from './client';
import type { TimelineData, TimelineOrder } from './types';

export function fetchTimeline(
  bookId: string,
  order: TimelineOrder = 'narrative',
): Promise<TimelineData> {
  return apiFetch<TimelineData>(`/books/${bookId}/timeline?order=${order}`);
}

export function computeTimeline(
  bookId: string,
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(`/books/${bookId}/timeline/compute`, {
    method: 'POST',
  });
}
