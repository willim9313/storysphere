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

/* ────────────────────────────────────────────────────────────────────────────
 * Three-way segmentation
 *
 * Everything above splits chapters two ways — `>= 1` is body, below is disclosed
 * as a count with no axis slot — and `bodyChapterMax` folds a chapter past the
 * book's own count into the body axis. That was right for charts whose only job
 * was not to drop occurrences.
 *
 * It is not enough to say what a symbol *does*. Front matter and an afterword are
 * both "outside the body" but they are opposites as evidence: a colophon's
 * 「臨海市鹽埕區」 is noise, while 「把哀悼寫進地理、寫進潮汐表裡」 in the afterword is
 * the strongest symbolic evidence the book has. Collapsing them loses the second
 * to protect against the first. So front / body / back are three segments here,
 * each with its own axis slot, and only body chapters feed span and shape.
 *
 * Classification comes from the book's own `ChapterRole` values rather than from
 * the chapter number: a number cannot tell you whether 序 is a preface or the
 * first chapter of the story. The numeric rule survives only as a fallback for
 * chapters the book has no role for.
 *
 * These additions do not replace the functions above, which still back the charts
 * until the page is rebuilt on top of this.
 * ──────────────────────────────────────────────────────────────────────────── */

export type ChapterSegment = 'front' | 'body' | 'back';

/** `ChapterRole` values that pin a segment regardless of position. */
const ROLE_SEGMENTS: Readonly<Record<string, ChapterSegment>> = {
  body: 'body',
  toc: 'front',
  preface: 'front',
  afterword: 'back',
  // `other` is deliberately absent — it carries no direction, so position decides.
};

export interface ChapterAxisSlot {
  chapter: number;
  segment: ChapterSegment;
  /**
   * The book's own `ChapterRole` for this chapter, when it declared one.
   *
   * Carried so a label can say 「目次」 rather than 「前」 twice in a row. The
   * alternative is reading it off the chapter number — 名字的潮汐 happens to number
   * its colophon -1 and its contents 0 — which invents a convention the payload
   * already states.
   */
  role?: string;
}

export interface ChapterAxis {
  /** Every slot the charts render, ascending: front matter, body, back matter. */
  slots: readonly ChapterAxisSlot[];
  /** Story chapters only — the length the reader perceives. */
  bodyChapterCount: number;
  /**
   * Highest single body-chapter count across every symbol. Never 0, so callers
   * can divide. Shading each row against its own maximum makes colour mean
   * "present at all" and renders the book's dominant image palest.
   */
  globalBodyMax: number;
  segments: ReadonlyMap<number, ChapterSegment>;
}

/** Position-only classification, for chapters the book declares no role for. */
function segmentByPosition(chapter: number, bodyChapterCount: number): ChapterSegment {
  if (chapter < BODY_CHAPTER_MIN) return 'front';
  if (bodyChapterCount > 0 && chapter > bodyChapterCount) return 'back';
  return 'body';
}

/** Which segment a chapter belongs to, per the axis it was built with. */
export function chapterSegment(chapter: number, axis: ChapterAxis): ChapterSegment {
  return axis.segments.get(chapter) ?? segmentByPosition(chapter, axis.bodyChapterCount);
}

/** Chapter numbers any symbol actually occurs in. */
function occupiedChapters(distributions: readonly Distribution[]): number[] {
  const chapters: number[] = [];
  for (const dist of distributions) {
    for (const [key, count] of Object.entries(dist)) {
      const chapter = Number(key);
      if (Number.isFinite(chapter) && count > 0) chapters.push(chapter);
    }
  }
  return chapters;
}

function buildSegmentMap(
  roles: Readonly<Record<string, string>>,
  declaredBodyCount: number,
): Map<number, ChapterSegment> {
  const segments = new Map<number, ChapterSegment>();
  for (const [key, role] of Object.entries(roles)) {
    const chapter = Number(key);
    if (!Number.isFinite(chapter)) continue;
    segments.set(
      chapter,
      ROLE_SEGMENTS[role] ?? segmentByPosition(chapter, declaredBodyCount),
    );
  }
  return segments;
}

function highestBodyCount(
  distributions: readonly Distribution[],
  bodyChapters: ReadonlySet<number>,
): number {
  let max = 1;
  for (const dist of distributions) {
    for (const [key, count] of Object.entries(dist)) {
      if (bodyChapters.has(Number(key))) max = Math.max(max, count);
    }
  }
  return max;
}

/**
 * Build the axis every chart and signal on the page shares.
 *
 * Slots cover the union of the book's body chapters and every chapter any symbol
 * actually occurs in, so an unoccupied body chapter still gets its column (a gap
 * is information) and an occurrence past the book's chapter count still gets a
 * slot instead of vanishing.
 */
