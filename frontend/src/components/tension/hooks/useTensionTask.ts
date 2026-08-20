import { useCallback } from 'react';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import type { TaskStatus } from '@/api/types';

export interface UseTensionTaskResult {
  task: TaskStatus | undefined;
  error: string | null;
  running: boolean;
  trigger: (triggerFn: () => Promise<{ taskId: string }>, triggerError: string) => Promise<void>;
}

/**
 * Tension pipeline task. Stops polling once the task lands, either way —
 * on failure the message has already been captured, so there is nothing left
 * to poll for.
 */
export function useTensionTask(
  fetcher: (id: string, after: number) => Promise<TaskStatus>,
  onDone: (task: TaskStatus) => void,
  defaultError: string,
): UseTensionTaskResult {
  const handleDone = useCallback(
    (task: TaskStatus, { reset }: { reset: () => void }) => {
      onDone(task);
      reset();
    },
    [onDone],
  );

  const { task, error, running, run } = useAsyncTask({
    fetcher,
    defaultError,
    onDone: handleDone,
    onError: useCallback((_message: string, { reset }: { reset: () => void }) => reset(), []),
  });

  return { task, error, running, trigger: run };
}
