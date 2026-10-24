import { apiFetch } from './client';
import type { components } from './generated';
import type { TaskStatus } from './types';

/** Response shape of #14e — generated, so it carries `flipped`, `edit` and the
 *  grouping provenance that a hand-written type would fall behind on. */
type TensionLineDetail = components['schemas']['TensionLineDetail'];
type TEUDetail = components['schemas']['TEUDetail'];
/** #14i — generated, so it carries reviewed_line_count / total_line_count. */
type TensionThemeResponse = components['schemas']['TensionThemeResponse'];
/** What #14d-3 and #14f return: the stored line, without the embedded TEUs. */
type TensionLine = components['schemas']['TensionLine'];
/** What #14j returns: the stored theme, without the staleness fields of #14i. */
type TensionTheme = components['schemas']['TensionTheme'];
export type RunningTension = components['schemas']['RunningTensionResponse'];
export type TensionOp = NonNullable<RunningTension['op']>;

// ── Mode A: Full-book TEU assembly ──────────────────────────────

export function triggerTensionAnalysis(
  bookId: string,
  language: string,
  force = false,
  concurrency = 5,
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>('/tension/analyze', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force, concurrency }),
  });
}

export function fetchTensionAnalysisTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/analyze/${taskId}`);
}

// ── The run going for a book (#14k) ─────────────────────────────

/** Assembly, grouping and synthesis share one lock per book; this names the
 *  one holding it, so the page can follow it instead of offering a second. */
export function fetchRunningTension(bookId: string): Promise<RunningTension> {
  return apiFetch<RunningTension>(`/tension/running?book_id=${bookId}`);
}

// ── TensionLine grouping ─────────────────────────────────────────

export function triggerGroupTensionLines(
  bookId: string,
  language: string,
  force = false,
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>('/tension/lines/group', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

export function fetchGroupTensionLinesTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/lines/group/${taskId}`);
}

export function fetchTensionLines(bookId: string): Promise<TensionLineDetail[]> {
  return apiFetch<TensionLineDetail[]>(`/tension/lines?book_id=${bookId}`);
}

/**
 * Every TEU Step 1 produced, with `line_id` null for the ones grouping dropped.
 * The only view of what Step 2 silently discarded — see #14d-2.
 */
export function fetchTEUs(bookId: string): Promise<TEUDetail[]> {
  return apiFetch<TEUDetail[]>(`/tension/teus?book_id=${bookId}`);
}

/**
 * Attach a TEU grouping left out to a TensionLine (#14d-3).
 *
 * The line's chapter_range and intensity_summary are recomputed server-side, so
 * a repaired line comes back shaped exactly like one the model got right.
 * Rejects with 409 if another line already claims the TEU.
 */
export function assignTEUToLine(
  teuId: string,
  bookId: string,
  lineId: string,
): Promise<TensionLine> {
  return apiFetch<TensionLine>(`/tension/teus/${teuId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ document_id: bookId, line_id: lineId }),
  });
}

export function reviewTensionLine(
  lineId: string,
  bookId: string,
  reviewStatus: 'approved' | 'modified' | 'rejected',
  canonicalPoleA?: string,
  canonicalPoleB?: string,
  /** Why the labels were rewritten. Only recorded for 'modified' — see #14f. */
  note?: string,
): Promise<TensionLine> {
  return apiFetch<TensionLine>(`/tension/lines/${lineId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      document_id: bookId,
      review_status: reviewStatus,
      canonical_pole_a: canonicalPoleA,
      canonical_pole_b: canonicalPoleB,
      note,
    }),
  });
}

// ── TensionTheme synthesis ───────────────────────────────────────

export function triggerSynthesizeTensionTheme(
  bookId: string,
  language: string,
  force = false,
): Promise<{ taskId: string }> {
  return apiFetch<{ taskId: string }>('/tension/theme/synthesize', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

export function fetchSynthesizeThemeTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/tension/theme/synthesize/${taskId}`);
}

export function fetchTensionTheme(bookId: string): Promise<TensionThemeResponse> {
  return apiFetch<TensionThemeResponse>(`/tension/theme?book_id=${bookId}`);
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
