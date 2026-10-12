import { apiFetch } from './client';
import type { components } from './generated';
import type { TaskStatus } from './types';

// Domain models (snake_case) — sourced from generated.ts per type-generation rule.
// The response schema, not the bare domain model: it adds the derived
// is_stale / stale_reason that GET /narrative computes per request.
export type NarrativeStructure = components['schemas']['NarrativeStructureResponse'];
export type HeroJourneyStage = components['schemas']['HeroJourneyStage'];
export type KernelSpineEvent = components['schemas']['KernelSpineEvent'];
export type TemporalCoverageStats = components['schemas']['TemporalCoverageStats'];
export type RunningNarrative = components['schemas']['RunningNarrativeResponse'];
export type NarrativeOp = NonNullable<RunningNarrative['op']>;

export type NarrativeReviewStatus = 'pending' | 'approved' | 'rejected';

// ── Hero's Journey mapping (#21e / #21f) ─────────────────────────

export function triggerHeroJourney(
  bookId: string,
  language: string,
  force = false,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/narrative/hero-journey', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

export function fetchHeroJourneyTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/narrative/hero-journey/${taskId}`);
}

// ── Kernel/Satellite classification (#21a / #21b) ────────────────

/**
 * Re-derive kernel/satellite from the EEP cache. Reads cache only — no LLM cost.
 * Rejects with ApiError 409 when no event has an EEP entry, i.e. when the run
 * would change nothing; or with 409 `batch_running` (see #21m).
 */
export function classifyNarrative(bookId: string, force = false): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/narrative/classify', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, force }),
  });
}

export function fetchClassifyTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/narrative/classify/${taskId}`);
}

// ── LLM refinement (#21c / #21d) ─────────────────────────────────

/**
 * `eventIds` must be given explicitly: the backend default refines all satellite
 * events, and no book in the library has any, so the default is a no-op.
 */
export function refineNarrative(
  bookId: string,
  eventIds: string[],
  language: string,
  force = false,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/narrative/refine', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, event_ids: eventIds, language, force }),
  });
}

export function fetchRefineTask(taskId: string): Promise<TaskStatus> {
  return apiFetch<TaskStatus>(`/narrative/refine/${taskId}`);
}

// ── The run going for a book (#21m) ──────────────────────────────

/** Classify, refine and hero-journey share one lock per book; this names the
 *  one holding it, so the page can follow it instead of offering a second. */
export function fetchRunningNarrative(bookId: string): Promise<RunningNarrative> {
  return apiFetch<RunningNarrative>(`/narrative/running?book_id=${bookId}`);
}

// ── Cached NarrativeStructure (#21k) ─────────────────────────────

export function fetchNarrativeStructure(bookId: string): Promise<NarrativeStructure> {
  return apiFetch<NarrativeStructure>(`/narrative?book_id=${bookId}`);
}

// ── Kernel spine, plot-spine summary (#21j) ──────────────────────

export function fetchKernelSpine(bookId: string): Promise<KernelSpineEvent[]> {
  return apiFetch<KernelSpineEvent[]>(`/narrative/kernel-spine?book_id=${bookId}`);
}

// ── Temporal analysis (Genette) ──────────────────────────────────

export function fetchTemporalCoverage(bookId: string): Promise<TemporalCoverageStats> {
  return apiFetch<TemporalCoverageStats>(`/narrative/temporal/coverage?book_id=${bookId}`);
}

export function triggerTemporalAnalysis(
  bookId: string,
  language: string,
  force = false,
): Promise<TaskStatus> {
  return apiFetch<TaskStatus>('/narrative/temporal', {
    method: 'POST',
    body: JSON.stringify({ document_id: bookId, language, force }),
  });
}

// ── HITL review (#21l) — book-level review_status ────────────────

export function reviewNarrativeStructure(
  documentId: string,
  reviewStatus: 'approved' | 'rejected' | 'pending',
): Promise<NarrativeStructure> {
  return apiFetch<NarrativeStructure>(`/narrative/${documentId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ review_status: reviewStatus }),
  });
}
