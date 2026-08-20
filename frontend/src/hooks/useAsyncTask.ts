import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import type { TaskStatus } from '@/api/types';
import { useTaskPolling } from '@/hooks/useTaskPolling';

/** Handed to the terminal callbacks so they can clear the task without having
 *  to reference the hook's own return value from inside its options object. */
export interface AsyncTaskControl {
  reset: () => void;
}

export interface UseAsyncTaskOptions {
  /** Override the status endpoint (tension and symbol tasks each have their own). */
  fetcher?: (id: string, after: number) => Promise<TaskStatus>;
  onDone?: (task: TaskStatus, ctl: AsyncTaskControl) => void;
  onError?: (message: string, ctl: AsyncTaskControl) => void;
  /** Shown when a failed task carries no message of its own. */
  defaultError: string;
}

export interface UseAsyncTaskResult {
  task: TaskStatus | undefined;
  taskId: string | null;
  error: string | null;
  running: boolean;
  /** Adopt a task id that something else already created (mutation onSuccess). */
  adopt: (id: string) => void;
  /** Manually set the visible error (a caller-side trigger failure). */
  setError: (message: string | null) => void;
  /** Create and adopt in one step, turning a failed trigger into `error`. */
  run: (create: () => Promise<{ taskId: string }>, triggerError: string) => Promise<void>;
  reset: () => void;
}

/**
 * One background task: hold its id, poll it, and fire a callback when it lands.
 *
 * Five copies of this had grown up separately (tension, symbol interpretation,
 * symbol batch, and the character/event analysis pages), each with its own
 * `taskId`/`error` state and its own done/error effect — which is why ten
 * `eslint-disable react-hooks/set-state-in-effect` comments were scattered
 * across those files.
 *
 * What the copies did *not* agree on is what happens to `taskId` once the task
 * lands, and the differences turned out to be deliberate:
 *
 *   - The analysis pages keep it after a failure, because their error panel is
 *     rendered from `genTask` and disappears the moment the id is cleared.
 *   - useTensionTask drops it on both outcomes, having copied the message into
 *     its own error state first.
 *   - useSymbolInterpretationTask keeps it on success so the finished task
 *     stays readable until the user dismisses the modal.
 *
 * So this hook never clears the id on its own. It reports the outcome once and
 * hands the callback a `reset`; each caller keeps the behaviour it had.
 */
export function useAsyncTask({
  fetcher,
  onDone,
  onError,
  defaultError,
}: UseAsyncTaskOptions): UseAsyncTaskResult {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: task } = useTaskPolling(taskId, fetcher);

  // Drops the id only, deliberately keeping `error`: every caller that resets
  // from its error path (tension, symbol interpretation) does so precisely to
  // stop polling *while still showing the reason*. The message is cleared on
  // the next adopt/run instead.
  const reset = useCallback(() => {
    setTaskId(null);
  }, []);

  const ctlRef = useRef<AsyncTaskControl>({ reset });
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  // Layout effect so a callback redefined this render is in place before the
  // status effect below can fire with it.
  useLayoutEffect(() => {
    ctlRef.current = { reset };
    onDoneRef.current = onDone;
    onErrorRef.current = onError;
  });

  // Report each terminal status once. Without this guard the effect re-fires
  // whenever an unrelated dep changes while the task sits in a terminal state,
  // which for the analysis pages (they keep the id after a failure) would mean
  // re-running the callback on every render.
  const handledRef = useRef<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const status = task?.status;
    if (!taskId || !task || (status !== 'done' && status !== 'error')) return;

    const stamp = `${taskId}:${status}`;
    if (handledRef.current === stamp) return;
    handledRef.current = stamp;

    if (status === 'done') {
      onDoneRef.current?.(task, ctlRef.current);
    } else {
      const message = task.error ?? defaultError;
      setError(message);
      onErrorRef.current?.(message, ctlRef.current);
    }
  }, [task, taskId, defaultError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const adopt = useCallback((id: string) => {
    handledRef.current = null;
    setError(null);
    setTaskId(id);
  }, []);

  const run = useCallback(
    async (create: () => Promise<{ taskId: string }>, triggerError: string) => {
      setError(null);
      try {
        const { taskId: id } = await create();
        adopt(id);
      } catch (err) {
        // A refusal from the server carries the reason and the numbers behind
        // it (e.g. a 409 with counts); a generic message would throw that away.
        setError(err instanceof ApiError ? err.detail : triggerError);
      }
    },
    [adopt],
  );

  const running = !!taskId && task?.status !== 'done' && task?.status !== 'error';

  return { task, taskId, error, running, adopt, run, reset, setError };
}
