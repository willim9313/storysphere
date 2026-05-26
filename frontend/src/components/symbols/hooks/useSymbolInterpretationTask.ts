import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskPolling } from '@/hooks/useTaskPolling';
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

export function useSymbolInterpretationTask(
  onDone: (task: TaskStatus) => void,
  defaultError: string,
  triggerError: string,
): UseSymbolInterpretationTaskResult {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [imageryId, setImageryId] = useState<string | null>(null);
  const [triggerErr, setTriggerErr] = useState<string | null>(null);

  const fetcher = useCallback(
    (id: string) => {
      if (!imageryId) return Promise.reject(new Error('imageryId missing'));
      return fetchSymbolAnalysisTask(imageryId, id);
    },
    [imageryId],
  );

  const { data: task } = useTaskPolling(taskId, fetcher);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (task?.status === 'done') {
      onDoneRef.current(task);
    }
  }, [task]);

  const trigger = useCallback(
    async (id: string, opts: TriggerSymbolAnalysisOpts) => {
      setTriggerErr(null);
      try {
        setImageryId(id);
        const status = await triggerSymbolAnalysis(id, opts);
        setTaskId(status.taskId);
      } catch {
        setTriggerErr(triggerError);
        setImageryId(null);
      }
    },
    [triggerError],
  );

  const reset = useCallback(() => {
    setTaskId(null);
    setImageryId(null);
    setTriggerErr(null);
  }, []);

  // Cancel only stops the UI overlay; the backend task continues to run and
  // its result will still land in the cache. There is no server-side cancel
  // endpoint for symbol analysis, so we drop the local taskId to close the
  // modal and let the user re-trigger or move on.
  const cancel = reset;

  const running = !!taskId && task?.status !== 'done' && task?.status !== 'error';
  let error: string | null = triggerErr;
  if (!error && task?.status === 'error') {
    error = task.error ?? defaultError;
  }

  return { task, error, running, trigger, cancel, reset };
}
