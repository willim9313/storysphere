import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import type { BatchEepResult, BatchFailure, TaskStatus } from '@/api/types';
import { useTaskPolling } from '@/hooks/useTaskPolling';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads a finished task's untyped `result` as a batch summary. Anything that
 * isn't an object carrying the four counters is rejected (null) rather than
 * trusted; `failures` is kept only when it is an array of objects (the three
 * batches key them by `event_id` / `entity_id` / `imagery_id`), otherwise it is
 * treated as absent — the same as a run from before B-113.
 */
export function parseBatchResult(result: unknown): BatchEepResult | null {
  if (!isRecord(result)) return null;
  const { progress, total, failed, skipped, failures } = result;
  if (
    typeof progress !== 'number' ||
    typeof total !== 'number' ||
    typeof failed !== 'number' ||
    typeof skipped !== 'number'
  ) {
    return null;
  }
  const parsed: BatchEepResult = { progress, total, failed, skipped };
  if (Array.isArray(failures)) {
    parsed.failures = failures.filter(isRecord) as unknown as BatchFailure[];
  }
  return parsed;
}

export interface UseBatchTaskOptions<TArgs> {
  /** Kicks the run off; resolves with the id to poll. */
  trigger: (args?: TArgs) => Promise<{ taskId: string }>;
  /** Fires each time the per-item counter advances — the moment to refetch. */
  onProgress?: () => void;
  /** Fires once when the run lands, with the parsed summary if there was one. */
  onDone?: (summary: BatchEepResult | null) => void;
  /** Shown when the trigger fails, or the task fails without a message. */
  failureMessage: string;
  /**
   * `analysis` namespace prefix of this page's batch strings. The server
   * reports a batch's progress and rate-limit abort as a `stepKey`
   * (`batch_progress` / `rate_limited`) with counts, and the hook words them
   * from `<prefix>.progress` and the shared `batch.rateLimited`; without a
   * match the server's own `stage` / `error` text is shown.
   */
  i18nPrefix?: string;
  /**
   * Looks up the batch already running for this book (#7j / #7k / #15k).
   * Called on mount and whenever `key` changes, so a page that remounts mid-run
   * shows that run instead of offering to start a second one; also called when
   * the trigger is refused with 409 `batch_running`, which is then adopted
   * silently rather than shown as an error.
   */
  resume?: { key: string | undefined; fetch: () => Promise<{ taskId?: string | null }> };
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
  i18nPrefix = 'batch',
  resume,
}: UseBatchTaskOptions<TArgs>): BatchTask<TArgs> {
  const { t } = useTranslation('analysis');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [summary, setSummary] = useState<BatchEepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: task } = useTaskPolling(taskId);
  const running = !!taskId && !!task && task.status !== 'done' && task.status !== 'error';

  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  const resumeFetchRef = useRef(resume?.fetch);
  useLayoutEffect(() => {
    onProgressRef.current = onProgress;
    onDoneRef.current = onDone;
    resumeFetchRef.current = resume?.fetch;
  });

  // Picks up a run that is already going — without touching one this hook
  // already follows. A failed lookup just leaves the panel idle.
  const adoptRunning = useCallback(async () => {
    const fetchActive = resumeFetchRef.current;
    if (!fetchActive) return false;
    try {
      const { taskId: running } = await fetchActive();
      if (!running) return false;
      setTaskId((current) => current ?? running);
      return true;
    } catch {
      return false;
    }
  }, []);

  const resumeKey = resume?.key;
  useEffect(() => {
    if (resumeKey) void adoptRunning();
  }, [resumeKey, adoptRunning]);

  const mutation = useMutation({
    mutationFn: (args?: TArgs) => trigger(args),
    onSuccess: (status) => {
      setSummary(null);
      setError(null);
      setProcessed(0);
      setTaskId(status.taskId);
    },
    onError: async (err) => {
      // Another tab (or a remount the lookup raced) already started this
      // book's batch: follow that run instead of reporting a failure.
      if (err instanceof ApiError && err.status === 409 && err.code === 'batch_running') {
        setSummary(null);
        setError(null);
        setProcessed(0);
        if (await adoptRunning()) return;
      }
      setError(failureMessage);
    },
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
      const result = parseBatchResult(task.result);
      setSummary(result);
      setTaskId(null);
      onDoneRef.current?.(result);
    } else if (task?.status === 'error') {
      setError(
        task.stepKey === 'rate_limited'
          ? t('batch.rateLimited', { done: task.subProgress ?? 0, total: task.subTotal ?? 0 })
          : (task.error ?? failureMessage),
      );
      setTaskId(null);
    }
  }, [task?.status, task?.result, task?.error, task?.stepKey, task?.subProgress, task?.subTotal, failureMessage, t]);
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
    stage:
      task?.stepKey === 'batch_progress'
        ? t(`${i18nPrefix}.progress`, { done: task.subProgress ?? 0, total: task.subTotal ?? 0 })
        : (task?.stage ?? ''),
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
