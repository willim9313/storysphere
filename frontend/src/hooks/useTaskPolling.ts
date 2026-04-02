import { useQuery } from '@tanstack/react-query';
import { fetchTaskStatus } from '@/api/ingest';
import type { TaskStatus } from '@/api/types';

export function useTaskPolling(
  taskId: string | null,
  fetcher?: (id: string) => Promise<TaskStatus>,
) {
  return useQuery<TaskStatus>({
    queryKey: ['tasks', taskId],
    queryFn: () => (fetcher ?? fetchTaskStatus)(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 2000;
    },
  });
}
