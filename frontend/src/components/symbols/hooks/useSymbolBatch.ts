import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { analyzeAllSymbols, fetchActiveSymbolBatch } from '@/api/symbols';
import { isLlmUnconfigured } from '@/api/failureKind';
import { useBatchTask, type BatchTask } from '@/hooks/useBatchTask';
import { qk } from '@/api/queryKeys';

export type SymbolBatch = BatchTask<string[]> & {
  /**
   * The trigger was refused with the app's own 503: no LLM provider is configured.
   * A feature state, not a failure — the page says so in place and stays usable.
   */
  llmBlocked: boolean;
};

/**
 * Batch symbol interpretation. Runs every symbol occurring more than once when
 * `imageryIds` is omitted.
 *
 * Refreshing the overview as the run advances is what makes review badges and
 * the interpreted count fill in while it is still going, rather than all at
 * once at the end.
 */
export function useSymbolBatch(bookId: string | undefined, failureMessage: string): SymbolBatch {
  const queryClient = useQueryClient();
  const [llmBlocked, setLlmBlocked] = useState(false);

  const refreshOverview = useCallback(() => {
    if (bookId) queryClient.invalidateQueries({ queryKey: qk.symbols.overview(bookId) });
  }, [bookId, queryClient]);

  const batch = useBatchTask<string[]>({
    trigger: async (imageryIds) => {
      setLlmBlocked(false);
      try {
        return await analyzeAllSymbols({ bookId: bookId!, imageryIds });
      } catch (err) {
        // useBatchTask only keeps a message, so the 503 distinction is made here.
        if (isLlmUnconfigured(err)) setLlmBlocked(true);
        throw err;
      }
    },
    onProgress: refreshOverview,
    onDone: refreshOverview,
    failureMessage,
    resume: { key: bookId, fetch: () => fetchActiveSymbolBatch(bookId!) },
  });

  const { dismiss } = batch;
  const dismissAll = useCallback(() => {
    setLlmBlocked(false);
    dismiss();
  }, [dismiss]);

  return {
    ...batch,
    // On a 503 the in-place notice replaces the generic batch banner.
    error: llmBlocked ? null : batch.error,
    dismiss: dismissAll,
    llmBlocked,
  };
}
