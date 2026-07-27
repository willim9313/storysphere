/**
 * Timeline page geometry — pure coordinate math for the stave, matrix and
 * character lanes.
 *
 * The algorithms come from the Claude Design decision canvas
 * (`docs/handoff/20260725-timeline-page`); the rendering mechanism does not.
 * Everything here is framework-free and returns plain numbers so the React
 * components can render SVG/DOM without re-deriving anything.
 *
 * Two facts drive most of the shapes below:
 *   - `chronologicalRank === null` is a *stable* class of events, not a
 *     transient state (16% of the seed book stays null after computing).
 *     Every view therefore has an explicit place to put them.
 *   - Narrative order (sjuzhet) and story order (fabula) differ by
 *     `deviation`, which is the single quantity this page exists to show.
 */

import type { TemporalDisplacement, TimelineEvent } from '@/api/types';

/** |deviation| above which an event reads as genuinely displaced. */
export const OUTLIER_THRESHOLD = 0.15;
/** Minimum X gap (% of row width) between two stave annotations. */
export const ANNOTATION_MIN_GAP_PCT = 17;

/* ── Stave (章節順序 view) ─────────────────────────────────────── */

/** Row height in px. */
export const STAVE_ROW_HEIGHT = 68;
/** Y of the "narrative order === story order" midline, within a row. */
export const STAVE_MID = 26;
/** px per 1.0 of deviation. */
export const STAVE_SCALE = 38;
/** Height of the trailing unranked band inside a row. */
export const STAVE_UNRANKED_BAND = 13;
/** Target events per row; row count is derived from this, never hardcoded. */
export const STAVE_TARGET_PER_ROW = 22;
/** Horizontal inset so end points aren't flush against the row edges. */
const STAVE_X_INSET = 2;

/* ── Matrix (矩陣視圖) ─────────────────────────────────────────── */

export const MATRIX_HEIGHT = 356;
export const BEESWARM_SPACING = 7;
export const BEESWARM_UNRANKED_SPACING = 9;

/* ── Character lanes (角色軌跡) ────────────────────────────────── */

/** Consecutive absent events needed before it counts as an absence run. */
export const LANE_GAP_MIN = 3;
/** An absence run narrower than this (% of lane width) gets no label. */
export const LANE_LABEL_MIN_WIDTH_PCT = 9;
export const MAX_LANES = 3;

export type DerivedNarrativeMode =
  | 'present'
  | 'flashback'
  | 'flashforward'
  | 'unknown';

export interface TimelineDatum {
  id: string;
  /** Position in narrative order (sjuzhet), 0-based. */
  index: number;
  chapter: number;
  title: string;
  hasAnalysis: boolean;
  isKernel: boolean;
  chronologicalRank: number | null;
  /** Rank this event would have if narrative order === story order. */
  expectedRank: number;
  /** `rank - expectedRank`; null when unranked. Negative = told late. */
  deviation: number | null;
  outlier: boolean;
  mode: DerivedNarrativeMode;
  /** #21h verdict, or null when that analysis has not run for this event.
   *  Independent of `deviation`: that is geometry over `chronologicalRank`,
   *  this is the LLM reading story time. They can disagree, and where they do
   *  the verdict wins for labelling. */
  displacement: TemporalDisplacement | null;
  participantIds: string[];
  event: TimelineEvent;
}

/** Verdict types that are worth annotating; `linear` says nothing new. */
function verdictKind(
  d: TemporalDisplacement | null,
): 'flashback' | 'flashforward' | null {
  if (d?.type === 'analepsis') return 'flashback';
  if (d?.type === 'prolepsis') return 'flashforward';
  return null;
}

/**
 * Derive per-event geometry inputs. `events` must already be in narrative
 * order — the caller owns sorting (see `lib/timelineSort.ts`).
 */
export function buildTimelineData(events: TimelineEvent[]): TimelineDatum[] {
  const n = events.length;
  return events.map((event, index) => {
    const expectedRank = n > 1 ? index / (n - 1) : 0;
    const rank = event.chronologicalRank;
    const deviation = rank === null ? null : rank - expectedRank;
    const outlier = deviation !== null && Math.abs(deviation) > OUTLIER_THRESHOLD;
    return {
      id: event.id,
      index,
      chapter: event.chapter,
      title: event.title,
      hasAnalysis: event.hasAnalysis,
      isKernel: event.eventImportance === 'KERNEL',
      chronologicalRank: rank,
      expectedRank,
      deviation,
      outlier,
      mode: deriveMode(deviation),
      displacement: event.temporalDisplacement ?? null,
      participantIds: event.participants.map((p) => p.id),
      event,
    };
  });
}

