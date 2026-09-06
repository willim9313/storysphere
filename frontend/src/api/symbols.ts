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
export type SymbolOverview = components['schemas']['SymbolOverview'];
export type SymbolOverviewItem = components['schemas']['SymbolOverviewItem'];
export type CoOccurringEntityRef = components['schemas']['CoOccurringEntityRef'];
export type CoOccurringImageryRef = components['schemas']['CoOccurringImageryRef'];
export type InterpretationStatus = components['schemas']['InterpretationStatus'];
export type InterpretationBlockStatus =
  components['schemas']['InterpretationBlockStatus'];

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

/**
 * Every imagery entity with its zero-LLM behavioural signals — one request (#15i).
 *
 * This is what the page opens with. Do not rebuild it from `fetchSymbols` plus
 * per-symbol calls: ranking needs signals for every symbol, and the per-symbol
 * SEP endpoint re-loads the whole book server-side. That endpoint
 * (`GET /symbols/:id/sep`) still exists but has no client here — the overview
 * carries what the page needs.
 */
export function fetchSymbolOverview(
  bookId: string,
  opts: { force?: boolean } = {},
): Promise<SymbolOverview> {
  const params = new URLSearchParams({ book_id: bookId });
  if (opts.force) params.set('force', 'true');
  return apiFetch<SymbolOverview>(`/symbols/overview?${params}`);
}

export interface AnalyzeAllSymbolsOpts {
  bookId: string;
  /** Restrict to a subset (top-N picks, checkbox selection). Omit for every
   *  symbol occurring more than once — single-occurrence terms are excluded by
   *  default, but honoured when listed explicitly. */
  imageryIds?: string[];
  language?: string;
  forceRefresh?: boolean;
}

/** Batch LLM interpretation (#15j). Poll via #8, not the per-symbol #15f. */
export function analyzeAllSymbols(opts: AnalyzeAllSymbolsOpts): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/symbols/analyze-all', {
    method: 'POST',
    body: JSON.stringify({
      book_id: opts.bookId,
      imagery_ids: opts.imageryIds,
      language: opts.language,
      force_refresh: opts.forceRefresh,
    }),
  });
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
