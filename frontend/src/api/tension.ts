import { apiFetch } from './client';
import type { TaskStatus, TensionLine, TensionTheme } from './types';

// ── Mode A: Full-book TEU assembly ──────────────────────────────

export function triggerTensionAnalysis(
  bookId: string,
  language = 'zh',
  force = false,
  concurrency = 5,
): Promise<{ task_id: string }> {
  return apiFetch<{ task_id: string }>('/tension/analyze', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force, concurrency }),
  });
}

export function fetchTensionAnalysisTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/analyze/${taskId}`);
}

// ── TensionLine grouping ─────────────────────────────────────────

export function triggerGroupTensionLines(
  bookId: string,
  language = 'zh',
  force = false,
): Promise<{ task_id: string }> {
  return apiFetch<{ task_id: string }>('/tension/lines/group', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

export function fetchGroupTensionLinesTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/lines/group/${taskId}`);
}

export function fetchTensionLines(bookId: string): Promise<TensionLine[]> {
  return apiFetch<TensionLine[]>(`/tension/lines?book_id=${bookId}`);
}

export function reviewTensionLine(
  lineId: string,
  bookId: string,
  reviewStatus: 'approved' | 'modified' | 'rejected',
  canonicalPoleA?: string,
  canonicalPoleB?: string,
): Promise<TensionLine> {
  return apiFetch<TensionLine>(`/tension/lines/${lineId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      document_id: bookId,
      review_status: reviewStatus,
      canonical_pole_a: canonicalPoleA,
      canonical_pole_b: canonicalPoleB,
    }),
  });
}

// ── TensionTheme synthesis ───────────────────────────────────────

export function triggerSynthesizeTensionTheme(
  bookId: string,
  language = 'zh',
  force = false,
): Promise<{ task_id: string }> {
  return apiFetch<{ task_id: string }>('/tension/theme/synthesize', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

export function fetchSynthesizeThemeTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/theme/synthesize/${taskId}`);
}

export function fetchTensionTheme(bookId: string): Promise<TensionTheme> {
  return apiFetch<TensionTheme>(`/tension/theme?book_id=${bookId}`);
}

export function reviewTensionTheme(
  themeId: string,
  bookId: string,
  reviewStatus: 'approved' | 'modified' | 'rejected',
  proposition?: string,
): Promise<TensionTheme> {
  return apiFetch<TensionTheme>(`/tension/theme/${themeId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      document_id: bookId,
      review_status: reviewStatus,
      proposition,
    }),
  });
}
