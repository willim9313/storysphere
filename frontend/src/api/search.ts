import { apiFetch } from './client';
import type { components } from './generated';

export type SearchResult = components['schemas']['SearchResult'];
export type SearchResultMetadata = components['schemas']['SearchResultMetadata'];

export interface SearchRequest {
  query: string;
  bookId?: string | null;
  topK?: number;
}

export async function searchPassages(req: SearchRequest): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>('/search/', {
    method: 'POST',
    body: JSON.stringify({
      query: req.query,
      bookId: req.bookId ?? null,
      topK: req.topK ?? 20,
    }),
  });
}
