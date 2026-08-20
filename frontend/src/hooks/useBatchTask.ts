import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { BatchEepResult, TaskStatus } from '@/api/types';
import { useTaskPolling } from '@/hooks/useTaskPolling';

export interface UseBatchTaskOptions<TArgs> {
  /** Kicks the run off; resolves with the id to poll. */
  trigger: (args?: TArgs) => Promise<{ taskId: string }>;
  /** Fires each time the per-item counter advances — the moment to refetch. */
  onProgress?: () => void;
  /** Fires once when the run lands, with the parsed summary if there was one. */
  onDone?: (summary: BatchEepResult | null) => void;
  /** Shown when the trigger fails, or the task fails without a message. */
  failureMessage: string;
}

export interface BatchTask<TArgs> {
  running: boolean;
  /** Live per-item stage text from the task, e.g.「詮釋意象 3/5」. */
  stage: string;
  processed: number;
  total: number;
  /** Set once a run finishes; cleared by `dismiss`. */
  summary: BatchEepResult | null;
  error: string | null;
  /** The trigger request itself is in flight. */
  pending: boolean;
  /** The raw task, for callers that render its own progress fields. */
  task: TaskStatus | undefined;
  start: (args?: TArgs) => void;
  dismiss: () => void;
}

/**
 * Drive a batch run and keep the page in step with it.
 *
 * Progress is keyed off the task's `subProgress` rather than `result.progress`:
 * the latter is only written when the task completes, so a page watching it
 * shows nothing moving for the whole run and then everything at once. The event
 * analysis page learned this the hard way, and the mistake is easy to repeat
 * because both fields sit on the same object — which is exactly why the three
 * copies of this logic (symbols, characters, events) are now one.
 */
export function useBatchTask<TArgs = void>({
  trigger,
  onProgress,
  onDone,
  failureMessage,
}: UseBatchTaskOptions<TArgs>): BatchTask<TArgs> {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [summary, setSummary] = useState<BatchEepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: task } = useTaskPolling(taskId);
  const running = !!taskId && !!task && task.status !== 'done' && task.status !== 'error';

  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onProgressRef.current = onProgress;
    onDoneRef.current = onDone;
  });

  const mutation = useMutation({
    mutationFn: (args?: TArgs) => trigger(args),
    onSuccess: (status) => {
      setSummary(null);
      setError(null);
      setProcessed(0);
      setTaskId(status.taskId);
    },
    onError: () => setError(failureMessage),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const done = task?.subProgress;
    if (done === undefined || done === null || done <= processed) return;
    setProcessed(done);
    onProgressRef.current?.();
  }, [task?.subProgress, processed]);

  useEffect(() => {
    if (task?.status === 'done') {
      const result = (task.result as unknown as BatchEepResult) ?? null;
      setSummary(result);
      setTaskId(null);
      onDoneRef.current?.(result);
    } else if (task?.status === 'error') {
      setError(task.error ?? failureMessage);
      setTaskId(null);
    }
  }, [task?.status, task?.result, task?.error, failureMessage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // `mutation.mutate` keeps its identity across renders; the mutation object
  // itself does not, so depending on the whole thing would hand every caller a
  // new `start` each render.
  const { mutate } = mutation;
  const start = useCallback((args?: TArgs) => mutate(args), [mutate]);
  const dismiss = useCallback(() => {
    setSummary(null);
    setError(null);
  }, []);

  return {
    running,
    stage: task?.stage ?? '',
    processed,
    total: task?.subTotal ?? 0,
    summary,
    error,
    pending: mutation.isPending,
    task,
    start,
    dismiss,
  };
}
