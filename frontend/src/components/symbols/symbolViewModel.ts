/**
 * Pure view decisions for the symbols page (DS v3 · 3-4).
 *
 * Kept out of the components so the thresholds the redesign pinned down — the
 * trust floor, the three-step density legend, the five-step tail type scale —
 * each live in one place and can be asserted without rendering anything.
 */

import type { SymbolAnalysis, SymbolSignals } from './symbolSignals';

/** Below this, a symbol's evidence is partly front matter and is flagged as such. */
export const TRUST_FLOOR = 0.8;

/** Whether a figure rests mostly on front matter — drives colour and the tooltip. */
export function isBelowTrustFloor(s: Pick<SymbolSignals, 'trust'>): boolean {
  return s.trust < TRUST_FLOOR;
}

/** The trust figure as the whole percentage the UI prints. */
export function trustPct(s: Pick<SymbolSignals, 'trust'>): number {
  return Math.round(s.trust * 100);
}

/** How many of these rows already carry an interpretation (the 「已析」 count). */
export function analyzedCount(rows: readonly Pick<SymbolSignals, 'hasInterpretation'>[]): number {
  return rows.filter((s) => s.hasInterpretation).length;
}

/**
 * The tail cloud's type scale: five steps keyed to where a word first appears.
 *
 * ch1–2 → xs … ch9–10 → xl on a ten-chapter book, scaled to the body length so a
 * longer book spreads over the same five steps. A word with no body chapter —
 * front or back matter only — sits below the scale at 2xs and muted, because it
 * is in the book without being in the story.
 */
export type TailSize = '2xs' | 'xs' | 'sm' | 'base' | 'lg' | 'xl';

const TAIL_STEPS: readonly TailSize[] = ['xs', 'sm', 'base', 'lg', 'xl'];

export function tailSize(firstBodyChapter: number | null, bodyChapterCount: number): TailSize {
  if (firstBodyChapter === null || bodyChapterCount <= 0) return '2xs';
  const step = Math.ceil((firstBodyChapter / bodyChapterCount) * TAIL_STEPS.length);
  return TAIL_STEPS[Math.min(TAIL_STEPS.length, Math.max(1, step)) - 1];
}

/** Whether the tail word is drawn muted — only when it never reaches the body. */
export function tailIsMuted(firstBodyChapter: number | null): boolean {
  return firstBodyChapter === null;
}

/**
 * The density legend, matching how cells are actually coloured.
 *
 * Two steps, not three: every count of two or more takes the same colour, so a
 * third swatch would promise a distinction the cells do not draw. The second step
 * is offered only when a cell on screen actually needs it.
 */
export type DensityLegendStep = 1 | 2;

export function densityLegend(renderedMax: number): DensityLegendStep[] {
  return renderedMax >= 2 ? [1, 2] : [1];
}

/**
 * How many symbols have behavioural signals the page could compute.
 *
 * The overview carries no per-symbol "could not compute" flag, and every row the
 * client receives is run through `analyseSymbols`, so this is the number of rows
 * that came out with signals against the number the server sent. They only differ
 * if the two ever drift; see feedback 3-SY-3.
 */
export function computableSignals(
  analysis: Pick<SymbolAnalysis, 'all'>,
  serverRowCount: number,
): { computable: number; total: number } {
  return { computable: analysis.all.length, total: serverRowCount };
}

export type StageState = 'done' | 'running' | 'pending';

export interface Stage {
  key: 'sep' | 'context' | 'link' | 'llm' | 'review';
  state: StageState;
  pct?: number;
  count?: number;
}

/**
 * Derive 5 UI stages from the backend's 3 real progress events.
 *
 * Backend pipeline (src/services/symbol_analysis_service.py) emits exactly
 * three progress callbacks:
 *   10 → emitted BEFORE the SEP is loaded (work is just starting)
 *   40 → emitted once the SEP is fully assembled (sampled paragraphs and KG
 *        event / entity links included), right before the LLM call
 *   90 → emitted after the LLM returns, while saving the interpretation
 *
 * The design splits the first phase (assemble_sep) into 3 narrative sub-steps
 * for UX clarity, even though they happen inside one atomic in-memory call:
 *   1. 彙整 SEP 證據檔
 *   2. 採樣段落脈絡 (N/N)
 *   3. 連結 KG 角色 / 事件
 * These three are treated as a single block in the UI: running until progress
 * reaches 40 (the SEP is only complete then; 10 means it has not even loaded),
 * then all marked done together — they share one `sepState`, so they are always
 * in the same state. The N/N counter shows the symbol's total occurrence count
 * (not a live counter) because that's what `assemble_sep` actually packs into
 * the SEP — the loop runs to completion before progress=40 fires.
 *
 * Steps 4 and 5 map cleanly to the remaining two progress events:
 *   4. LLM 詮釋 · 生成主題命題  (progress 40 → 90)
 *   5. 寫入待審紀錄              (progress 90 → 100)
 *
 * Three states, not two: 完成 / 進行中 / 等待. Without the middle one, the stage
 * being worked on read as 「等待」 — the same word as the stages not yet started.
 */
export function deriveStages(progress: number, occurrenceCount?: number): Stage[] {
  const sepDone = progress >= 40;
  const llmDone = progress >= 90;
  const reviewDone = progress >= 100;

  const sepState: StageState = sepDone ? 'done' : 'running';
  let llmState: StageState = 'pending';
  if (llmDone) llmState = 'done';
  else if (sepDone) llmState = 'running';
  let reviewState: StageState = 'pending';
  if (reviewDone) reviewState = 'done';
  else if (llmDone) reviewState = 'running';

  // Map backend's 40–90 range to a 0–100 progress for the LLM step display.
  const llmPct =
    llmState === 'running' ? Math.max(0, Math.min(100, Math.round(((progress - 40) / 50) * 100))) : 0;

  return [
    { key: 'sep', state: sepState },
    { key: 'context', state: sepState, count: occurrenceCount },
    { key: 'link', state: sepState },
    { key: 'llm', state: llmState, pct: llmPct },
    { key: 'review', state: reviewState },
  ];
}

