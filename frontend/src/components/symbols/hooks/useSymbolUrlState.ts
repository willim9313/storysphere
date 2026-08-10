import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortAxis } from '../symbolSignals';

/** Every axis the sidebar offers. Anything else in the URL falls back to `load`. */
const SORT_AXES: readonly SortAxis[] = [
  'load',
  'attach',
  'span',
  'events',
  'freq',
  'first',
  'review',
];

export interface SymbolUrlState {
  /** Imagery id of the open symbol, or null on the map or a cluster. */
  symbolId: string | null;
  /** Seed imagery id of the open cluster, or null elsewhere. */
  clusterSeedId: string | null;
  sortAxis: SortAxis;
  typeFilter: string | null;
  /**
   * Imagery id held for side-by-side comparison, or null.
   *
   * Survives navigating between symbols on purpose — that is the whole feature.
   * It is in the URL because a comparison is exactly the kind of thing worth
   * sending someone: 「開這個連結，看手和海疊在同一條軸上」.
   */
  pinnedId: string | null;
  setPinned: (id: string | null) => void;
  openSymbol: (id: string | null) => void;
  openCluster: (seedId: string) => void;
  setSortAxis: (axis: SortAxis) => void;
  setTypeFilter: (type: string | null) => void;
}

/**
 * The page's shareable state, held in the query string rather than in React.
 *
 * Derived from `useSearchParams` instead of mirrored into `useState`, so there is
 * no second copy to fall out of step and the browser's back and forward buttons
 * move through the views for free. The mirrored version needs one effect to read
 * the URL and another to write it, and those two effects are a loop waiting to be
 * discovered.
 *
 * Ids, not terms, matching `?entity=` on the graph page (`GraphPage.tsx:408`). A
 * term would read better in a shared link, but the two pages produce the same kind
 * of link and having one use names while the other uses ids is the sort of
 * difference nobody remembers which way round it goes.
 *
 * Deliberately absent: the behaviour-group filter and the search box. A behaviour
 * group is a way of looking rather than a place to link to (redesign decision 05),
 * and a half-typed search term in a shared URL is noise.
 */
export function useSymbolUrlState(): SymbolUrlState {
  const [params, setParams] = useSearchParams();

  const symbolId = params.get('symbol');
  const clusterSeedId = params.get('cluster');
  const rawSort = params.get('sort');
  const sortAxis = SORT_AXES.includes(rawSort as SortAxis) ? (rawSort as SortAxis) : 'load';

  /**
   * `push` moves between views, `replace` adjusts one.
   *
   * Pushing on every filter change would leave the back button needing eight
   * presses to escape the page; replacing on a view change would make it leave
   * the book entirely from a symbol the reader had just opened.
   */
  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, navigated: boolean) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: !navigated },
      );
    },
    [setParams],
  );

  const openSymbol = useCallback(
    (id: string | null) => {
      update((next) => {
        next.delete('cluster');
        if (id === null) next.delete('symbol');
        else next.set('symbol', id);
      }, true);
    },
    [update],
  );

  const openCluster = useCallback(
    (seedId: string) => {
      update((next) => {
        next.delete('symbol');
        next.set('cluster', seedId);
      }, true);
    },
    [update],
  );

  const setSortAxis = useCallback(
    (axis: SortAxis) => {
      // The default is the absence of the parameter, so a link to an unsorted page
      // is the bare URL rather than one carrying `sort=load`.
      update((next) => {
        if (axis === 'load') next.delete('sort');
        else next.set('sort', axis);
      }, false);
    },
    [update],
  );

  const setPinned = useCallback(
    (id: string | null) => {
      // Not a navigation: the reader stays where they are and a second row appears.
      update((next) => {
        if (id === null) next.delete('pin');
        else next.set('pin', id);
      }, false);
    },
    [update],
  );

  const setTypeFilter = useCallback(
    (type: string | null) => {
      update((next) => {
        if (type === null) next.delete('type');
        else next.set('type', type);
      }, false);
    },
    [update],
  );

  return {
    symbolId,
    clusterSeedId,
    sortAxis,
    typeFilter: params.get('type'),
    pinnedId: params.get('pin'),
    setPinned,
    openSymbol,
    openCluster,
    setSortAxis,
    setTypeFilter,
  };
}
