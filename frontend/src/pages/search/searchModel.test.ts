import { describe, expect, it } from 'vitest';

import type { SearchResult } from '@/api/search';
import {
  formatScore,
  padPosition,
  groupResults,
  hitOffsets,
  mergeBookSearches,
  splitHighlight,
} from './searchModel';

const res = (id: string, doc: string, score: number): SearchResult => ({
  id,
  text: id,
  score,
  metadata: { documentId: doc, chapterNumber: 1, position: 1 },
});

describe('formatScore', () => {
  const hits = (n: number) => `${n}次`;
  it('keyword mode words the hit count through the locale, semantic mode a rounded percentage', () => {
    expect(formatScore(16, 'fulltext', hits)).toBe('16次');
    expect(formatScore(16, 'fulltext', (n) => `${n} hits`)).toBe('16 hits');
    expect(formatScore(0.254, 'semantic', hits)).toBe('25%');
    expect(formatScore(0.116, 'semantic', hits)).toBe('12%');
  });
});

describe('padPosition', () => {
  it('zero-pads the position to two digits only', () => {
    expect(padPosition(7)).toBe('07');
    expect(padPosition(21)).toBe('21');
    expect(padPosition(123)).toBe('123');
  });
});

describe('splitHighlight', () => {
  it('returns one plain segment for a blank query', () => {
    expect(splitHighlight('鹽田', '  ')).toEqual([{ text: '鹽田', hit: false }]);
  });

  it('marks every occurrence, case-insensitively, over multiple words', () => {
    const segs = splitHighlight('Salt and sea, salt', 'salt sea');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['Salt', 'sea', 'salt']);
    expect(segs.map((s) => s.text).join('')).toBe('Salt and sea, salt');
  });

  it('escapes regex metacharacters', () => {
    const segs = splitHighlight('a.b axb', 'a.b');
    expect(segs.filter((s) => s.hit)).toHaveLength(1);
  });
});

describe('hitOffsets', () => {
  it('is the char offset over text length for each hit', () => {
    expect(hitOffsets('ab鹽cdef鹽gh', '鹽')).toEqual([2 / 10, 7 / 10]);
  });

  it('is empty without hits or for empty text', () => {
    expect(hitOffsets('hello', 'zzz')).toEqual([]);
    expect(hitOffsets('', 'a')).toEqual([]);
    expect(hitOffsets('hello', '')).toEqual([]);
  });
});

describe('groupResults', () => {
  const all = [res('a', 'd1', 0.9), res('b', 'd2', 0.8), res('c', 'd1', 0.7)];
  const titleOf = (id: string) => (id === 'd1' ? 'One' : undefined);

  it('groups by book keeping global order and falls back to the id for the title', () => {
    const g = groupResults(all, null, titleOf);
    expect(g.map((x) => [x.title, x.results.map((r) => r.id)])).toEqual([
      ['One', ['a', 'c']],
      ['d2', ['b']],
    ]);
  });

  it('restricts to the active scope; empty scope means everything', () => {
    expect(groupResults(all, ['d2'], titleOf).map((x) => x.documentId)).toEqual(['d2']);
    expect(groupResults(all, [], titleOf)).toHaveLength(2);
  });
});

describe('mergeBookSearches', () => {
  const ok = (rs: SearchResult[]): PromiseSettledResult<SearchResult[]> => ({
    status: 'fulfilled',
    value: rs,
  });
  const bad = (reason: unknown): PromiseSettledResult<SearchResult[]> => ({
    status: 'rejected',
    reason,
  });

  it('keeps rejected books by id (index-aligned) instead of dropping them silently', () => {
    const err = new Error('x');
    const m = mergeBookSearches(
      ['d1', 'd2', 'd3'],
      [ok([res('a', 'd1', 1)]), bad(err), ok([res('b', 'd3', 2)])],
    );
    expect(m.failedBookIds).toEqual(['d2']);
    expect(m.firstError).toBe(err);
    expect(m.results.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('caps the merged list', () => {
    const many = Array.from({ length: 5 }, (_, i) => res(`r${i}`, 'd1', i));
    expect(mergeBookSearches(['d1'], [ok(many)], 3).results).toHaveLength(3);
  });

  it('reports every book failed when all reject', () => {
    const m = mergeBookSearches(['d1', 'd2'], [bad('e1'), bad('e2')]);
    expect(m.failedBookIds).toEqual(['d1', 'd2']);
    expect(m.results).toEqual([]);
    expect(m.firstError).toBe('e1');
  });
});
