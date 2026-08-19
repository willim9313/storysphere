import { useQuery } from '@tanstack/react-query';
import { fetchTokenUsage } from '@/api/tokenUsage';

export function useTokenUsage(range: string, bookId?: string) {
  return useQuery({
    queryKey: ['token-usage', range, bookId ?? null],
    queryFn: () => fetchTokenUsage(range, bookId),
  });
}
