import { describe, expect, it } from 'vitest';
import {
  bodyChapterMax,
  bodyEntries,
  firstBodyChapter,
  globalChapterMax,
  outsideBodyCount,
  peakBodyChapters,
} from './chapterAxis';

/** 名字的潮汐「海」的真實分布：含前置頁（-1、0）與超出 chapterCount 的第 11 章。 */
const SEA = { '-1': 3, '0': 2, '1': 1, '5': 1, '7': 2, '8': 1, '9': 1, '11': 2 };
/** 「腳印」：唯一一次出現在前置頁。 */
const FOOTPRINT = { '-1': 1 };
/** 「手」：分布平坦，每章各一次。 */
const HAND = { '1': 1, '2': 1, '4': 1, '5': 1, '7': 1, '8': 1, '10': 1 };

describe('bodyEntries', () => {
  it('drops front matter and sorts ascending', () => {
    expect(bodyEntries(SEA)).toEqual([[1, 1], [5, 1], [7, 2], [8, 1], [9, 1], [11, 2]]);
  });

  it('returns nothing when every occurrence is outside the body', () => {
    expect(bodyEntries(FOOTPRINT)).toEqual([]);
  });

  it('ignores zero counts', () => {
    expect(bodyEntries({ '1': 0, '2': 3 })).toEqual([[2, 3]]);
  });

  it('returns nothing for an empty distribution', () => {
    expect(bodyEntries({})).toEqual([]);
  });
});

describe('outsideBodyCount', () => {
  it('sums occurrences below chapter 1', () => {
    expect(outsideBodyCount(SEA)).toBe(5);
  });

  it('is zero when everything sits in the body', () => {
    expect(outsideBodyCount(HAND)).toBe(0);
  });
});

describe('bodyChapterMax', () => {
  it('extends past the book chapter count when a symbol occurs beyond it', () => {
    expect(bodyChapterMax([SEA], 10)).toBe(11);
  });

  it('keeps the book chapter count when no symbol reaches it', () => {
    expect(bodyChapterMax([HAND], 10)).toBe(10);
  });

  it('falls back to the data when the book count is missing', () => {
    expect(bodyChapterMax([SEA], null)).toBe(11);
  });

  it('spans every symbol, not just the first', () => {
    expect(bodyChapterMax([FOOTPRINT, HAND, SEA], 0)).toBe(11);
  });

  it('is zero when there is nothing to plot', () => {
    expect(bodyChapterMax([FOOTPRINT], null)).toBe(0);
  });
});

describe('firstBodyChapter', () => {
  it('skips front matter rather than reporting chapter -1', () => {
    expect(firstBodyChapter(SEA)).toBe(1);
  });

  it('is null when the symbol never appears in the body', () => {
    expect(firstBodyChapter(FOOTPRINT)).toBeNull();
  });
});

describe('peakBodyChapters', () => {
  it('returns every chapter tied at the maximum', () => {
    expect(peakBodyChapters(SEA)).toEqual([7, 11]);
  });

  it('marks all chapters when the distribution is flat', () => {
    expect(peakBodyChapters(HAND)).toEqual([1, 2, 4, 5, 7, 8, 10]);
  });

  it('never marks a front-matter chapter, even when it holds the true maximum', () => {
    // SEA peaks at chapter -1 (3 occurrences) overall; the chart must not say so.
    expect(peakBodyChapters(SEA)).not.toContain(-1);
  });

  it('is empty when the symbol has no body occurrences', () => {
    expect(peakBodyChapters(FOOTPRINT)).toEqual([]);
  });
});

describe('globalChapterMax', () => {
  it('takes the highest single-chapter count across all symbols', () => {
    expect(globalChapterMax([HAND, SEA])).toBe(2);
  });

  it('ignores front matter counts that no chart renders', () => {
    // SEA's largest bucket is chapter -1 with 3; the axis only shows body chapters.
    expect(globalChapterMax([SEA])).toBe(2);
  });

  it('never returns zero, so callers can divide by it', () => {
    expect(globalChapterMax([FOOTPRINT])).toBe(1);
    expect(globalChapterMax([])).toBe(1);
  });
});
