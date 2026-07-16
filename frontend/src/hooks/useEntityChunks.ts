import { useQuery } from '@tanstack/react-query';
import { fetchEntityChunks } from '@/api/chunks';

// #9b — appearances of an entity across the book. Query is entity-scoped
// (not chapter-scoped), so it stays cached across popover open/close for
// the same entity within a session.
export function useEntityChunks(bookId: string | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ['books', bookId, 'entities', entityId, 'chunks'],
    queryFn: () => fetchEntityChunks(bookId!, entityId!),
    enabled: !!bookId && !!entityId,
  });
}
