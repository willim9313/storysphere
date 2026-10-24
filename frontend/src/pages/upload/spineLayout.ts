import type { ReviewChapter } from '@/api/types';

/**
 * Geometry of the chapter-review structure spine (全書結構脊). The heights are
 * the data — block height ∝ paragraph count turns the spine into a chapter
 * length distribution chart — so the formulas below are spec, not layout
 * (spec-function §6「不可丟失」#1). Do not tweak them for looks.
 */

/** 逐章態 block min-height: `30 + paraCount * 15`. */
export function spineBlockHeight(paraCount: number): number {
  return 30 + paraCount * 15;
}

/** 收合導軌 bar height: `14 + paraCount * 8`. */
export function railBarHeight(paraCount: number): number {
  return 14 + paraCount * 8;
}

/**
 * 總覽態 (02 決議紀錄 B′): every chapter fits one viewport, no scrolling.
 * Each row is `max(2, round(paraCount / totalParas × usable))`, where `usable`
 * is the available height minus the 1px gaps between rows.
 */
export function overviewHeights(paraCounts: number[], avail: number): number[] {
  const total = paraCounts.reduce((a, n) => a + n, 0);
  const usable = Math.max(0, avail - Math.max(0, paraCounts.length - 1));
  return paraCounts.map((n) => Math.max(2, total > 0 ? Math.round((n / total) * usable) : 0));
}

/** Labels in the overview only fit rows at least this tall. */
export const OVERVIEW_LABEL_MIN = 12;

/**
 * 「疑似漏切一章」heuristic, unchanged: a body chapter holding more than one
 * paragraph with a detected title span probably swallowed the next chapter.
 */
export function isMisSplit(ch: Pick<ReviewChapter, 'role' | 'paragraphs'>): boolean {
  if ((ch.role ?? 'body') !== 'body') return false;
  return ch.paragraphs.filter((p) => p.titleSpan).length > 1;
}
