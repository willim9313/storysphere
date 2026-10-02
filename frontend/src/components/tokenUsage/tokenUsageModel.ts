import type { BookUsage, DailyUsage, TokenBucket } from '@/api/tokenUsage';
import { UNATTRIBUTED } from '@/api/tokenUsage';

/** A book row's key. `null` is a real group but cannot be an object key. */
export function bookKey(bookId: string | null): string {
  return bookId ?? UNATTRIBUTED;
}

/** Label for a book row. A deleted book keeps its spending but loses its title;
 *  the id stub is the only handle left and still tells two deleted books apart. */
export function bookLabel(
  book: BookUsage,
  labels: { unattributed: string; deleted: (id: string) => string },
): string {
  if (book.bookId === null) return labels.unattributed;
  return book.title ?? labels.deleted(book.bookId.slice(0, 8));
}

export interface BucketRow {
  key: string;
  bucket: TokenBucket;
}

/** Descending by totalTokens; ties keep the input order. */
export function sortBuckets(data: Record<string, TokenBucket>): BucketRow[] {
  return Object.entries(data)
    .map(([key, bucket]) => ({ key, bucket }))
    .sort((a, b) => b.bucket.totalTokens - a.bucket.totalTokens);
}

/** The book table is always built from the unfiltered query, sorted like the others. */
export function bookRows(books: BookUsage[]): BucketRow[] {
  return sortBuckets(Object.fromEntries(books.map((b) => [bookKey(b.bookId), b])));
}

/** Dropdown and table rows share one state: clicking the selected row clears it. */
export function toggleSelected(current: string | null, key: string): string | null {
  return current === key ? null : key;
}

export interface DailyRow {
  /** MM-DD */
  label: string;
  totalTokens: number;
  /** 0–100, relative to this period's maximum. */
  pct: number;
}

export interface DailyScale {
  rows: DailyRow[];
  /** MM-DD of the day the bars are scaled against (earliest on a tie). */
  baseLabel: string;
  baseValue: number;
}

/** Bar width = day / period max. The base is part of the result so the page can
 *  say what the bars are relative to — it changes with the range. */
export function dailyScale(daily: DailyUsage[]): DailyScale | null {
  if (daily.length === 0) return null;
  let base = daily[0];
  for (const d of daily) if (d.totalTokens > base.totalTokens) base = d;
  const max = base.totalTokens;
  return {
    baseLabel: base.date.slice(5),
    baseValue: max,
    rows: daily.map((d) => ({
      label: d.date.slice(5),
      totalTokens: d.totalTokens,
      pct: max > 0 ? (d.totalTokens / max) * 100 : 0,
    })),
  };
}
