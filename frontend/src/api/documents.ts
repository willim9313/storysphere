import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { DocumentSummary, DocumentResponse } from './types';

export function fetchDocuments(): Promise<DocumentSummary[]> {
  if (MOCK_ENABLED) return mock.fetchDocuments();
  return apiFetch<DocumentSummary[]>('/documents/');
}

export function fetchDocument(id: string): Promise<DocumentResponse> {
  if (MOCK_ENABLED) return mock.fetchDocument(id);
  return apiFetch<DocumentResponse>(`/documents/${id}`);
}
