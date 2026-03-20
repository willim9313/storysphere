import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { GraphData, EventDetail } from './types';

export function fetchGraphData(bookId: string): Promise<GraphData> {
  if (MOCK_ENABLED) return mock.fetchGraphData(bookId);
  return apiFetch<GraphData>(`/books/${bookId}/graph`);
}

export function fetchEventDetail(bookId: string, eventId: string): Promise<EventDetail> {
  return apiFetch<EventDetail>(`/books/${bookId}/events/${eventId}`);
}
