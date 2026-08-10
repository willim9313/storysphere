import { describe, expect, it } from 'vitest';
import {
  bodyChapterMax,
  bodyEntries,
  buildChapterAxis,
  chapterSegment,
  firstBodyChapter,
  globalChapterMax,
  outsideBodyCount,
  peakBodyChapters,
  segmentDistribution,
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

/** 名字的潮汐的真實章節角色：前置頁 -1／目次 0／正文 1–10／後記 11。 */
const TIDE_ROLES = {
  '-1': 'preface',
  '0': 'toc',
  '1': 'body', '2': 'body', '3': 'body', '4': 'body', '5': 'body',
  '6': 'body', '7': 'body', '8': 'body', '9': 'body', '10': 'body',
  '11': 'afterword',
};
const TIDE_AXIS = buildChapterAxis([SEA, HAND, FOOTPRINT], {
  chapterRoles: TIDE_ROLES,
  bodyChapterCount: 10,
});

describe('buildChapterAxis', () => {
  it('gives front matter, body and back matter their own ordered slots', () => {
    expect(TIDE_AXIS.slots.map((s) => s.chapter)).toEqual([
      -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(TIDE_AXIS.slots.map((s) => s.segment)).toEqual([
      'front', 'front', 'body', 'body', 'body', 'body', 'body',
      'body', 'body', 'body', 'body', 'body', 'back',
    ]);
  });

  it('classifies a chapter past the body count as back matter, not body', () => {
    // The two-way helpers treat chapter 11 as body; the afterword is not the story.
    expect(chapterSegment(11, TIDE_AXIS)).toBe('back');
    expect(bodyEntries(SEA)).toContainEqual([11, 2]);
  });

  it('trusts the declared role over the chapter number', () => {
    // A 序 whose content is story is role `body`, even though it sits at 0.
    const axis = buildChapterAxis([{ '0': 1 }], {
      chapterRoles: { '0': 'body', '1': 'body' },
    });
    expect(chapterSegment(0, axis)).toBe('body');
  });

  it('lets position decide for roles that carry no direction', () => {
    const axis = buildChapterAxis([], {
      chapterRoles: { '-1': 'other', '1': 'body', '2': 'other' },
      bodyChapterCount: 1,
    });
    expect(chapterSegment(-1, axis)).toBe('front');
    expect(chapterSegment(2, axis)).toBe('back');
  });

  it('keeps a column for a body chapter no symbol occurs in', () => {
    // An absence is information: the reader should see where the symbol is missing.
    const axis = buildChapterAxis([{ '1': 1, '3': 1 }], {
      chapterRoles: { '1': 'body', '2': 'body', '3': 'body' },
    });
    expect(axis.slots.map((s) => s.chapter)).toEqual([1, 2, 3]);
  });

  it('counts body chapters from the roles, ignoring front and back matter', () => {
    expect(TIDE_AXIS.bodyChapterCount).toBe(10);
  });

  it('falls back to the numeric rule with no roles at all', () => {
    const axis = buildChapterAxis([SEA], { bodyChapterCount: 10 });
    expect(chapterSegment(-1, axis)).toBe('front');
    expect(chapterSegment(5, axis)).toBe('body');
    expect(chapterSegment(11, axis)).toBe('back');
  });

  it('treats every chapter from 1 up as body when the count is unknown', () => {
    const axis = buildChapterAxis([SEA]);
    expect(chapterSegment(11, axis)).toBe('body');
  });

  it('shares one shading scale across symbols, excluding non-body counts', () => {
    // SEA's largest bucket is the colophon (3) and its afterword holds 2; the
    // scale must come from body chapters, where the real maximum is 2.
    expect(TIDE_AXIS.globalBodyMax).toBe(2);
  });

  it('never yields a zero scale, so callers can divide by it', () => {
    expect(buildChapterAxis([FOOTPRINT], { chapterRoles: TIDE_ROLES }).globalBodyMax).toBe(1);
    expect(buildChapterAxis([]).globalBodyMax).toBe(1);
  });
});

describe('segmentDistribution', () => {
  it('splits the real 海 distribution three ways', () => {
    const seg = segmentDistribution(SEA, TIDE_AXIS);
    // 13 occurrences: 5 in front matter, 6 in the body, 2 in the afterword.
    expect(seg.front).toBe(5);
    expect(seg.body).toBe(6);
    expect(seg.back).toBe(2);
    expect(seg.front + seg.body + seg.back).toBe(13);
  });

  it('reports only body chapters as the shape the symbol traces', () => {
    const seg = segmentDistribution(SEA, TIDE_AXIS);
    expect(seg.bodyChapters).toEqual([1, 5, 7, 8, 9]);
    expect(seg.firstBodyChapter).toBe(1);
    expect(seg.lastBodyChapter).toBe(9);
  });

  it('never reports a front-matter chapter as the first appearance', () => {
    // The card used to read 「首見第 -1 章」 for exactly this distribution.
    expect(segmentDistribution(SEA, TIDE_AXIS).firstBodyChapter).not.toBe(-1);
  });

  it('marks every chapter tied at the peak, not the top few', () => {
    const seg = segmentDistribution(SEA, TIDE_AXIS);
    expect(seg.peakBodyCount).toBe(2);
    expect(seg.peakBodyChapters).toEqual([7]);
  });

  it('marks all chapters when the distribution is flat', () => {
    const seg = segmentDistribution(HAND, TIDE_AXIS);
    expect(seg.peakBodyChapters).toEqual([1, 2, 4, 5, 7, 8, 10]);
  });

  it('leaves a front-matter-only symbol with no shape at all', () => {
    const seg = segmentDistribution(FOOTPRINT, TIDE_AXIS);
    expect(seg.front).toBe(1);
    expect(seg.body).toBe(0);
    expect(seg.bodyChapters).toEqual([]);
    expect(seg.firstBodyChapter).toBeNull();
    expect(seg.peakBodyChapters).toEqual([]);
  });

  it('ignores zero counts and unparseable keys', () => {
    const seg = segmentDistribution({ '1': 0, '2': 3, nope: 9 }, TIDE_AXIS);
    expect(seg.body).toBe(3);
    expect(seg.bodyChapters).toEqual([2]);
  });

  it('is empty for an empty distribution', () => {
    const seg = segmentDistribution({}, TIDE_AXIS);
    expect(seg).toMatchObject({ front: 0, body: 0, back: 0, peakBodyCount: 0 });
  });
});
