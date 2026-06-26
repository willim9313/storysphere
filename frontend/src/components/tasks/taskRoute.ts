import type { TaskStatus } from '@/api/tasks';

/**
 * kind → book-scoped sub-path. Empty string means the reader index
 * (`/books/:bookId`). Paths mirror the real routes in `router.tsx`.
 * Note `symbol` maps to the plural `symbols` route.
 */
const BOOK_KIND_PATHS: Record<string, string> = {
  ingestion: '',
  character: 'characters',
  event: 'events',
  tension: 'tension',
  symbol: 'symbols',
  narrative: 'narrative',
};

/**
 * Resolve the route a task row navigates to, or `null` if not navigable.
 *
 * Returns `null` for unknown/absent `kind`, or when the required `bookId`
 * is missing from `result` — those rows render as view-only (no chevron,
 * default cursor) per the Task Center spec.
 */
export function taskRoute(
  task: Pick<TaskStatus, 'kind' | 'result'>,
): string | null {
  const kind = task.kind;
  if (!kind || !(kind in BOOK_KIND_PATHS)) return null;

  const bookId = (task.result as { bookId?: unknown } | null | undefined)
    ?.bookId;
  if (typeof bookId !== 'string' || !bookId) return null;

  const sub = BOOK_KIND_PATHS[kind];
  return sub ? `/books/${bookId}/${sub}` : `/books/${bookId}`;
}
