import { apiFetch } from './client';
import type { TaskStatus } from './types';
import type { components } from './generated';

// ── Types from generated schema ───────────────────────────────────────────────
export type ImageryEntity = components['schemas']['ImageryEntityResponse'];
export type ImageryListResponse = components['schemas']['ImageryListResponse'];
export type SymbolTimelineEntry = components['schemas']['SymbolTimelineEntry'];
export type CoOccurrenceEntry = components['schemas']['CoOccurrenceEntry'];
export type SEP = components['schemas']['SEP'];
export type SEPOccurrenceContext = components['schemas']['SEPOccurrenceContext'];
export type SymbolInterpretation = components['schemas']['SymbolInterpretation'];

// ── Derived literal types ─────────────────────────────────────────────────────
// ImageryType: backend exposes imagery_type as plain str (not an OpenAPI enum),
// so the literal union lives here as application-level knowledge.
export type ImageryType = 'object' | 'nature' | 'spatial' | 'body' | 'color' | 'other';
export type Polarity = SymbolInterpretation['polarity'];
export type SymbolReviewStatus = SymbolInterpretation['review_status'];

// ── API functions ─────────────────────────────────────────────────────────────

export function fetchSymbols(
  bookId: string,
  opts: { imageryType?: string; minFrequency?: number; limit?: number } = {},
): Promise<ImageryListResponse> {
  const params = new URLSearchParams({ book_id: bookId });
  if (opts.imageryType) params.set('imagery_type', opts.imageryType);
  if (opts.minFrequency != null) params.set('min_frequency', String(opts.minFrequency));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return apiFetch<ImageryListResponse>(`/symbols/?${params}`);
}

export function fetchSymbolTimeline(imageryId: string): Promise<SymbolTimelineEntry[]> {
  return apiFetch<SymbolTimelineEntry[]>(`/symbols/${imageryId}/timeline`);
}

export function fetchCoOccurrences(
  imageryId: string,
  topK = 10,
): Promise<CoOccurrenceEntry[]> {
  return apiFetch<CoOccurrenceEntry[]>(`/symbols/${imageryId}/co-occurrences?top_k=${topK}`);
}

export function fetchSep(
  imageryId: string,
  force = false,
): Promise<SEP> {
  const qs = force ? '?force=true' : '';
  return apiFetch<SEP>(`/symbols/${imageryId}/sep${qs}`);
}

export interface TriggerSymbolAnalysisOpts {
  bookId: string;
  language?: string;
  forceRefresh?: boolean;
}

export function triggerSymbolAnalysis(
  imageryId: string,
  opts: TriggerSymbolAnalysisOpts,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/symbols/${imageryId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      book_id: opts.bookId,
      language: opts.language,
      force_refresh: opts.forceRefresh,
    }),
  });
}

export function fetchSymbolAnalysisTask(
  imageryId: string,
  taskId: string,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/symbols/${imageryId}/analyze/${taskId}`);
}

export function fetchSymbolInterpretation(
  imageryId: string,
  bookId: string,
): Promise<SymbolInterpretation> {
  const params = new URLSearchParams({ book_id: bookId });
  return apiFetch<SymbolInterpretation>(`/symbols/${imageryId}/interpretation?${params}`);
}

export interface ReviewSymbolInterpretationOpts {
  bookId: string;
  reviewStatus: 'approved' | 'modified' | 'rejected';
  theme?: string;
  polarity?: Polarity;
}

export function reviewSymbolInterpretation(
  imageryId: string,
  opts: ReviewSymbolInterpretationOpts,
): Promise<SymbolInterpretation> {
  return apiFetch<SymbolInterpretation>(`/symbols/${imageryId}/interpretation`, {
    method: 'PATCH',
    body: JSON.stringify({
      book_id: opts.bookId,
      review_status: opts.reviewStatus,
      theme: opts.theme,
      polarity: opts.polarity,
    }),
  });
}