/**
 * Narrative mode from deviation alone.
 *
 * Note this is *derived*, not the backend's `narrativeMode` field — the
 * backend reports `present` for 100% of the seed book, so it carries no
 * signal. Deviation does.
 */
export function deriveMode(deviation: number | null): DerivedNarrativeMode {
  if (deviation === null) return 'unknown';
  if (deviation < -OUTLIER_THRESHOLD) return 'flashback';
  if (deviation > OUTLIER_THRESHOLD) return 'flashforward';
  return 'present';
}

export interface StavePoint {
  id: string;
  /** X as a percentage of row width. */
  xPct: number;
  /** Y in px within the row. */
  yPx: number;
  radius: number;
  outlier: boolean;
  hasAnalysis: boolean;
  datum: TimelineDatum;
}

export interface StaveLink {
  x1Pct: number;
  y1Px: number;
  x2Pct: number;
  y2Px: number;
  outlier: boolean;
}

export interface StaveBand {
  chapter: number;
  x1Pct: number;
  x2Pct: number;
}

export interface StaveAnnotation {
  id: string;
  xPct: number;
  yPx: number;
  /** Which side of the point the text sits on. */
  align: 'left' | 'right';
  kind: 'flashback' | 'flashforward';
  /** True when #21h judged this event, false when only geometry flagged it. */
  confirmed: boolean;
  chapter: number;
  /** How many annotated candidates in this row share the chapter. */
  count: number;
}

export interface StaveRow {
  points: StavePoint[];
  links: StaveLink[];
  bands: StaveBand[];
  /** Unranked events, placed in the row's trailing band. */
  unranked: { id: string; xPct: number; datum: TimelineDatum }[];
  annotations: StaveAnnotation[];
  hasUnranked: boolean;
}

/** Row count for `n` events — derived, so it scales past the seed book. */
export function staveRowCount(n: number): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.ceil(n / STAVE_TARGET_PER_ROW));
}

/**
 * Lay out the stave.
 *
 * `isVisible` reflects the active filter *in filter mode*. Excluded points
 * break the connecting line (a gap is the honest rendering — the line would
 * otherwise imply adjacency that the filter removed). In dim mode the caller
 * passes `() => true` and dims via CSS instead, so the line stays intact.
 */
export function buildStaveRows(
  data: TimelineDatum[],
  isVisible: (d: TimelineDatum) => boolean = () => true,
): StaveRow[] {
  const rowCount = staveRowCount(data.length);
  if (rowCount === 0) return [];
  const perRow = Math.ceil(data.length / rowCount);

  const rows: StaveRow[] = [];
  for (let r = 0; r < rowCount; r++) {
    const slice = data.slice(r * perRow, (r + 1) * perRow);
    rows.push(buildStaveRow(slice, isVisible));
  }
  return rows;
}

function buildStaveRow(
  slice: TimelineDatum[],
  isVisible: (d: TimelineDatum) => boolean,
): StaveRow {
  const n = slice.length;
  const xOf = (k: number) =>
    n > 1 ? STAVE_X_INSET + (k / (n - 1)) * (100 - STAVE_X_INSET * 2) : 50;

  const points: StavePoint[] = [];
  const links: StaveLink[] = [];
  const bands: StaveBand[] = [];
  const unranked: StaveRow['unranked'] = [];

  let prev: { xPct: number; yPx: number; outlier: boolean } | null = null;
  let band: StaveBand | null = null;

  slice.forEach((d, k) => {
    const xPct = xOf(k);

    // Chapter bands cover every event, filtered or not — the band is a
    // navigation target, and chapters must not vanish when filtered.
    if (!band || band.chapter !== d.chapter) {
      band = { chapter: d.chapter, x1Pct: Math.max(0, xPct - 1.7), x2Pct: xPct + 1.7 };
      bands.push(band);
    } else {
      band.x2Pct = xPct + 1.7;
    }

    if (!isVisible(d)) {
      prev = null;
      return;
    }
    if (d.deviation === null) {
      unranked.push({ id: d.id, xPct, datum: d });
      return;
    }

    const yPx = STAVE_MID - d.deviation * STAVE_SCALE;
    points.push({
      id: d.id,
      xPct,
      yPx,
      radius: d.isKernel ? 4.5 : 3,
      outlier: d.outlier,
      hasAnalysis: d.hasAnalysis,
      datum: d,
    });

    if (prev) {
      links.push({
        x1Pct: prev.xPct,
        y1Px: prev.yPx,
        x2Pct: xPct,
        y2Px: yPx,
        outlier: d.outlier || prev.outlier,
      });
    }
    prev = { xPct, yPx, outlier: d.outlier };
  });

  return {
    points,
    links,
    bands,
    unranked,
    annotations: buildAnnotations(points),
    hasUnranked: unranked.length > 0,
  };
}

