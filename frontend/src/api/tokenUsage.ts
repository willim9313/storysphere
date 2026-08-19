import { apiFetch } from './client';

export interface TokenBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface DailyUsage extends TokenBucket {
  date: string;
}

export interface BookUsage extends TokenBucket {
  /** null = calls that belong to no book (global chat, records predating attribution). */
  bookId: string | null;
  /** null with a non-null bookId = the book was deleted; its spending still counts. */
  title: string | null;
}

/** Selects the rows with no book. The backend treats it as `book_id IS NULL`. */
export const UNATTRIBUTED = '__unattributed__';

export interface TokenUsageResponse {
  summary: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCalls: number;
  };
  byService: Record<string, TokenBucket>;
  byModel: Record<string, TokenBucket>;
  byBook: BookUsage[];
  daily: DailyUsage[];
}

export function fetchTokenUsage(
  range: string,
  bookId?: string,
): Promise<TokenUsageResponse> {
  const qs = new URLSearchParams({ range });
  if (bookId) qs.set('bookId', bookId);
  return apiFetch<TokenUsageResponse>(`/token-usage?${qs.toString()}`);
}
