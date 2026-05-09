import { useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTaskStatus } from '@/api/ingest';
import type { MurmurEvent, TaskStatus } from '@/api/types';
import {
  appendMurmurEvents,
  advanceMurmurCursor,
  getMurmurCursor,
  getMurmurEvents,
} from '@/store/murmurStore';

export function useTaskPolling(
  taskId: string | null,
  fetcher?: (id: string, after: number) => Promise<TaskStatus>,
) {
  // Triggers re-render when murmur store is updated
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const query = useQuery<TaskStatus>({
    queryKey: ['tasks', taskId],
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
    refetchInterval: (query) => {
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
