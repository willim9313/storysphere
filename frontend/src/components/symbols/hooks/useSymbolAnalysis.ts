import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchSymbolOverview } from '@/api/symbols';

import { analyseSymbols, type SymbolAnalysis } from '../symbolSignals';
import { qk } from '@/api/queryKeys';


/**
 * Every symbol's behavioural signals, from one request.
 *
 * Replaces a fan-out that cost one list call, one SEP per symbol, and one
 * interpretation call per symbol — the last of which 404s for nearly all of them,
 * since real books sit at 1-of-29 interpretation coverage. The page needs signals
 * for every symbol before it can rank any of them, so none of that could be
 * deferred until a symbol was selected.
 *
 * Signals are derived in a memo rather than in the query function so recalculation
 * follows the data rather than the cache, and so the ranking stays a pure function
 * of the payload for testing.
 */
export function useSymbolAnalysis(bookId: string | undefined) {
  const query = useQuery({
    queryKey: qk.symbols.overview(bookId),
    queryFn: () => fetchSymbolOverview(bookId!),
    enabled: !!bookId,
  });

  const analysis: SymbolAnalysis | null = useMemo(
    () => (query.data ? analyseSymbols(query.data) : null),
    [query.data],
  );

  return { ...query, analysis };
}
