import { apiFetch } from './client';
import type { components } from './generated';

export type SearchResult = components['schemas']['SearchResult'];
export type SearchResultMetadata = components['schemas']['SearchResultMetadata'];
type SearchRequestSchema = components['schemas']['SearchRequest'];
export type SearchMode = SearchRequestSchema['mode'];
/** topK / mode have backend defaults (10, fulltext), so callers may omit them. */
type SearchRequest = Omit<SearchRequestSchema, 'topK' | 'mode'> &
  Partial<Pick<SearchRequestSchema, 'topK' | 'mode'>>;

export async function searchPassages(req: SearchRequest): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>('/search/', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
