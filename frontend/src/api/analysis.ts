import { MOCK_ENABLED } from './mock';
import { apiFetch, apiDelete } from './client';
import * as mock from './mock/mockClient';
import type { AnalysisListResponse, EntityAnalysis } from './types';

// #6 — Trigger full-book analysis
export function triggerBookAnalysis(bookId: string): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerBookAnalysis(bookId);
  return apiFetch<{ taskId: string }>(`/books/${bookId}/analyze`, { method: 'POST' });
}

// #6a — Character analysis list
export function fetchCharacterAnalyses(bookId: string): Promise<AnalysisListResponse> {
  if (MOCK_ENABLED) return mock.fetchCharacterAnalyses(bookId);
  return apiFetch<AnalysisListResponse>(`/books/${bookId}/analysis/characters`);
}

// #6b — Event analysis list
export function fetchEventAnalyses(bookId: string): Promise<AnalysisListResponse> {
  if (MOCK_ENABLED) return mock.fetchEventAnalyses(bookId);
  return apiFetch<AnalysisListResponse>(`/books/${bookId}/analysis/events`);
}

// #6c — Regenerate analysis item
export function regenerateAnalysis(
  bookId: string,
  section: string,
  itemId: string,
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.regenerateAnalysis(bookId, section, itemId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/analysis/${section}/${itemId}/regenerate`,
    { method: 'POST' },
  );
}

// #7a — Entity analysis detail
export function fetchEntityAnalysis(
  bookId: string,
  entityId: string,
): Promise<EntityAnalysis> {
  if (MOCK_ENABLED) return mock.fetchEntityAnalysis(bookId, entityId);
  return apiFetch<EntityAnalysis>(`/books/${bookId}/entities/${entityId}/analysis`);
}

// #7b — Trigger entity analysis
export function triggerEntityAnalysis(
  bookId: string,
  entityId: string,
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerEntityAnalysis(bookId, entityId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/${entityId}/analyze`,
    { method: 'POST' },
  );
}

// #7c — Delete entity analysis
export function deleteEntityAnalysis(
  bookId: string,
  entityId: string,
): Promise<void> {
  if (MOCK_ENABLED) return mock.deleteEntityAnalysis(bookId, entityId);
  return apiDelete(`/books/${bookId}/entities/${entityId}/analysis`);
}

// #7d — Trigger event analysis
export function triggerEventAnalysis(
  bookId: string,
  eventId: string,
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerEntityAnalysis(bookId, eventId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/events/${eventId}/analyze`,
    { method: 'POST' },
  );
}

// #7e — Delete event analysis
export function deleteEventAnalysis(
  bookId: string,
  eventId: string,
): Promise<void> {
  if (MOCK_ENABLED) return mock.deleteEntityAnalysis(bookId, eventId);
  return apiDelete(`/books/${bookId}/events/${eventId}/analysis`);
}
