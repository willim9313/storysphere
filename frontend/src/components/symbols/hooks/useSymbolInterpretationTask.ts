import { useCallback, useRef, useState } from 'react';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import { cancelTask } from '@/api/ingest';
import {
  fetchSymbolAnalysisTask,
  triggerSymbolAnalysis,
  type TriggerSymbolAnalysisOpts,
} from '@/api/symbols';
import type { TaskStatus } from '@/api/types';

export interface UseSymbolInterpretationTaskResult {
  task: TaskStatus | undefined;
  /** The running task's id, for display. */
  taskId: string | null;
  /** A task that ran and failed, in the task's own words. */
  error: string | null;
  /**
   * The trigger request itself was refused or never answered.
   *
   * Kept raw rather than flattened to a message: what to say depends on what
   * kind of failure it was (no LLM provider, a JSON error, no response at all),
   * and only the error object still knows.
   */
  triggerFailure: unknown;
  running: boolean;
  trigger: (imageryId: string, opts: TriggerSymbolAnalysisOpts) => Promise<void>;
  /** Re-send the last trigger, e.g. after a no-response failure. */
  retry: () => Promise<void>;
  /** Stop the run on the server, then take the overlay down. */
  cancel: () => Promise<void>;
  /** A cancel request is in flight. */
  cancelling: boolean;
  /** The last cancel request failed, so the run — and the overlay — are still on. */
  cancelFailed: boolean;
  reset: () => void;
}

/**
 * Symbol interpretation for one imagery item.
 *
 * The finished task is deliberately kept after it lands, so the modal can go on
 * showing the result until the user dismisses it.
 *
 * `cancel` calls the generic `POST /tasks/:id/cancel` and only closes the overlay
 * once that succeeds: the overlay says the run is going, so dropping it while the
 * server is still spending tokens would be a lie. If the request fails the overlay
 * stays and `cancelFailed` says why.
 */
export function useSymbolInterpretationTask(
  onDone: (task: TaskStatus) => void,
  defaultError: string,
): UseSymbolInterpretationTaskResult {
  const [imageryId, setImageryId] = useState<string | null>(null);
  const [triggerFailure, setTriggerFailure] = useState<unknown>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const lastTrigger = useRef<{ id: string; opts: TriggerSymbolAnalysisOpts } | null>(null);

  const fetcher = useCallback(
    (id: string) => {
      if (!imageryId) return Promise.reject(new Error('imageryId missing'));
      return fetchSymbolAnalysisTask(imageryId, id);
    },
    [imageryId],
  );

  const { task, taskId, error, running, adopt, setError, reset: resetTask } = useAsyncTask({
    fetcher,
    defaultError,
    onDone,
  });

  const trigger = useCallback(
    async (id: string, opts: TriggerSymbolAnalysisOpts) => {
      lastTrigger.current = { id, opts };
      setImageryId(id);
      setTriggerFailure(null);
      setCancelFailed(false);
      setError(null);
      try {
        const { taskId: newId } = await triggerSymbolAnalysis(id, opts);
        adopt(newId);
      } catch (err) {
        setTriggerFailure(err);
      }
    },
    [adopt, setError],
  );

  const retry = useCallback(async () => {
    const last = lastTrigger.current;
    if (last) await trigger(last.id, last.opts);
  }, [trigger]);

  const reset = useCallback(() => {
    resetTask();
    setImageryId(null);
    setTriggerFailure(null);
    setCancelFailed(false);
  }, [resetTask]);

  const cancel = useCallback(async () => {
    if (!taskId) {
      reset();
      return;
    }
    setCancelling(true);
    setCancelFailed(false);
    try {
      await cancelTask(taskId);
      reset();
    } catch {
      setCancelFailed(true);
    } finally {
      setCancelling(false);
    }
  }, [taskId, reset]);

  return {
    task,
    taskId,
    error,
    triggerFailure,
    running,
    trigger,
    retry,
    cancel,
    cancelling,
    cancelFailed,
    reset,
  };
}
