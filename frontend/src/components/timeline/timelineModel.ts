/**
 * Pure rules for the timeline page (4-1): the 對照故事時序 switch, the 60%
 * hint gate, and how a finished displacement task is read. No React.
 */

/** Gate for 識別倒敘與預敘 — mirrors the backend's coverage threshold. */
export const HINT_GATE_PCT = 60;

export interface HintCoverage {
  /** Events carrying a story-time hint. */
  n: number;
  total: number;
  pct: number;
}

/** The numbers behind「目前 {{n}} / {{total}}（{{pct}}%）」. */
export function hintCoverage(
  cov: { events_with_hint?: number; total_events?: number; coverage?: number } | undefined,
): HintCoverage {
  return {
    n: cov?.events_with_hint ?? 0,
    total: cov?.total_events ?? 0,
    pct: Math.round((cov?.coverage ?? 0) * 100),
  };
}

export type CompareState = 'disabled' | 'off' | 'on';

/**
 * Switch state. Disabled is decided by the whole book (`ranked === 0`), never
 * by the filter — a filter that happens to exclude every ranked event must not
 * read as "story order was never computed".
 */
export function compareState(rankedInBook: number, wantsCompare: boolean): CompareState {
  if (rankedInBook <= 0) return 'disabled';
  return wantsCompare ? 'on' : 'off';
}

/** Whether the stave should draw vertical deviation. */
export function drawsDeviation(state: CompareState): boolean {
  return state === 'on';
}

/** A displacement task that finished `done` but did not call the LLM. */
export function displacementSkipped(result: { coverage_sufficient?: boolean } | null | undefined): boolean {
  return result?.coverage_sufficient !== true;
}

export type StageKey = 'summarization' | 'featureExtraction' | 'knowledgeGraph' | 'symbolDiscovery';

const STEP_TO_KEY: Record<string, StageKey> = {
  summarization: 'summarization',
  'feature-extraction': 'featureExtraction',
  'knowledge-graph': 'knowledgeGraph',
  'symbol-discovery': 'symbolDiscovery',
};

/** `reader:rerun.steps.*` key for a backend step name, or null when unknown. */
export function staleStepKey(step: string | null | undefined): StageKey | null {
  return (step && STEP_TO_KEY[step]) || null;
}

export interface EepPrereq {
  done: number;
  total: number;
  pct: number;
}

export function eepPrereq(analyzed: number, total: number): EepPrereq {
  return { done: analyzed, total, pct: total > 0 ? Math.round((analyzed / total) * 100) : 0 };
}
