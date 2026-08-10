import { useCallback, useMemo, useState } from 'react';

import type { SymbolAnalysis } from '../symbolSignals';

export interface SymbolCheck {
  /** Whether the list is currently in picking mode. */
  active: boolean;
  /** Enter or leave picking mode. Either direction clears the picks. */
  toggleMode: () => void;
  /** Leave picking mode, e.g. once a run has been started from the picks. */
  exit: () => void;
  /**
   * Symbols a run would actually act on.
   *
   * Offering a checkbox on a row the batch will skip is a promise the run cannot
   * keep: the reader ticks six, the tally comes back "1 generated, 5 skipped",
   * and nothing on screen explains which five.
   */
  candidates: ReadonlySet<string>;
  isChecked: (id: string) => boolean;
  toggle: (id: string) => void;
  /** The picked ids, in ranking order — see below for why the order matters. */
  ids: string[];
}

/**
 * Track which symbols the reader has picked for a batch run.
 *
 * Separate from `useSymbolBatch` because this is a selection the reader makes on
 * the list, not part of running a task: the picks exist before any request and
 * survive a run failing. Separate from the page because both the sidebar (which
 * draws the checkboxes) and the overview header (which draws the button) need the
 * same three pieces of state, and threading them as six props through two
 * components is how the two ends drift apart.
 */
export function useSymbolCheck(analysis: SymbolAnalysis | null): SymbolCheck {
  const [active, setActive] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  /*
   * A refused symbol is excluded for the same reason an interpreted one is: the
   * run would skip it. The backend skips refusals by default (#15j) because
   * re-sending an identical prompt is refused identically, so offering the
   * checkbox promises work that will not happen — the reader ticks six, the
   * tally says "1 generated, 5 skipped", and nothing on screen says which five.
   */
  const candidates = useMemo(
    () =>
      new Set(
        (analysis?.main ?? [])
          .filter((s) => !s.hasInterpretation && !s.block)
          .map((s) => s.id),
      ),
    [analysis],
  );

  /*
   * Ordered by narrative load, not by the order the reader ticked them and not by
   * whatever axis the sidebar happens to be sorted on. The run is sequential and
   * a rate-limit response aborts the rest of it, so if only half the picks get
   * through, the half that does should be the half worth the tokens.
   *
   * Intersecting with `candidates` on the way out also covers the case where a
   * pick stops being one while it sits ticked — a run finishing, or a review
   * landing, gives it an interpretation.
   */
  const ids = useMemo(
    () =>
      (analysis?.main ?? [])
        .filter((s) => checked.has(s.id) && candidates.has(s.id))
        .map((s) => s.id),
    [analysis, checked, candidates],
  );

  const exit = useCallback(() => {
    setActive(false);
    setChecked(new Set());
  }, []);

  const toggleMode = useCallback(() => {
    setChecked(new Set());
    setActive((v) => !v);
  }, []);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    active,
    toggleMode,
    exit,
    candidates,
    isChecked: (id: string) => checked.has(id),
    toggle,
    ids,
  };
}
