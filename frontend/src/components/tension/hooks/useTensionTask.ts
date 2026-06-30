import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskPolling } from '@/hooks/useTaskPolling';
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
  onDoneRef.current = onDone;

  useEffect(() => {
    if (task?.status === 'done') {
      onDoneRef.current(task);
      setTaskId(null);
    } else if (task?.status === 'error') {
      setError(task.error ?? defaultError);
      setTaskId(null);
    }
  }, [task, defaultError]);

  const trigger = useCallback(
    async (triggerFn: () => Promise<{ taskId: string }>, triggerError: string) => {
      setError(null);
      try {
        const { taskId: id } = await triggerFn();
        setTaskId(id);
      } catch {
        setError(triggerError);
      }
    },
    [],
  );

  return { task, error, running: !!taskId, trigger };
}
