import { MOCK_ENABLED } from './mock';
import { apiFetch, apiUpload } from './client';
import * as mock from './mock/mockClient';
import type { TaskStatus } from './types';

// #2 — Upload book (PDF)
export function uploadBook(file: File, title: string, author?: string, signal?: AbortSignal): Promise<{ taskId: string }> {
  if (MOCK_ENABLED) return mock.uploadBook(file);
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  if (author) form.append('author', author);
  return apiUpload<{ taskId: string }>('/books/upload', form, signal);
}

// #8 — Poll task status
export function fetchTaskStatus(taskId: string, after = 0): Promise<TaskStatus> {
  if (MOCK_ENABLED) return mock.fetchTaskStatus(taskId);
  const params = after > 0 ? `?after=${after}` : '';
  return apiFetch<TaskStatus>(`/tasks/${taskId}/status${params}`);
}

// #review — Fetch review data for awaiting_review task
export function fetchReviewData(bookId: string): Promise<import('./types').ReviewData> {
  return apiFetch<import('./types').ReviewData>(`/books/${bookId}/review-data`);
}

// #review — Submit chapter review
export function submitReview(
  bookId: string,
  chapters: import('./types').ReviewSubmitChapter[],
  roleOverrides: Record<string, string> = {},
): Promise<void> {
  return apiFetch<void>(`/books/${bookId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapters, roleOverrides }),
  });
}

// Cancel a running task
export function cancelTask(taskId: string): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}/cancel`, { method: 'POST' });
}

// Rerun a single failed pipeline step
export type RerunStep = 'summarization' | 'feature-extraction' | 'knowledge-graph' | 'symbol-discovery';
export function rerunStep(bookId: string, step: RerunStep): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>(`/books/${bookId}/rerun/${step}`, { method: 'POST' });
}
