import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { analyzeAllSymbols } from '@/api/symbols';
import type { BatchEepResult } from '@/api/types';
import { useTaskPolling } from '@/hooks/useTaskPolling';

import { SYMBOL_OVERVIEW_KEY } from './useSymbolAnalysis';

export interface SymbolBatch {
  running: boolean;
  /** Live per-item stage text from the task, e.g. 「詮釋意象 3/5」. */
  stage: string;
  processed: number;
  total: number;
  /** Set once a run finishes; cleared by `dismiss`. */
  summary: BatchEepResult | null;
  error: string | null;
  pending: boolean;
  /** Runs every symbol occurring more than once when `imageryIds` is omitted. */
  start: (imageryIds?: string[]) => void;
  dismiss: () => void;
}

/**
 * Drive a batch interpretation run and keep the page in step with it.
 *
 * Progress is keyed off the task's `subProgress` rather than `result.progress`:
 * the latter is only written when the task completes, so a page watching it shows
 * nothing moving for the whole run and then everything at once. The event page
 * learned this the hard way; the same mistake is easy to repeat here because both
 * fields exist on the same object.
 */
export function useSymbolBatch(bookId: string | undefined, failureMessage: string): SymbolBatch {
  const queryClient = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [summary, setSummary] = useState<BatchEepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: task } = useTaskPolling(taskId);
  const running = !!taskId && !!task && task.status !== 'done' && task.status !== 'error';

  const mutation = useMutation({
    mutationFn: (imageryIds?: string[]) =>
      analyzeAllSymbols({ bookId: bookId!, imageryIds }),
    onSuccess: (status) => {
      setSummary(null);
      setError(null);
      setProcessed(0);
      setTaskId(status.taskId);
    },
    onError: () => setError(failureMessage),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  // Refresh the overview as the run advances, so review badges and the
  // interpreted count fill in while it is still going.
  useEffect(() => {
    const done = task?.subProgress;
    if (done === undefined || done <= processed) return;
    setProcessed(done);
    if (bookId) queryClient.invalidateQueries({ queryKey: SYMBOL_OVERVIEW_KEY(bookId) });
  }, [task?.subProgress, processed, bookId, queryClient]);

  useEffect(() => {
    if (task?.status === 'done') {
      if (bookId) queryClient.invalidateQueries({ queryKey: SYMBOL_OVERVIEW_KEY(bookId) });
      setSummary((task.result as unknown as BatchEepResult) ?? null);
      setTaskId(null);
    } else if (task?.status === 'error') {
      setError(task.error ?? failureMessage);
      setTaskId(null);
    }
  }, [task?.status, task?.result, task?.error, bookId, queryClient, failureMessage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    running,
    stage: task?.stage ?? '',
    processed,
    total: task?.subTotal ?? 0,
    summary,
    error,
    pending: mutation.isPending,
    start: (imageryIds?: string[]) => mutation.mutate(imageryIds),
    dismiss: () => {
      setSummary(null);
      setError(null);
    },
  };
}
