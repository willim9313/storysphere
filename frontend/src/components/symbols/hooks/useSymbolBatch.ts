import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { analyzeAllSymbols } from '@/api/symbols';
import { useBatchTask, type BatchTask } from '@/hooks/useBatchTask';

import { SYMBOL_OVERVIEW_KEY } from './useSymbolAnalysis';

export type SymbolBatch = BatchTask<string[]>;

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

  const refreshOverview = useCallback(() => {
    if (bookId) queryClient.invalidateQueries({ queryKey: SYMBOL_OVERVIEW_KEY(bookId) });
  }, [bookId, queryClient]);

  return useBatchTask<string[]>({
    trigger: (imageryIds) => analyzeAllSymbols({ bookId: bookId!, imageryIds }),
    onProgress: refreshOverview,
    onDone: refreshOverview,
    failureMessage,
  });
}
