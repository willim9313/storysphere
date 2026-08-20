import { useCallback, useState } from 'react';
import { useAsyncTask } from '@/hooks/useAsyncTask';
import {
  fetchSymbolAnalysisTask,
  triggerSymbolAnalysis,
  type TriggerSymbolAnalysisOpts,
} from '@/api/symbols';
import type { TaskStatus } from '@/api/types';

export interface UseSymbolInterpretationTaskResult {
  task: TaskStatus | undefined;
  error: string | null;
  running: boolean;
  trigger: (imageryId: string, opts: TriggerSymbolAnalysisOpts) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/**
 * Symbol interpretation for one imagery item.
 *
 * The finished task is deliberately kept after it lands, so the modal can go on
 * showing the result until the user dismisses it.
 *
 * `cancel` only takes down the local overlay: there is no server-side cancel for
 * symbol analysis, so the backend run continues and its result still reaches the
 * cache. Dropping the id lets the user re-trigger or move on.
 */
export function useSymbolInterpretationTask(
  onDone: (task: TaskStatus) => void,
  defaultError: string,
  triggerError: string,
): UseSymbolInterpretationTaskResult {
  const [imageryId, setImageryId] = useState<string | null>(null);

  const fetcher = useCallback(
    (id: string) => {
      if (!imageryId) return Promise.reject(new Error('imageryId missing'));
      return fetchSymbolAnalysisTask(imageryId, id);
    },
    [imageryId],
  );

  const { task, error, running, run, reset: resetTask } = useAsyncTask({
    fetcher,
    defaultError,
    onDone,
  });

  const trigger = useCallback(
    async (id: string, opts: TriggerSymbolAnalysisOpts) => {
      setImageryId(id);
      await run(() => triggerSymbolAnalysis(id, opts), triggerError);
    },
    [run, triggerError],
  );

  const reset = useCallback(() => {
    resetTask();
    setImageryId(null);
  }, [resetTask]);

  return { task, error, running, trigger, cancel: reset, reset };
}
