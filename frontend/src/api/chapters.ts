import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { Chapter } from './types';

export function fetchChapters(bookId: string): Promise<Chapter[]> {
  if (MOCK_ENABLED) return mock.fetchChapters(bookId);
  return apiFetch<Chapter[]>(`/books/${bookId}/chapters`);
}
