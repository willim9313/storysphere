import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { GraphData } from './types';

export function fetchGraphData(bookId: string): Promise<GraphData> {
  if (MOCK_ENABLED) return mock.fetchGraphData(bookId);
  return apiFetch<GraphData>(`/books/${bookId}/graph`);
}
