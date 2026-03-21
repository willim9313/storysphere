import { useQuery } from '@tanstack/react-query';
import { fetchTokenUsage } from '@/api/tokenUsage';

export function useTokenUsage(range: string) {
  return useQuery({
    queryKey: ['token-usage', range],
    queryFn: () => fetchTokenUsage(range),
  });
}
