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

/** Same split as the backend fulltext score (#23a): words deduped case-insensitively,
 *  longest first, so 「名 名字」 marks 「名字」 once and the mark count equals the score. */
function queryPattern(query: string): RegExp | null {
  const unique = new Map<string, string>();
  for (const w of query.trim().split(/\s+/)) {
    if (w.length >= 1) unique.set(w.toLowerCase(), w);
  }
  const words = [...unique.values()]
    .sort((a, b) => b.length - a.length)
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

/** Every search queries each library book separately (#23a with `bookId`), so every
 *  book with a hit shows up — no global top-N decides which books get a chip. */
export const PER_BOOK_LIMIT = 10;
/** 「顯示更多」 re-fetches one book up to the backend's `topK` maximum. */
export const MORE_LIMIT = 50;

/** Merges per-book search outcomes (`settled` is index-aligned with `bookIds`):
 *  successes sorted by score, failures counted rather than dropped. */
export function mergeBookSearches(
  bookIds: string[],
  settled: PromiseSettledResult<SearchResult[]>[],
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
  return { results: ok, failedBookIds, firstError };
}

/** Swaps one book's results for a longer fetch (「顯示更多」), keeping the score order. */
export function replaceBookResults(
  results: SearchResult[],
  bookId: string,
  bookResults: SearchResult[],
): SearchResult[] {
  return [...results.filter((r) => r.metadata.documentId !== bookId), ...bookResults].sort(
    (a, b) => b.score - a.score,
  );
}

/** Books that have at least one result, in result (score) order — the default chips. */
export function booksWithHits(results: SearchResult[]): string[] {
  return [...new Set(results.map((r) => r.metadata.documentId))];
}

/** Whether a book's group may hold more than it shows:
 *  'more' = hit the per-book limit, 「顯示更多」 available; 'max' = hit the backend maximum. */
export function groupCap(count: number, expanded: boolean): 'none' | 'more' | 'max' {
  if (expanded) return count >= MORE_LIMIT ? 'max' : 'none';
  return count >= PER_BOOK_LIMIT ? 'more' : 'none';
}

/** The submitted search as it lives in the URL (`/search?q=&mode=&books=`), so
 *  back-navigation and shared links restore it. Defaults are left out of the URL. */
export interface SearchUrlState {
  q: string;
  mode: SearchMode;
  /** null = scope untouched (chips = every book with a hit);
   *  [] = every chip removed (all books shown, no chips); otherwise the remaining chips. */
  books: string[] | null;
}

export function parseSearchParams(params: URLSearchParams): SearchUrlState {
  const books = params.get('books');
  return {
    q: params.get('q') ?? '',
    mode: params.get('mode') === 'semantic' ? 'semantic' : 'fulltext',
    books: books === null ? null : books.split(',').filter((id) => id !== ''),
  };
}

export function toSearchParams(state: SearchUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.mode !== 'fulltext') params.set('mode', state.mode);
  if (state.q && state.books !== null) params.set('books', state.books.join(','));
  return params;
}
