import { apiFetch } from './client';
import type { DocumentSummary, DocumentResponse } from './types';

export function fetchDocuments(): Promise<DocumentSummary[]> {
  return apiFetch<DocumentSummary[]>('/documents/');
}

export function fetchDocument(id: string): Promise<DocumentResponse> {
  return apiFetch<DocumentResponse>(`/documents/${id}`);
}
