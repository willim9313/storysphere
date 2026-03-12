import { useQuery } from '@tanstack/react-query';
import { fetchParagraphs } from '@/api/paragraphs';

export function useParagraphs(documentId: string, chapterNumber: number | null) {
  return useQuery({
    queryKey: ['documents', documentId, 'chapters', chapterNumber, 'paragraphs'],
    queryFn: () => fetchParagraphs(documentId, chapterNumber!),
    enabled: !!documentId && chapterNumber !== null,
  });
}
