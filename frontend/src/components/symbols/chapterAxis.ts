/**
 * Chapter-axis helpers for the imagery charts.
 *
 * `ImageryEntity.chapter_distribution` is **not** keyed `1..book.chapterCount`.
 * Occurrences are recorded per chunk, and chunks exist outside the body text, so
 * real books produce keys like:
 *
 *   海 → { "-1": 3, "0": 2, "1": 1, "5": 1, "7": 2, "8": 1, "9": 1, "11": 2 }
 *
 * where `-1` / `0` are front matter (title page, colophon, dedication) and `11`
 * sits past a `chapterCount` of 10. The charts used to build their axis with
 * `Array.from({ length: totalChapters }, (_, i) => distribution[i + 1])`, which
 * silently dropped every one of those — 7 of 海's 13 occurrences never reached
 * the screen, and symbols occurring only in front matter rendered as an entirely
 * empty row next to a non-zero frequency.
 *
 * The rules here:
 *
 * 1. **Body chapters are `>= 1`.** Anything below is not a chapter the reader can
 *    navigate to, so it never gets an axis slot; it is counted by
 *    `outsideBodyCount` and disclosed as text instead.
 * 2. **The axis right edge covers what actually occurs**, not just what the book
 *    metadata claims, so a chapter past `chapterCount` still gets a slot.
 * 3. **Peaks are the chapters attaining the maximum count**, not the top N. Taking
 *    the top 3 of a flat `{1:1, 5:1, 7:2}` marked a single-occurrence chapter as a
 *    peak alongside the real one.
 */

/** Chapter numbers below this are front/back matter, not body chapters. */
export const BODY_CHAPTER_MIN = 1;

type Distribution = Record<string, number>;

/** `[chapter, count]` pairs for body chapters only, ascending by chapter. */
export function bodyEntries(distribution: Distribution): Array<[number, number]> {
  return Object.entries(distribution)
    .map(([ch, cnt]) => [Number(ch), cnt] as [number, number])
    .filter(([ch, cnt]) => Number.isFinite(ch) && ch >= BODY_CHAPTER_MIN && cnt > 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Occurrences that fall outside the body text and therefore outside every chart.
 * Callers disclose this so a chart showing 6 bars next to a frequency of 13 is
 * explained rather than simply wrong.
 */
export function outsideBodyCount(distribution: Distribution): number {
  return Object.entries(distribution).reduce((sum, [ch, cnt]) => {
    const n = Number(ch);
    return Number.isFinite(n) && n < BODY_CHAPTER_MIN ? sum + cnt : sum;
  }, 0);
}

/**
 * Right edge of the shared chapter axis: wide enough for the book's own chapter
 * count *and* for any chapter a symbol actually occurs in. Every chart on the page
 * uses the same value so rows stay comparable.
 */
export function bodyChapterMax(
  distributions: readonly Distribution[],
  bookChapterCount?: number | null,
): number {
  const fromData = distributions.reduce((max, dist) => {
    const entries = bodyEntries(dist);
    const last = entries.at(-1)?.[0] ?? 0;
    return Math.max(max, last);
  }, 0);
  const fromBook = bookChapterCount && bookChapterCount > 0 ? bookChapterCount : 0;
  return Math.max(fromData, fromBook);
}

/** First body chapter the symbol appears in; `null` when it only occurs outside. */
export function firstBodyChapter(distribution: Distribution): number | null {
  return bodyEntries(distribution)[0]?.[0] ?? null;
}

/** Body chapters attaining the symbol's highest per-chapter count, ascending. */
export function peakBodyChapters(distribution: Distribution): number[] {
  const entries = bodyEntries(distribution);
  if (entries.length === 0) return [];
  const max = entries.reduce((m, [, cnt]) => Math.max(m, cnt), 0);
  return entries.filter(([, cnt]) => cnt === max).map(([ch]) => ch);
}

/**
 * Highest single-chapter count across *all* symbols, for shading that is
 * comparable between rows.
 *
 * Normalising each row against its own maximum made colour mean "does this
 * chapter contain the symbol at all": 海 (13 occurrences, the book's dominant
 * image) rendered in the palest step while every one-occurrence symbol rendered
 * in the darkest — the exact inverse of the truth the heatmap exists to show.
 */
export function globalChapterMax(distributions: readonly Distribution[]): number {
  return distributions.reduce((max, dist) => {
    const rowMax = bodyEntries(dist).reduce((m, [, cnt]) => Math.max(m, cnt), 0);
    return Math.max(max, rowMax);
  }, 1);
}
