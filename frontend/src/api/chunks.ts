import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { Chunk, EntityChunksResponse } from './types';

export function fetchChunks(bookId: string, chapterId: string): Promise<Chunk[]> {
  if (MOCK_ENABLED) return mock.fetchChunks(bookId, chapterId);
  return apiFetch<Chunk[]>(`/books/${bookId}/chapters/${chapterId}/chunks`);
}

export function fetchEntityChunks(bookId: string, entityId: string): Promise<EntityChunksResponse> {
  if (MOCK_ENABLED) return mock.fetchEntityChunks(bookId, entityId);
  return apiFetch<EntityChunksResponse>(`/books/${bookId}/entities/${entityId}/chunks`);
}
