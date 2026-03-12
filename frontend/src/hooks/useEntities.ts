import { useQuery } from '@tanstack/react-query';
import { fetchEntities } from '@/api/entities';

export function useEntities(params?: { entity_type?: string; limit?: number }) {
  return useQuery({
    queryKey: ['entities', params],
    queryFn: () => fetchEntities(params),
  });
}
