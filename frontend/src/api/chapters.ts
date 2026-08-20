import { apiFetch } from './client';
import type { Chapter } from './types';

export function fetchChapters(bookId: string): Promise<Chapter[]> {
  return apiFetch<Chapter[]>(`/books/${bookId}/chapters`);
}
