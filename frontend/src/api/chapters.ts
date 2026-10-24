import { apiFetch } from './client';
import type { Chapter } from './types';

export function fetchChapters(bookId: string, includeNonBody = false): Promise<Chapter[]> {
  const qs = includeNonBody ? '?include_non_body=true' : '';
  return apiFetch<Chapter[]>(`/books/${bookId}/chapters${qs}`);
}