/**
 * Annotate at most one candidate per chapter per row — 199 raw outliers would
 * bury the chart in text.
 *
 * A candidate is either a geometric outlier or an event #21h judged as
 * analepsis/prolepsis. Those two sets overlap but neither contains the other:
 * the analysis can call a modest displacement a flashback, and geometry can
 * flag an event the analysis never reached. Within a chapter a judged event
 * outranks a merely-displaced one, because it is the stronger claim.
 */
function buildAnnotations(points: StavePoint[]): StaveAnnotation[] {
  const byChapter = new Map<number, StavePoint[]>();
  for (const p of points) {
    if (!p.outlier && !verdictKind(p.datum.displacement)) continue;
    const list = byChapter.get(p.datum.chapter);
    if (list) list.push(p);
    else byChapter.set(p.datum.chapter, [p]);
  }

  const out: StaveAnnotation[] = [];
  for (const [chapter, group] of byChapter) {
    const worst = group.reduce((a, b) => {
      const aConfirmed = verdictKind(a.datum.displacement) !== null;
      const bConfirmed = verdictKind(b.datum.displacement) !== null;
      if (aConfirmed !== bConfirmed) return bConfirmed ? b : a;
      return Math.abs(b.datum.deviation ?? 0) > Math.abs(a.datum.deviation ?? 0) ? b : a;
    });
    const verdict = verdictKind(worst.datum.displacement);
    out.push({
      id: worst.id,
      xPct: worst.xPct,
      yPx: worst.yPx,
      // Keep late-row annotations from running off the right edge.
      align: worst.xPct > 70 ? 'left' : 'right',
      kind: verdict ?? ((worst.datum.deviation ?? 0) < 0 ? 'flashback' : 'flashforward'),
      confirmed: verdict !== null,
      chapter,
      count: group.length,
    });
  }

  /* One annotation per chapter is not enough on its own: a label occupies a
     span of the row, and late-row ones are drawn leftwards from their point,
     so two annotations can collide however far apart their points are. Compare
     the spans, not the points. On a collision keep the earlier one — unless
     the other is a judged verdict, which is the stronger claim. */
  const span = (a: StaveAnnotation) => {
    const start = a.align === 'left' ? a.xPct - ANNOTATION_MIN_GAP_PCT : a.xPct;
    return { start, end: start + ANNOTATION_MIN_GAP_PCT };
  };

  const kept: StaveAnnotation[] = [];
  for (const a of out.sort((x, y) => span(x).start - span(y).start)) {
    const prev = kept.at(-1);
    if (prev && span(a).start < span(prev).end) {
      if (a.confirmed && !prev.confirmed) kept[kept.length - 1] = a;
      continue;
    }
    kept.push(a);
  }
  return kept;
}

/* ── Matrix ───────────────────────────────────────────────────── */

/**
 * Beeswarm offset in px for the `k`-th point within one chapter column.
 *
 * Must be counted *per chapter*: a global index makes same-chapter points
 * land on identical offsets and overlap into an unclickable stack.
 */
