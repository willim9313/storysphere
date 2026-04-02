import { apiFetch } from './client';

export interface ImageryEntity {
  id: string;
  book_id: string;
  term: string;
  imagery_type: string;
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
  imagery_type: string;
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
