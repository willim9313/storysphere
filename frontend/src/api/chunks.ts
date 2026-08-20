import { apiFetch } from './client';
import type { Chunk, EntityChunksResponse } from './types';

export function fetchChunks(bookId: string, chapterId: string): Promise<Chunk[]> {
  return apiFetch<Chunk[]>(`/books/${bookId}/chapters/${chapterId}/chunks`);
}

export function fetchEntityChunks(bookId: string, entityId: string): Promise<EntityChunksResponse> {
  return apiFetch<EntityChunksResponse>(`/books/${bookId}/entities/${entityId}/chunks`);
}