export function beeswarmOffset(k: number, spacing: number): number {
  return (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * spacing;
}

export interface MatrixPoint {
  id: string;
  /** X as a percentage of the plot width (chapter column centre + offset). */
  xPct: number;
  offsetPx: number;
  yPx: number;
  radius: number;
  outlier: boolean;
  hasAnalysis: boolean;
  datum: TimelineDatum;
}

/** Centre of chapter `chapter` as a percentage, given the chapter list. */
export function chapterCentrePct(chapter: number, chapters: number[]): number {
  const i = chapters.indexOf(chapter);
  if (i < 0 || chapters.length === 0) return 50;
  return ((i + 0.5) / chapters.length) * 100;
}

export function buildMatrixPoints(
  data: TimelineDatum[],
  chapters: number[],
): MatrixPoint[] {
  const out: MatrixPoint[] = [];
  for (const chapter of chapters) {
    const inChapter = data.filter(
      (d) => d.chapter === chapter && d.chronologicalRank !== null,
    );
    inChapter.forEach((d, k) => {
      out.push({
        id: d.id,
        xPct: chapterCentrePct(chapter, chapters),
        offsetPx: beeswarmOffset(k, BEESWARM_SPACING),
        yPx: MATRIX_HEIGHT - d.chronologicalRank! * MATRIX_HEIGHT,
        radius: d.isKernel ? 5 : 3.5,
        outlier: d.outlier,
        hasAnalysis: d.hasAnalysis,
        datum: d,
      });
    });
  }
  return out;
}

/** Unranked events for the matrix's degraded band, offset per chapter. */
export function buildMatrixUnranked(
  data: TimelineDatum[],
  chapters: number[],
): MatrixPoint[] {
  const seen = new Map<number, number>();
  return data
    .filter((d) => d.chronologicalRank === null)
    .map((d) => {
      const k = seen.get(d.chapter) ?? 0;
      seen.set(d.chapter, k + 1);
      return {
        id: d.id,
        xPct: chapterCentrePct(d.chapter, chapters),
        offsetPx: beeswarmOffset(k, BEESWARM_UNRANKED_SPACING),
        yPx: 0,
        radius: 3.5,
        outlier: false,
        hasAnalysis: d.hasAnalysis,
        datum: d,
      };
    });
}

/* ── Character lanes ──────────────────────────────────────────── */

export interface LaneRun {
  x1Pct: number;
  x2Pct: number;
  widthPct: number;
  /** Event count in the run. */
  length: number;
  startChapter: number;
  endChapter: number;
  /** True when the run starts at the very first event. */
  fromOpening: boolean;
}

export interface Lane {
  entityId: string;
  name: string;
  dots: { id: string; xPct: number; datum: TimelineDatum }[];
  /** Contiguous stretches where the character is present. */
  present: LaneRun[];
  /** Absence runs of at least `LANE_GAP_MIN` events. */
  absences: LaneRun[];
  /** Absence runs wide enough to carry a label. */
  labelled: LaneRun[];
  appearances: number;
  absent: number;
  longestAbsence: number;
}

/**
 * Build one character lane. X is the *narrative index* — lanes must not
 * depend on `chronologicalRank`, which can be null for any event.
 */
export function buildLane(
  data: TimelineDatum[],
  entityId: string,
  name: string,
): Lane {
  const n = data.length;
  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const present = data.map((d) => d.participantIds.includes(entityId));

  const dots = data
    .filter((_, i) => present[i])
    .map((d) => ({ id: d.id, xPct: xOf(d.index), datum: d }));

  const presentRuns: LaneRun[] = [];
  const absences: LaneRun[] = [];
  let longestAbsence = 0;

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && present[j + 1] === present[i]) j++;
    const run: LaneRun = {
      x1Pct: xOf(i),
      x2Pct: xOf(j),
      widthPct: xOf(j) - xOf(i),
      length: j - i + 1,
      startChapter: data[i].chapter,
      endChapter: data[j].chapter,
      fromOpening: i === 0,
    };
    if (present[i]) {
      presentRuns.push(run);
    } else if (run.length >= LANE_GAP_MIN) {
      absences.push(run);
      longestAbsence = Math.max(longestAbsence, run.length);
    }
    i = j + 1;
  }

  const appearances = present.filter(Boolean).length;
  return {
    entityId,
    name,
    dots,
    present: presentRuns,
    absences,
    labelled: absences.filter((a) => a.widthPct >= LANE_LABEL_MIN_WIDTH_PCT),
    appearances,
    absent: n - appearances,
    longestAbsence,
  };
}

/** Narrative positions where every selected character is present. */
export function coPresence(data: TimelineDatum[], entityIds: string[]): number[] {
  if (entityIds.length < 2) return [];
  return data
    .filter((d) => entityIds.every((id) => d.participantIds.includes(id)))
    .map((d) => d.index);
}

/* ── Headline stats ───────────────────────────────────────────── */

export interface TimelineStats {
  total: number;
  ranked: number;
  unranked: number;
  outliers: number;
  /** Ranked events that sit close to the midline. */
  onLine: number;
  analyzed: number;
  rows: number;
}

export function timelineStats(data: TimelineDatum[]): TimelineStats {
  const ranked = data.filter((d) => d.chronologicalRank !== null).length;
  const outliers = data.filter((d) => d.outlier).length;
  return {
    total: data.length,
    ranked,
    unranked: data.length - ranked,
    outliers,
    onLine: ranked - outliers,
    analyzed: data.filter((d) => d.hasAnalysis).length,
    rows: staveRowCount(data.length),
  };
}

/** Sorted unique chapter numbers present in the data. */
export function chapterList(data: TimelineDatum[]): number[] {
  return [...new Set(data.map((d) => d.chapter))].sort((a, b) => a - b);
}
