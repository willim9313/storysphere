import { apiFetch } from './client';
import type { components } from './generated';

type Schemas = components['schemas'];

export type TokenBucket = Schemas['TokenBucket'];
export type DailyUsage = Schemas['DailyUsage'];
/** `bookId: null` = calls that belong to no book (global chat, records predating attribution);
 *  `title: null` with a bookId = the book was deleted, its spending still counts. */
export type BookUsage = Schemas['BookUsage'];
export type TokenUsageResponse = Schemas['TokenUsageResponse'];

/** Selects the rows with no book. The backend treats it as `book_id IS NULL`. */
export const UNATTRIBUTED = '__unattributed__';

export function fetchTokenUsage(
  range: string,
  bookId?: string,
): Promise<TokenUsageResponse> {
  const qs = new URLSearchParams({ range });
  if (bookId) qs.set('bookId', bookId);
  return apiFetch<TokenUsageResponse>(`/token-usage?${qs.toString()}`);
}
