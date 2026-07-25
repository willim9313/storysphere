import { MOCK_ENABLED } from './mock';
import { apiFetch, apiDelete } from './client';
import * as mock from './mock/mockClient';
import type {
  AnalysisListResponse,
  CharacterAnalysisDetail,
  EventAnalysisDetail,
  EventSourceResponse,
} from './types';

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

// #7a — Entity analysis detail (full structured result)
export function fetchEntityAnalysis(
  bookId: string,
  entityId: string,
): Promise<CharacterAnalysisDetail> {
  if (MOCK_ENABLED) return mock.fetchEntityAnalysis(bookId, entityId) as unknown as Promise<CharacterAnalysisDetail>;
  return apiFetch<CharacterAnalysisDetail>(`/books/${bookId}/entities/${entityId}/analysis`);
}

// #7b — Trigger entity analysis
export function triggerEntityAnalysis(
  bookId: string,
  entityId: string,
  mode: 'full' | 'retryFailed' = 'full',
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerEntityAnalysis(bookId, entityId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/${entityId}/analyze`,
    { method: 'POST', body: JSON.stringify({ mode }) },
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
  mode: 'full' | 'retryFailed' = 'full',
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerEntityAnalysis(bookId, eventId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/events/${eventId}/analyze`,
    { method: 'POST', body: JSON.stringify({ mode }) },
  );
}

// #7i — Retrieved source passages for an event (unanalyzed preview).
// These are vector-search hits constrained to the event's chapter, NOT a
// canonical source reference — events carry no chunk id.
export function fetchEventSourcePassages(
  bookId: string,
  eventId: string,
  limit = 3,
): Promise<EventSourceResponse> {
  return apiFetch<EventSourceResponse>(
    `/books/${bookId}/events/${eventId}/source?limit=${limit}`,
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

// #7f — Batch event analysis (analyze all unanalyzed events)
export function triggerBatchEventAnalysis(
  bookId: string,
  eventIds?: string[],
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerBatchEventAnalysis(bookId);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/events/analyze-all`,
    { method: 'POST', body: JSON.stringify(eventIds ? { eventIds } : {}) },
  );
}

// #7h — Batch entity analysis (analyze all unanalyzed characters, or a subset
// via `entityIds` — used by the "先生成前 10 位要角" tiered batch entry, #11).
export function triggerBatchEntityAnalysis(
  bookId: string,
  entityIds?: string[],
): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.triggerBatchEntityAnalysis(bookId, entityIds);
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/analyze-all`,
    { method: 'POST', body: JSON.stringify({ entityIds }) },
  );
}

// #7d-get — Single event analysis detail (EEP + causality + impact)
export function fetchEventAnalysisDetail(
  bookId: string,
  eventId: string,
): Promise<EventAnalysisDetail> {
  if (MOCK_ENABLED) return mock.fetchEventAnalysisDetail(bookId, eventId);
  return apiFetch<EventAnalysisDetail>(
    `/books/${bookId}/events/${eventId}/analysis`,
  );
}
