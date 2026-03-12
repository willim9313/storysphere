import { apiFetch } from './client';
import type { SearchResult } from './types';

export function semanticSearch(
  q: string,
  limit = 10,
  documentId?: string,
): Promise<SearchResult[]> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  if (documentId) qs.set('document_id', documentId);
  return apiFetch<SearchResult[]>(`/search/?${qs}`);
}
