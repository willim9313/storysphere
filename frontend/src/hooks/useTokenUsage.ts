import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchTokenUsage } from '@/api/tokenUsage';

export function useTokenUsage(range: string, bookId?: string, enabled = true) {
  return useQuery({
    queryKey: ['token-usage', range, bookId ?? null],
    queryFn: () => fetchTokenUsage(range, bookId),
    // Keeps the book list on screen while a new range loads; the page still
    // shows its spinner for placeholder data.
    placeholderData: keepPreviousData,
    enabled,
  });
}
