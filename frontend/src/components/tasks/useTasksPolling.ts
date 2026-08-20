import { useQuery } from '@tanstack/react-query';
import { fetchTasks, type TaskStatus } from '@/api/tasks';
import { qk } from '@/api/queryKeys';

/**
 * Polls GET /tasks for the Task Center panel.
 *
 * Only polls while `enabled` (the panel is open); disabling stops the
 * 2-second interval. Mirrors the existing single-task polling pattern.
 */
export function useTasksPolling(enabled: boolean) {
  return useQuery<TaskStatus[]>({
    queryKey: qk.tasks.list(),
    queryFn: () => fetchTasks(),
    enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}
