import { useQuery } from '@tanstack/react-query';
import type { TaskStatus } from '@/api/types';

interface UseTaskPollingOptions {
  queryKey: string[];
  taskId: string | null;
  pollFn: (taskId: string) => Promise<TaskStatus>;
  intervalMs?: number;
}

export function useTaskPolling({
  queryKey,
  taskId,
  pollFn,
  intervalMs = 2000,
}: UseTaskPollingOptions) {
  return useQuery({
    queryKey: [...queryKey, taskId],
    queryFn: () => pollFn(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return intervalMs;
    },
  });
}
