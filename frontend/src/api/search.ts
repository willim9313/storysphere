import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { SearchResult } from './types';

export function semanticSearch(
  q: string,
  limit = 10,
  documentId?: string,
): Promise<SearchResult[]> {
  if (MOCK_ENABLED) return mock.semanticSearch(q, limit, documentId);
  const qs = new URLSearchParams({ q, limit: String(limit) });
  if (documentId) qs.set('document_id', documentId);
  return apiFetch<SearchResult[]>(`/search/?${qs}`);
}
