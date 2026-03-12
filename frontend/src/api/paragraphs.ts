import { apiFetch } from './client';
import type { ParagraphResponse } from './types';

export function fetchParagraphs(
  documentId: string,
  chapterNumber: number,
): Promise<ParagraphResponse[]> {
  return apiFetch<ParagraphResponse[]>(
    `/documents/${documentId}/chapters/${chapterNumber}/paragraphs`,
  );
}
