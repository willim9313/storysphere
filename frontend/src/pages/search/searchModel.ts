import type { SearchMode, SearchResult } from '@/api/search';

/** One book's slice of the result set. */
export interface BookGroup {
  documentId: string;
  title: string;
  results: SearchResult[];
}

/** Keyword-mode: count of hits (worded by the locale, 「16次」／"16 hits");
 *  semantic-mode: cosine similarity as a percentage.
 *  The two are deliberately not comparable (see 05 決議紀錄 C). */
export function formatScore(score: number, mode: SearchMode, hits: (count: number) => string): string {
  if (mode === 'fulltext') return hits(score);
  return `${Math.round(score * 100)}%`;
}

/** The § part of the locator 「第N章·§NN」— zero-padded to two digits. */
export function padPosition(position: number): string {
  return String(position).padStart(2, '0');
}

export interface TextSegment {
  text: string;
  hit: boolean;
}

function queryPattern(query: string): RegExp | null {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
  if (words.length === 0) return null;
  // Capturing group: split() puts the matched text at odd indexes.
  return new RegExp(`(${words.join('|')})`, 'gi');
}

/** Splits `text` into plain / hit segments for the keyword highlight. */
export function splitHighlight(text: string, query: string): TextSegment[] {
  const re = queryPattern(query);
  if (!re) return [{ text, hit: false }];
  return text
    .split(re)
    .map((part, i) => ({ text: part, hit: i % 2 === 1 }))
    .filter((s) => s.text !== '');
}

/** Relative position (0–1, char offset ÷ text length) of every hit — drives the
 *  3px 命中軌 ticks. Pure counting: nothing here promises click-to-jump. */
export function hitOffsets(text: string, query: string): number[] {
  if (text.length === 0) return [];
  const offsets: number[] = [];
  let cursor = 0;
  for (const seg of splitHighlight(text, query)) {
    if (seg.hit) offsets.push(cursor / text.length);
    cursor += seg.text.length;
  }
  return offsets;
}

/** Groups results by book (first-appearance order, so the global score order is kept),
 *  optionally restricted to the active scope chips. */
export function groupResults(
  results: SearchResult[],
  activeBookIds: string[] | null,
  titleOf: (documentId: string) => string | undefined,
): BookGroup[] {
  const filtered =
    activeBookIds !== null && activeBookIds.length > 0
      ? results.filter((r) => activeBookIds.includes(r.metadata.documentId))
      : results;

  const map = new Map<string, SearchResult[]>();
  for (const r of filtered) {
    const id = r.metadata.documentId;
    const list = map.get(id);
    if (list) list.push(r);
    else map.set(id, [r]);
  }
  return [...map.entries()].map(([documentId, rs]) => ({
    documentId,
    title: titleOf(documentId) ?? documentId,
    results: rs,
  }));
}

export interface SettledSearch {
  results: SearchResult[];
  /** Books whose request was rejected (same order as `bookIds`). */
  failedBookIds: string[];
  /** First rejection reason — feeds failureKind() when every book failed. */
  firstError: unknown;
}

/** Merges per-book search outcomes (`settled` is index-aligned with `bookIds`):
 *  successes sorted by score and capped at `limit`, failures counted rather than dropped. */
export function mergeBookSearches(
  bookIds: string[],
  settled: PromiseSettledResult<SearchResult[]>[],
  limit = 30,
): SettledSearch {
  const failedBookIds: string[] = [];
  let firstError: unknown;
  const ok: SearchResult[] = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      ok.push(...s.value);
    } else {
      failedBookIds.push(bookIds[i]);
      firstError ??= s.reason;
    }
  });
  ok.sort((a, b) => b.score - a.score);
  return { results: ok.slice(0, limit), failedBookIds, firstError };
}
