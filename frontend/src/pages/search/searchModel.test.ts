import { describe, expect, it } from 'vitest';

import type { SearchResult } from '@/api/search';
import {
  formatScore,
  padPosition,
  groupResults,
  hitOffsets,
  booksWithHits,
  groupCap,
  mergeBookSearches,
  parseSearchParams,
  queryTerms,
  replaceBookResults,
  splitHighlight,
  toSearchParams,
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

  it('prefers the longest word when words overlap, so the mark count equals the backend score', () => {
    const segs = splitHighlight('名字與名', '名 名字');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['名字', '名']);
  });

  it('marks repeated words once per occurrence', () => {
    const segs = splitHighlight('a A a', 'A a');
    expect(segs.filter((s) => s.hit)).toHaveLength(3);
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

  it('keeps every book\'s results — no global cap', () => {
    const many = Array.from({ length: 12 }, (_, i) => res(`r${i}`, `d${i % 3}`, i));
    expect(mergeBookSearches(['d0', 'd1', 'd2'], [ok(many.slice(0, 4)), ok(many.slice(4, 8)), ok(many.slice(8))]).results).toHaveLength(12);
  });

  it('reports every book failed when all reject', () => {
    const m = mergeBookSearches(['d1', 'd2'], [bad('e1'), bad('e2')]);
    expect(m.failedBookIds).toEqual(['d1', 'd2']);
    expect(m.results).toEqual([]);
    expect(m.firstError).toBe('e1');
  });
});

describe('search URL state', () => {
  const parse = (s: string) => parseSearchParams(new URLSearchParams(s));

  it('defaults to an empty keyword search with untouched scope', () => {
    expect(parse('')).toEqual({ q: '', mode: 'fulltext', books: null });
    expect(toSearchParams({ q: '', mode: 'fulltext', books: null }).toString()).toBe('');
  });

  it('keeps an empty books param apart from an absent one', () => {
    expect(parse('q=海&books=').books).toEqual([]);
    expect(parse('q=海&books=a,b').books).toEqual(['a', 'b']);
  });

  it('round-trips query, mode and scope, omitting defaults', () => {
    const state = { q: '名 名字', mode: 'semantic' as const, books: ['a', 'b'] };
    expect(parse(toSearchParams(state).toString())).toEqual(state);
    expect(toSearchParams({ q: '海', mode: 'fulltext', books: null }).toString()).toBe('q=%E6%B5%B7');
  });

  it('drops scope when there is no query', () => {
    expect(toSearchParams({ q: '', mode: 'semantic', books: ['a'] }).toString()).toBe('mode=semantic');
  });
});

describe('per-book scope', () => {
  it('lists books with hits in score order', () => {
    expect(booksWithHits([res('a', 'd2', 9), res('b', 'd1', 5), res('c', 'd2', 3)])).toEqual(['d2', 'd1']);
  });

  it('replaces one book\'s results and keeps the score order', () => {
    const merged = replaceBookResults(
      [res('a', 'd1', 9), res('b', 'd2', 5)],
      'd2',
      [res('b', 'd2', 5), res('c', 'd2', 10)],
    );
    expect(merged.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('flags a group that hit the per-book limit, then the backend maximum', () => {
    expect(groupCap(9, false)).toBe('none');
    expect(groupCap(10, false)).toBe('more');
    expect(groupCap(30, true)).toBe('none');
    expect(groupCap(50, true)).toBe('max');
  });
});

describe('queryTerms', () => {
  it('dedupes case-insensitively and puts longer words first', () => {
    expect(queryTerms(' 名  名字 Sea sea ')).toEqual(['sea', '名字', '名']);
    expect(queryTerms('   ')).toEqual([]);
  });
});
