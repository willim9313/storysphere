import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { TimelineData, TimelineOrder } from './types';

export function fetchTimeline(
  bookId: string,
  order: TimelineOrder = 'narrative',
): Promise<TimelineData> {
  if (MOCK_ENABLED) return mock.fetchTimeline(bookId, order);
  return apiFetch<TimelineData>(`/books/${bookId}/timeline?order=${order}`);
}

export function computeTimeline(
  bookId: string,
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.computeTimeline(bookId);
  return apiFetch<{ taskId: string }>(`/books/${bookId}/timeline/compute`, {
    method: 'POST',
  });
}
