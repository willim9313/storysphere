import { apiFetch } from './client';
import type { components } from './generated';
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

export type RunningTimelineTasks = components['schemas']['RunningTimelineTasksResponse'];

/** The story-order (#13b) and temporal-analysis (#21h) runs going for a book
 *  (#13c), so the page can follow them instead of offering a second. */
export function fetchRunningTimelineTasks(bookId: string): Promise<RunningTimelineTasks> {
  return apiFetch<RunningTimelineTasks>(`/books/${bookId}/timeline/running`);
}
