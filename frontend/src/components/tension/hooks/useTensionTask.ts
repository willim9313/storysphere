import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTaskPolling } from '@/hooks/useTaskPolling';
import { ApiError } from '@/api/client';
import type { TaskStatus } from '@/api/types';

export interface UseTensionTaskResult {
  task: TaskStatus | undefined;
  error: string | null;
  running: boolean;
  trigger: (triggerFn: () => Promise<{ taskId: string }>, triggerError: string) => Promise<void>;
}

export function useTensionTask(
  fetcher: (id: string, after: number) => Promise<TaskStatus>,
  onDone: (task: TaskStatus) => void,
  defaultError: string,
): UseTensionTaskResult {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: task } = useTaskPolling(taskId, fetcher);
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => { onDoneRef.current = onDone; });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (task?.status === 'done') {
      onDoneRef.current(task);
      setTaskId(null);
    } else if (task?.status === 'error') {
      setError(task.error ?? defaultError);
      setTaskId(null);
    }
  }, [task, defaultError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const trigger = useCallback(
    async (triggerFn: () => Promise<{ taskId: string }>, triggerError: string) => {
      setError(null);
      try {
        const { taskId: id } = await triggerFn();
        setTaskId(id);
      } catch (err) {
        // A refusal from the server carries the reason and the numbers behind
        // it (e.g. #21a's 409); a generic message would throw that away.
        setError(err instanceof ApiError ? err.detail : triggerError);
      }
    },
    [],
  );

  return { task, error, running: !!taskId, trigger };
}
