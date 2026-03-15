import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { Chunk } from './types';

export function fetchChunks(bookId: string, chapterId: string): Promise<Chunk[]> {
  if (MOCK_ENABLED) return mock.fetchChunks(bookId, chapterId);
  return apiFetch<Chunk[]>(`/books/${bookId}/chapters/${chapterId}/chunks`);
}
