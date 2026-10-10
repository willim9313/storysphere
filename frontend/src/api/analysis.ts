import { apiFetch } from './client';
import type {
  AnalysisListResponse,
  CharacterAnalysisDetail,
  EventAnalysisDetail,
  EventSourceResponse,
} from './types';
import type { components } from './generated';

type ActiveBatchResponse = components['schemas']['ActiveBatchResponse'];
type RunningEventAnalysesResponse = components['schemas']['RunningEventAnalysesResponse'];
type EventQuoteSourcesResponse = components['schemas']['EventQuoteSourcesResponse'];

// #6 — Trigger full-book analysis
// #6a — Character analysis list
export function fetchCharacterAnalyses(bookId: string): Promise<AnalysisListResponse> {
  return apiFetch<AnalysisListResponse>(`/books/${bookId}/analysis/characters`);
}

// #6b — Event analysis list
export function fetchEventAnalyses(bookId: string): Promise<AnalysisListResponse> {
  return apiFetch<AnalysisListResponse>(`/books/${bookId}/analysis/events`);
}

// #7a — Entity analysis detail (full structured result)
export function fetchEntityAnalysis(
  bookId: string,
  entityId: string,
): Promise<CharacterAnalysisDetail> {
  return apiFetch<CharacterAnalysisDetail>(`/books/${bookId}/entities/${entityId}/analysis`);
}

// #7b — Trigger entity analysis
export function triggerEntityAnalysis(
  bookId: string,
  entityId: string,
  mode: 'full' | 'retryFailed' = 'full',
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/${entityId}/analyze`,
    { method: 'POST', body: JSON.stringify({ mode }) },
  );
}

// #7d — Trigger event analysis
export function triggerEventAnalysis(
  bookId: string,
  eventId: string,
  mode: 'full' | 'retryFailed' = 'full',
): Promise<{ taskId: string }> {
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

// #7f — Batch event analysis (analyze all unanalyzed events)
export function triggerBatchEventAnalysis(
  bookId: string,
  eventIds?: string[],
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/events/analyze-all`,
    { method: 'POST', body: JSON.stringify(eventIds ? { eventIds } : {}) },
  );
}

// #7k — The event batch running for this book, if any (to resume after a remount).
export function fetchActiveEventBatch(bookId: string): Promise<ActiveBatchResponse> {
  return apiFetch<ActiveBatchResponse>(`/books/${bookId}/events/analyze-all/active`);
}

// #7l — Single-event analyses still running for this book (to resume after a remount).
export function fetchRunningEventAnalyses(bookId: string): Promise<RunningEventAnalysesResponse> {
  return apiFetch<RunningEventAnalysesResponse>(`/books/${bookId}/events/analyses/running`);
}

// #7m — Where each key quote of an analyzed event sits in the book (null = not pinned).
export function fetchEventQuoteSources(
  bookId: string,
  eventId: string,
): Promise<EventQuoteSourcesResponse> {
  return apiFetch<EventQuoteSourcesResponse>(`/books/${bookId}/events/${eventId}/quote-sources`);
}

// #7h — Batch entity analysis (analyze all unanalyzed characters, or a subset
// via `entityIds` — used by the "先生成前 10 位要角" tiered batch entry, #11).
export function triggerBatchEntityAnalysis(
  bookId: string,
  entityIds?: string[],
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(
    `/books/${bookId}/entities/analyze-all`,
    { method: 'POST', body: JSON.stringify({ entityIds }) },
  );
}

// #7j — The character batch running for this book, if any.
export function fetchActiveEntityBatch(bookId: string): Promise<ActiveBatchResponse> {
  return apiFetch<ActiveBatchResponse>(`/books/${bookId}/entities/analyze-all/active`);
}

// #7d-get — Single event analysis detail (EEP + causality + impact)
export function fetchEventAnalysisDetail(
  bookId: string,
  eventId: string,
): Promise<EventAnalysisDetail> {
  return apiFetch<EventAnalysisDetail>(
    `/books/${bookId}/events/${eventId}/analysis`,
  );
}
