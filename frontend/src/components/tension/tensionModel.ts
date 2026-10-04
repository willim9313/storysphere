import { ApiError } from '@/api/client';

/** Per-chapter TEU tally for the Step 1 density bars. */
export interface ChapterCount {
  chapter: number;
  teus: number;
}

/**
 * Bar height in px for the Step 1 density chart: proportional to the busiest
 * chapter, so the tallest bar is always `maxPx` and a chapter with at least one
 * TEU never collapses to nothing. Counts, not intensity — see B-068.
 */
export function densityBarHeight(count: number, max: number, maxPx = 64): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.round((maxPx * count) / max));
}

export type ChapterStatus =
  | { kind: 'allCovered' }
  | { kind: 'some'; orphans: number }
  | { kind: 'whole' };

/** How a chapter row reads in the TEU inspector: nothing dropped, some, or all. */
export function chapterStatus(total: number, orphans: number): ChapterStatus {
  if (orphans <= 0) return { kind: 'allCovered' };
  if (orphans >= total) return { kind: 'whole' };
  return { kind: 'some', orphans };
}

/**
 * The two shapes a 404 from `GET /tension/theme` can have: the app's own
 * "synthesis has not been run" (JSON body) is an answer, not a failure; a bare
 * 404 from a gateway is not. Everything else is a real error.
 */
export function isNoTheme(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.hasBody;
}

/** Why an assign call failed: 409 is the designed "already claimed" outcome. */
export function assignFailureKind(err: unknown): 'conflict' | 'other' {
  return err instanceof ApiError && err.status === 409 ? 'conflict' : 'other';
}

/**
 * Run `fn` over `ids` one at a time (every review rewrites the same cached blob,
 * so concurrent calls would drop each other) and collect the ones that failed
 * instead of stopping at the first.
 */
export async function runSequentially(
  ids: Iterable<string>,
  fn: (id: string) => Promise<unknown>,
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await fn(id);
    } catch {
      failed.push(id);
    }
  }
  return { failed };
}
