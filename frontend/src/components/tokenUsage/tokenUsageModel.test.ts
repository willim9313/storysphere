import { describe, expect, it } from 'vitest';

import type { BookUsage, DailyUsage, TokenBucket } from '@/api/tokenUsage';
import { UNATTRIBUTED } from '@/api/tokenUsage';
import { bookKey, bookLabel, bookRows, dailyScale, sortBuckets, toggleSelected } from './tokenUsageModel';

const bucket = (totalTokens: number): TokenBucket => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens,
  calls: 1,
});

const labels = { unattributed: '未歸屬', deleted: (id: string) => `已刪除的書 · ${id}` };

describe('bookKey / bookLabel', () => {
  it('maps a null book id to the unattributed key', () => {
    expect(bookKey(null)).toBe(UNATTRIBUTED);
    expect(bookKey('abc')).toBe('abc');
  });

  it('labels unattributed, titled and deleted books', () => {
    const b = (o: Partial<BookUsage>) => ({ ...bucket(1), bookId: 'x', title: null, ...o }) as BookUsage;
    expect(bookLabel(b({ bookId: null }), labels)).toBe('未歸屬');
    expect(bookLabel(b({ title: '雪線之下' }), labels)).toBe('雪線之下');
    expect(bookLabel(b({ bookId: '8f18dd59-1111-2222' }), labels)).toBe('已刪除的書 · 8f18dd59');
  });
});

describe('sortBuckets / bookRows', () => {
  it('sorts by totalTokens descending', () => {
    const rows = sortBuckets({ a: bucket(1), b: bucket(30), c: bucket(10) });
    expect(rows.map((r) => r.key)).toEqual(['b', 'c', 'a']);
  });

  it('keeps unattributed and deleted books in the book table', () => {
    const books = [
      { ...bucket(5), bookId: null, title: null },
      { ...bucket(50), bookId: 'dead', title: null },
      { ...bucket(20), bookId: 'live', title: 'T' },
    ] as BookUsage[];
    expect(bookRows(books).map((r) => r.key)).toEqual(['dead', 'live', UNATTRIBUTED]);
  });
});

describe('toggleSelected', () => {
  it('selects, switches and clears', () => {
    expect(toggleSelected(null, 'a')).toBe('a');
    expect(toggleSelected('a', 'b')).toBe('b');
    expect(toggleSelected('a', 'a')).toBeNull();
  });
});

describe('dailyScale', () => {
  const day = (date: string, totalTokens: number): DailyUsage => ({ ...bucket(totalTokens), date });

  it('returns null for no days', () => {
    expect(dailyScale([])).toBeNull();
  });

  it('scales against the period max and reports the base day', () => {
    const s = dailyScale([day('2026-09-10', 100), day('2026-09-11', 400), day('2026-09-12', 200)])!;
    expect(s.baseLabel).toBe('09-11');
    expect(s.baseValue).toBe(400);
    expect(s.rows.map((r) => r.pct)).toEqual([25, 100, 50]);
    expect(s.rows[0].label).toBe('09-10');
  });

  it('uses the earliest day on a tie', () => {
    const s = dailyScale([day('2026-09-10', 5), day('2026-09-11', 5)])!;
    expect(s.baseLabel).toBe('09-10');
  });

  it('does not divide by zero when every day is zero', () => {
    const s = dailyScale([day('2026-09-10', 0)])!;
    expect(s.rows[0].pct).toBe(0);
  });
});
