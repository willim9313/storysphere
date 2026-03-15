import { MOCK_ENABLED } from './mock';
import { apiFetch } from './client';
import * as mock from './mock/mockClient';
import type { ParagraphResponse } from './types';

export function fetchParagraphs(
  documentId: string,
  chapterNumber: number,
): Promise<ParagraphResponse[]> {
  if (MOCK_ENABLED) return mock.fetchParagraphs(documentId, chapterNumber);
  return apiFetch<ParagraphResponse[]>(
    `/documents/${documentId}/chapters/${chapterNumber}/paragraphs`,
  );
}
