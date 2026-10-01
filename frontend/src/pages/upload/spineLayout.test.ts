import { describe, expect, it } from 'vitest';
import type { ReviewParagraph } from '@/api/types';
import { isMisSplit, overviewHeights, railBarHeight, spineBlockHeight } from './spineLayout';

function para(titled: boolean): ReviewParagraph {
  return { paragraphIndex: 0, text: '第一章 雪', role: 'body', titleSpan: titled ? [0, 3] : null, sentences: [] };
}

describe('spine formulas (spec, unchanged)', () => {
  it('chapter block is 30 + paraCount * 15', () => {
    expect(spineBlockHeight(0)).toBe(30);
    expect(spineBlockHeight(18)).toBe(300);
  });

  it('rail bar is 14 + paraCount * 8', () => {
    expect(railBarHeight(1)).toBe(22);
    expect(railBarHeight(31)).toBe(262);
  });
});

describe('overviewHeights', () => {
  it('splits the usable height (minus 1px gaps) proportionally', () => {
    // 4 rows → 3 gaps; usable 100 → 25 / 50 / 15 / 10
    expect(overviewHeights([5, 10, 3, 2], 103)).toEqual([25, 50, 15, 10]);
  });

  it('never drops a chapter below 2px', () => {
    expect(overviewHeights([1, 1000], 200)).toEqual([2, 199]);
  });

  it('fits a 30-chapter / 438-paragraph book into the viewport', () => {
    const counts = [3, 6, 18, 25, 4, 31, 12, 9, 22, 7, 16, 28, 5, 19, 11, 3, 24, 14, 20, 8, 26, 13, 17, 6, 21, 10, 15, 4, 23, 18];
    expect(counts.reduce((a, n) => a + n, 0)).toBe(438);
    const hs = overviewHeights(counts, 600);
    const used = hs.reduce((a, h) => a + h, 0) + (counts.length - 1);
    expect(Math.abs(used - 600)).toBeLessThanOrEqual(counts.length);
  });

  it('handles an empty book and a zero height', () => {
    expect(overviewHeights([], 500)).toEqual([]);
    expect(overviewHeights([0, 0], 500)).toEqual([2, 2]);
    expect(overviewHeights([3, 7], 0)).toEqual([2, 2]);
  });
});

describe('isMisSplit', () => {
  it('flags a body chapter with more than one title span', () => {
    expect(isMisSplit({ role: 'body', paragraphs: [para(true), para(false), para(true)] })).toBe(true);
  });

  it('does not flag a single title span', () => {
    expect(isMisSplit({ role: 'body', paragraphs: [para(true), para(false)] })).toBe(false);
  });

  it('never flags a non-body chapter', () => {
    expect(isMisSplit({ role: 'toc', paragraphs: [para(true), para(true)] })).toBe(false);
  });
});
