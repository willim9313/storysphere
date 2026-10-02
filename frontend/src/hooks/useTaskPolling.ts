import { useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { fetchTaskStatus } from '@/api/ingest';
import type { MurmurEvent, TaskStatus } from '@/api/types';
import {
  appendMurmurEvents,
  advanceMurmurCursor,
  getMurmurCursor,
  getMurmurEvents,
} from '@/store/murmurStore';
import { qk } from '@/api/queryKeys';

/** The status endpoint answered 404: the task is gone for good. */
export function isGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export function useTaskPolling(
  taskId: string | null,
  fetcher?: (id: string, after: number) => Promise<TaskStatus>,
) {
  // Triggers re-render when murmur store is updated
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const query = useQuery<TaskStatus>({
    queryKey: qk.tasks.one(taskId),
    queryFn: async () => {
      const after = getMurmurCursor(taskId!);
      const result = await (fetcher ?? fetchTaskStatus)(taskId!, after);
      const delta: MurmurEvent[] = result.murmurEvents ?? [];
      if (delta.length > 0) {
        appendMurmurEvents(taskId!, delta);
        advanceMurmurCursor(taskId!, delta.length);
        forceUpdate();
      }
      return result;
    },
    enabled: !!taskId,
    // 404 = the task no longer exists (memory store restarted, or the 30-day
    // cleanup removed it). Retrying or polling it again cannot change that.
    retry: (count, err) => !isGone(err) && count < 3,
    refetchInterval: (query) => {
      if (isGone(query.state.error)) return false;
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 2000;
    },
  });

  return {
    ...query,
    murmurEvents: taskId ? getMurmurEvents(taskId) : [],
  };
}
