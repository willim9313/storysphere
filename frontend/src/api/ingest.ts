import { MOCK_ENABLED } from './mock';
import { apiFetch, apiUpload } from './client';
import * as mock from './mock/mockClient';
import type { components } from './generated';
import type { TaskStatus } from './types';

export type SuggestRolesResponse = components['schemas']['SuggestRolesResponse'];
export type ParseTocResponse = components['schemas']['ParseTocResponse'];
export type TocEntry = components['schemas']['TocEntry'];

// #2 — Upload book (PDF)
export function uploadBook(
  file: File,
  title: string,
  author?: string,
  language?: string,
  signal?: AbortSignal,
): Promise<{ taskId: string; duplicateTitle: boolean }> {
  if (MOCK_ENABLED) return mock.uploadBook(file);
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  if (author) form.append('author', author);
  if (language) form.append('language', language);
  return apiUpload<{ taskId: string; duplicateTitle: boolean }>('/books/upload', form, signal);
}

// #2b — Detect a file's language before upload is confirmed
export function detectLanguage(file: File): Promise<{ language: string }> {
  if (MOCK_ENABLED) return mock.detectLanguage(file);
  const form = new FormData();
  form.append('file', file);
  return apiUpload<{ language: string }>('/books/detect-language', form);
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
  paragraphSplits: Record<string, number[]> = {},
): Promise<void> {
  return apiFetch<void>(`/books/${bookId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapters, roleOverrides, paragraphSplits }),
  });
}

// #review — Accept the detected chapter structure as-is (no chapters payload:
// the backend resumes the pipeline without rebuilding anything)
export function acceptReview(bookId: string): Promise<void> {
  return apiFetch<void>(`/books/${bookId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

// #22c — "邊界輔助辨識": LLM-suggested non-body role changes for edge chapters
export function suggestRoles(bookId: string): Promise<SuggestRolesResponse> {
  return apiFetch<SuggestRolesResponse>(`/books/${bookId}/suggest-roles`, {
    method: 'POST',
  });
}

// #22d — "目錄對照提示": LLM-parsed chapter list from the detected TOC page
export function parseToc(bookId: string): Promise<ParseTocResponse> {
  return apiFetch<ParseTocResponse>(`/books/${bookId}/parse-toc`, {
    method: 'POST',
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
