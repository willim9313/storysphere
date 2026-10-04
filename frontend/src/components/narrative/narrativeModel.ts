// Narrative page — pure logic behind the chapter axis, confidence, review and
// the three "why are there no representative events" reasons.
//
// `chapter_range` is a discrete list that arrives unsorted and may repeat, e.g.
// the mentor stage on chapters 1, 2, 5 and 8. Everything that used to read
// `range[0]` and `range[last]` (and so drew 1–8 as one block) goes through
// `normalizeChapters` first.

import type { HeroJourneyStage, NarrativeReviewStatus } from '@/api/narrative';

/** A stage this many chapters wide on one chapter is "shared" on the band. */
export const SHARED_MIN_STAGES = 3;

/** Sorted, de-duplicated, positive-integer chapters. */
export function normalizeChapters(range: readonly number[] | null | undefined): number[] {
  if (!range) return [];
  return [...new Set(range.filter((c) => Number.isInteger(c) && c > 0))].sort((a, b) => a - b);
}

/** Maximal runs of consecutive chapters: [1,2,5,8] → [[1,2],[5,5],[8,8]]. */
export function chapterRuns(range: readonly number[] | null | undefined): [number, number][] {
  const out: [number, number][] = [];
  for (const c of normalizeChapters(range)) {
    const last = out[out.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else out.push([c, c]);
  }
  return out;
}

/** "1–2、5、8" — empty string for no chapters. */
export function formatChapterRuns(range: readonly number[] | null | undefined): string {
  return chapterRuns(range)
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join('、');
}

/** How many stages actually sit on each chapter 1..n (index ch-1). */
export function stagesPerChapter(stages: readonly HeroJourneyStage[], n: number): number[] {
  const out = Array.from({ length: n }, () => 0);
  for (const s of stages) {
    for (const c of normalizeChapters(s.chapter_range)) if (c <= n) out[c - 1] += 1;
  }
  return out;
}

/** Chapters carrying `SHARED_MIN_STAGES` or more stages. */
export function sharedChapters(perChapter: readonly number[]): Set<number> {
  const out = new Set<number>();
  perChapter.forEach((count, i) => {
    if (count >= SHARED_MIN_STAGES) out.add(i + 1);
  });
  return out;
}

/** Last chapter any stage touches (0 when none). */
export function lastStageChapter(stages: readonly HeroJourneyStage[]): number {
  let m = 0;
  for (const s of stages) {
    const c = normalizeChapters(s.chapter_range);
    if (c.length) m = Math.max(m, c[c.length - 1]);
  }
  return m;
}

/**
 * Stage ids that start earlier than the stage before them (Campbell order and
 * chapter order disagreeing). `ordered` must already be in canonical order.
 * "Starts" is the first real chapter, not the first array element.
 */
export function reversedStageIds(ordered: readonly HeroJourneyStage[]): Set<string> {
  const out = new Set<string>();
  let prev = 0;
  for (const s of ordered) {
    const c = normalizeChapters(s.chapter_range);
    if (!c.length) continue;
    if (prev > 0 && c[0] < prev) out.add(s.stage_id);
    prev = c[0];
  }
  return out;
}

/** Other stages whose actual chapter set equals this stage's. */
export function stagesSharingRange(
  stage: HeroJourneyStage,
  all: readonly HeroJourneyStage[],
): HeroJourneyStage[] {
  const mine = normalizeChapters(stage.chapter_range);
  if (!mine.length) return [];
  const key = mine.join(',');
  return all.filter(
    (s) => s.stage_id !== stage.stage_id && normalizeChapters(s.chapter_range).join(',') === key,
  );
}

// ── Confidence ─────────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLD = 0.6;

/** min–max over the stages that carry a score; null when there are none. */
export function confidenceSpan(stages: readonly HeroJourneyStage[]): { min: number; max: number } | null {
  const scored = stages.map((s) => s.confidence).filter((v) => v > 0);
  if (!scored.length) return null;
  return { min: Math.min(...scored), max: Math.max(...scored) };
}

/** Stages scored above zero but under the threshold. */
export function lowConfidenceCount(stages: readonly HeroJourneyStage[]): number {
  return stages.filter((s) => s.confidence > 0 && s.confidence < CONFIDENCE_THRESHOLD).length;
}

// ── Representative events ──────────────────────────────────────────

/**
 * Resolve ids to events keeping each id with its own event. The old code
 * filtered unresolvable ids out and then read `ids[i]` by the filtered index,
 * so after one miss every later link pointed at the wrong event.
 */
export function resolveRepEvents<E>(
  ids: readonly string[] | null | undefined,
  events: Readonly<Record<string, E>>,
): { id: string; ev: E }[] {
  const out: { id: string; ev: E }[] = [];
  for (const id of ids ?? []) {
    const ev = events[id];
    if (ev !== undefined) out.push({ id, ev });
  }
  return out;
}

/**
 * Why a stage shows no representative events — one sentence, chosen from what
 * is actually known:
 *   noEvidence   the stage itself is absent
 *   beyondKernel its first chapter is past where kernel events stop
 *   shared       another stage covers exactly the same chapters
 *   gap          none of the above: its chapters hold no kernel event (or the
 *                kernel list is unavailable). Not one of the three sentences in
 *                the design — see DS_V3_DESIGN_FEEDBACK 5-NR-5.
 */
export type RepEmptyReason = 'noEvidence' | 'beyondKernel' | 'shared' | 'gap';

export function repEmptyReason(input: {
  absent: boolean;
  range: readonly number[];
  /** Chapter of each kernel event (one entry per event). */
  kernelChapters: readonly number[];
  sharingCount: number;
}): RepEmptyReason {
  if (input.absent) return 'noEvidence';
  const chapters = normalizeChapters(input.range);
  const lastKernel = input.kernelChapters.length ? Math.max(...input.kernelChapters) : 0;
  if (lastKernel > 0 && chapters.length > 0 && chapters[0] > lastKernel) return 'beyondKernel';
  if (input.sharingCount > 0) return 'shared';
  return 'gap';
}

// ── Book-level review (three values, no "modified") ────────────────

/** Pressing the lit button again withdraws it; pressing the other one switches. */
export function nextReviewStatus(
  current: NarrativeReviewStatus,
  pressed: 'approved' | 'rejected',
): NarrativeReviewStatus {
  return current === pressed ? 'pending' : pressed;
}

// ── Cross-evidence ─────────────────────────────────────────────────

/** Analepsis / prolepsis counts from the per-event displacement verdicts. */
export function displacementCounts(
  events: readonly { temporalDisplacement?: { type: string } | null }[],
): { analepsis: number; prolepsis: number } {
  let analepsis = 0;
  let prolepsis = 0;
  for (const e of events) {
    if (e.temporalDisplacement?.type === 'analepsis') analepsis += 1;
    else if (e.temporalDisplacement?.type === 'prolepsis') prolepsis += 1;
  }
  return { analepsis, prolepsis };
}

// ── Confirm-dialog loss list ───────────────────────────────────────

/**
 * The approved strings read "將被刪除／覆寫：<what>" as one sentence. The dialog
 * wants the lead-in as a section title and the rest as its one item, so split on
 * the first colon (full- or half-width). No colon → the whole string is the item.
 */
export function splitAffects(text: string): { title: string; item: string } {
  const m = /^([^：:]*)[：:]\s*([\s\S]+)$/.exec(text);
  return m ? { title: m[1].trim(), item: m[2].trim() } : { title: '', item: text };
}

// ── Summary prerequisite (hard gate) ───────────────────────────────

export interface SummaryGate {
  /** Chapter summaries are known — the chapter list has been loaded. */
  known: boolean;
  total: number;
  done: number;
  missing: number;
  ready: boolean;
  /** Analysis would write zero stages; the trigger must stay disabled. */
  blocked: boolean;
}

export function summaryGate(
  chapters: readonly { summary?: string | null }[] | undefined,
  fallbackTotal: number,
): SummaryGate {
  const total = chapters?.length ?? fallbackTotal;
  const done = chapters?.filter((c) => c.summary?.trim()).length ?? 0;
  const ready = total > 0 && done === total;
  return {
    known: !!chapters,
    total,
    done,
    missing: Math.max(0, total - done),
    ready,
    blocked: !!chapters && !ready,
  };
}
