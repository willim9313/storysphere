import type { Book } from '@/api/types';
import type { TaskStatus } from '@/api/tasks';

export type LibraryFilter = 'all' | 'analyzed' | 'ready' | 'processing';

/**
 * Above this many cards (books + in-flight tasks) the library switches from
 * the sparse entry grade (32/24/16/12, max-w 960) to the full one
 * (24/16/12/8, max-w 1280). The design left the threshold to engineering:
 * sparse fits four 180px cards per row at 960, so 8 is two full rows
 * (DS_V3_DESIGN_FEEDBACK 1-D). Counted on the whole library, not the active
 * filter, so switching chips never changes the density.
 */
export const FULL_DENSITY_AFTER = 8;

export interface IngestionTasks {
  /** pending / running — drawn as processing book cards in the grid. */
  processing: TaskStatus[];
  /** awaiting_review with a bookId — the human-gate band above the filters. */
  awaiting: TaskStatus[];
}

export function ingestionTasks(tasks: TaskStatus[] | undefined): IngestionTasks {
  const processing: TaskStatus[] = [];
  const awaiting: TaskStatus[] = [];
  for (const task of tasks ?? []) {
    if (task.kind !== 'ingestion') continue;
    if (task.status === 'pending' || task.status === 'running') processing.push(task);
    else if (task.status === 'awaiting_review' && bookIdOf(task)) awaiting.push(task);
  }
  return { processing, awaiting };
}

export function bookIdOf(task: TaskStatus): string | undefined {
  const id = (task.result as { bookId?: unknown } | null | undefined)?.bookId;
  return typeof id === 'string' && id ? id : undefined;
}

/** Ingestion task titles are "{書名} 解析"; the card shows the bare title. */
export function taskBookTitle(task: TaskStatus): string | null {
  const raw = (task.title ?? '').trim().replace(/\s*解析$/, '');
  return raw || null;
}

export interface LibraryCounts {
  total: number;
  analyzed: number;
  ready: number;
  error: number;
}

export function libraryCounts(books: Book[]): LibraryCounts {
  const c = { total: books.length, analyzed: 0, ready: 0, error: 0 };
  for (const b of books) c[b.status] += 1;
  return c;
}

export function filterBooks(books: Book[], filter: LibraryFilter): Book[] {
  // 'processing' never matches a Book: GET /books leaves out books whose
  // ingestion is still in flight. That chip lists the in-flight tasks instead.
  if (filter === 'all') return books;
  if (filter === 'processing') return [];
  return books.filter((b) => b.status === filter);
}

export function recentBooks(books: Book[], limit = 3): Book[] {
  return books
    .filter((b) => b.lastOpenedAt)
    .sort((a, b) => Date.parse(b.lastOpenedAt!) - Date.parse(a.lastOpenedAt!))
    .slice(0, limit);
}
