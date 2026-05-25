import { apiFetch } from './client';
import type { TaskStatus } from './types';

export type ImageryType = 'object' | 'nature' | 'spatial' | 'body' | 'color' | 'other';

export type Polarity = 'positive' | 'negative' | 'neutral' | 'mixed';

export type SymbolReviewStatus = 'pending' | 'approved' | 'modified' | 'rejected';

export interface ImageryEntity {
  id: string;
  book_id: string;
  term: string;
  imagery_type: ImageryType;
  aliases: string[];
  frequency: number;
  chapter_distribution: Record<string, number>;
  first_chapter: number | null;
}

export interface ImageryListResponse {
  items: ImageryEntity[];
  total: number;
  book_id: string;
}

export interface SymbolTimelineEntry {
  chapter_number: number;
  position: number;
  context_window: string;
  co_occurring_terms: string[];
  occurrence_id: string;
}

export interface CoOccurrenceEntry {
  term: string;
  imagery_id: string;
  co_occurrence_count: number;
  imagery_type: ImageryType;
}

export interface SEPOccurrenceContext {
  occurrence_id: string;
  paragraph_id: string;
  chapter_number: number;
  position: number;
  paragraph_text: string;
  context_window: string;
}

export interface SEP {
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  frequency: number;
  occurrence_contexts: SEPOccurrenceContext[];
  co_occurring_entity_ids: string[];
  co_occurring_event_ids: string[];
  chapter_distribution: Record<string, number>;
  peak_chapters: number[];
  assembled_by: string;
  assembled_at: string;
}

export interface SymbolInterpretation {
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  theme: string;
  polarity: Polarity;
  evidence_summary: string;
  linked_characters: string[];
  linked_events: string[];
  confidence: number;
  assembled_by: string;
  assembled_at: string;
  review_status: SymbolReviewStatus;
}

export function fetchSymbols(
  bookId: string,
  opts: { imageryType?: string; minFrequency?: number; limit?: number } = {},
): Promise<ImageryListResponse> {
  const params = new URLSearchParams({ book_id: bookId });
  if (opts.imageryType) params.set('imagery_type', opts.imageryType);
  if (opts.minFrequency != null) params.set('min_frequency', String(opts.minFrequency));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return apiFetch<ImageryListResponse>(`/symbols?${params}`);
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