export function buildChapterAxis(
  distributions: readonly Distribution[],
  opts: {
    chapterRoles?: Readonly<Record<string, string>> | null;
    bodyChapterCount?: number | null;
  } = {},
): ChapterAxis {
  const declaredBodyCount =
    opts.bodyChapterCount && opts.bodyChapterCount > 0 ? opts.bodyChapterCount : 0;
  const segments = buildSegmentMap(opts.chapterRoles ?? {}, declaredBodyCount);

  // Prefer the roles' own count: it is the book's answer, and it stays right even
  // when the caller passes nothing.
  const roleBodyCount = [...segments.values()].filter((s) => s === 'body').length;
  const bodyChapterCount = roleBodyCount > 0 ? roleBodyCount : declaredBodyCount;

  const chapters = new Set<number>(segments.keys());
  for (let ch = BODY_CHAPTER_MIN; ch <= bodyChapterCount; ch += 1) chapters.add(ch);
  for (const chapter of occupiedChapters(distributions)) chapters.add(chapter);

  const roles = opts.chapterRoles ?? {};
  const slots: ChapterAxisSlot[] = [...chapters]
    .sort((a, b) => a - b)
    .map((chapter) => ({
      chapter,
      segment: segments.get(chapter) ?? segmentByPosition(chapter, bodyChapterCount),
      role: roles[String(chapter)],
    }));

  const bodyChapters = new Set(
    slots.filter((slot) => slot.segment === 'body').map((slot) => slot.chapter),
  );

  return {
    slots,
    bodyChapterCount,
    globalBodyMax: highestBodyCount(distributions, bodyChapters),
    segments,
  };
}

/**
 * The count a full-height bar stands for, for one symbol on one axis.
 *
 * Floored by the cross-symbol body maximum so a lone occurrence does not draw a
 * full-height bar, and raised to this symbol's own largest slot so no bar
 * overflows its box — 海 holds 3 occurrences in the colophon while no chapter holds
 * more than 2.
 *
 * Lives here, beside the axis it reads, because the caption states this number and
 * the legend derives its steps from it. Computing it separately in each of the
 * three places is how a card came to claim 「高度基準 2」 above a chart drawn
 * against 3.
 */
export function barScale(distribution: Distribution, axis: ChapterAxis): number {
  const ownMax = axis.slots.reduce(
    (max, slot) => Math.max(max, distribution[String(slot.chapter)] ?? 0),
    0,
  );
  return Math.max(1, axis.globalBodyMax, ownMax);
}

/**
 * Whether any chapter stands out, or the symbol is simply spread evenly.
 *
 * `peakBodyChapters` returns every chapter attaining the maximum, which is right
 * — PR #27 fixed it silently reporting only the first of a tie — but when a symbol
 * occurs once in each of seven chapters all seven tie, and 「峰值第 1、2、4、5、7、8、
 * 10 章」 is a caption that means "flat" while looking like a finding. Charts use
 * this to drop the peak markers too: seven identical markers over seven identical
 * bars point at nothing.
 */
export function hasDistinctPeak(distribution: SegmentedDistribution): boolean {
  const occupied = distribution.bodyChapters.length;
  return occupied > 1 && distribution.peakBodyChapters.length < occupied;
}

export interface SegmentedDistribution {
  /** Occurrences in front matter — title page, colophon, dedication, contents. */
  front: number;
  body: number;
  /** Occurrences past the last body chapter — afterword, appendix. */
  back: number;
  /** Body chapters the symbol occurs in, ascending. */
  bodyChapters: number[];
  bodyEntries: Array<[number, number]>;
  firstBodyChapter: number | null;
  lastBodyChapter: number | null;
  /** Body chapters attaining `peakBodyCount`; every tie, not the top N. */
  peakBodyChapters: number[];
  peakBodyCount: number;
}

/**
 * Split one symbol's distribution across the three segments in a single pass.
 *
 * Returned together because the signal layer needs all of it at once, and because
 * a caller that derives "first chapter" from one rule and draws bars from another
 * is how a card came to read 「首見第 -1 章 · 峰值第 -1 章」 while its peak marker
 * sat over chapter 7.
 */
export function segmentDistribution(
  distribution: Distribution,
  axis: ChapterAxis,
): SegmentedDistribution {
  let front = 0;
  let body = 0;
  let back = 0;
  const entries: Array<[number, number]> = [];

  for (const [key, count] of Object.entries(distribution)) {
    const chapter = Number(key);
    if (!Number.isFinite(chapter) || count <= 0) continue;
    switch (chapterSegment(chapter, axis)) {
      case 'front':
        front += count;
        break;
      case 'back':
        back += count;
        break;
      default:
        body += count;
        entries.push([chapter, count]);
    }
  }

  entries.sort((a, b) => a[0] - b[0]);
  const peakBodyCount = entries.reduce((max, [, count]) => Math.max(max, count), 0);

  return {
    front,
    body,
    back,
    bodyChapters: entries.map(([chapter]) => chapter),
    bodyEntries: entries,
    firstBodyChapter: entries[0]?.[0] ?? null,
    lastBodyChapter: entries.at(-1)?.[0] ?? null,
    peakBodyChapters: entries
      .filter(([, count]) => count === peakBodyCount)
      .map(([chapter]) => chapter),
    peakBodyCount,
  };
}
