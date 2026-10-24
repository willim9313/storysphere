/**
 * Pure rules for the 密度矩陣 (5-5): which cell an event lands in, how a count
 * maps to a colour step, and which cell is a diagonal. No React.
 *
 * X = chapter (Sjuzhet, narrative order), Y = `chronologicalRank` decile
 * (Fabula, story order). Both axes read the rank the timeline already holds —
 * switching to this view never fetches.
 */

import type { TimelineDatum } from '@/lib/timelineGeometry';

export const RANK_BUCKETS = 10;

/** 0-based decile of a normalised rank. rank = 1.0 belongs to the top bucket. */
export function rankBucket(rank: number): number {
  return Math.min(RANK_BUCKETS - 1, Math.max(0, Math.floor(rank * RANK_BUCKETS)));
}

/** Inclusive percent range of a 0-based bucket: 0 → 1–10, 9 → 91–100. */
export function bucketRange(bucket: number): { from: number; to: number } {
  return { from: bucket * 10 + 1, to: bucket * 10 + 10 };
}

export type DensityStep = 0 | 1 | 2 | 3 | 4;

/**
 * Absolute count → colour step (1 / 2 / 3 / 4+ ↔ `--symbol-density-low/mid/
 * high/peak`). Deliberately never rescaled by the book's own maximum: the
 * scale has to stay comparable across books. The symbol heat map keeps its own
 * two-step rule; this does not touch it.
 */
export function densityStep(n: number): DensityStep {
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as DensityStep;
}

export function cellKey(chapter: number, bucket: number): string {
  return `${chapter}:${bucket}`;
}

export interface MatrixModel {
  /** `cellKey` → events in narrative order. Empty cells are absent. */
  cells: Map<string, TimelineDatum[]>;
  ranked: number;
  unranked: number;
}

/** Unranked events are counted, never placed. */
export function buildMatrix(data: TimelineDatum[]): MatrixModel {
  const cells = new Map<string, TimelineDatum[]>();
  let ranked = 0;
  let unranked = 0;
  for (const d of data) {
    if (d.chronologicalRank === null) {
      unranked += 1;
      continue;
    }
    ranked += 1;
    const k = cellKey(d.chapter, rankBucket(d.chronologicalRank));
    const list = cells.get(k);
    if (list) list.push(d);
    else cells.set(k, [d]);
  }
  return { cells, ranked, unranked };
}

/**
 * A cell is on the diagonal when its chapter column sits in the same decile of
 * the book as its rank row — "told in story order". The column's position is
 * the centre of its slot among `chapterCount` columns, so with ten chapters
 * column i meets row i exactly.
 */
export function isDiagonal(chapterIndex: number, chapterCount: number, bucket: number): boolean {
  if (chapterCount <= 0) return false;
  return rankBucket((chapterIndex + 0.5) / chapterCount) === bucket;
}
