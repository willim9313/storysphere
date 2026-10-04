import { useCallback, useState } from 'react';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import { isLlmUnconfigured } from '@/api/failureKind';
import type { TaskStatus } from '@/api/types';

export interface UseTensionTaskResult {
  task: TaskStatus | undefined;
  /** Null while `llmBlocked` — that is a feature state, not a failure. */
  error: string | null;
  running: boolean;
  /** The trigger was refused with the app's own 503 (no LLM provider). */
  llmBlocked: boolean;
  trigger: (triggerFn: () => Promise<{ taskId: string }>, triggerError: string) => Promise<void>;
}

/**
 * Tension pipeline task. Stops polling once the task lands, either way —
 * on failure the message has already been captured, so there is nothing left
 * to poll for.
 *
 * `useAsyncTask.run` flattens a failed trigger into a message string, which
 * loses the status. The trigger is wrapped here to keep the error object, so
 * the page can tell "no provider configured" from a real failure.
 */
export function useTensionTask(
  fetcher: (id: string, after: number) => Promise<TaskStatus>,
  onDone: (task: TaskStatus) => void,
  defaultError: string,
): UseTensionTaskResult {
  const [triggerFailure, setTriggerFailure] = useState<unknown>(null);

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

  const trigger = useCallback(
    (create: () => Promise<{ taskId: string }>, triggerError: string) => {
      setTriggerFailure(null);
      return run(async () => {
        try {
          return await create();
        } catch (err) {
          setTriggerFailure(err);
          throw err;
        }
      }, triggerError);
    },
    [run],
  );

  const llmBlocked = isLlmUnconfigured(triggerFailure);
  return { task, error: llmBlocked ? null : error, running, llmBlocked, trigger };
}
