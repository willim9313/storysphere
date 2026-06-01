import { apiFetch } from './client';
import type { components } from './generated';
import type { TaskStatus } from './types';

// Domain models (snake_case) — sourced from generated.ts per type-generation rule.
export type NarrativeStructure = components['schemas']['NarrativeStructure'];
export type HeroJourneyStage = components['schemas']['HeroJourneyStage'];
export type KernelSpineEvent = components['schemas']['KernelSpineEvent'];

export type NarrativeReviewStatus = 'pending' | 'approved' | 'rejected';

// ── Hero's Journey mapping (#21e / #21f) ─────────────────────────

export function triggerHeroJourney(
  bookId: string,
  language = 'zh',
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

// ── Cached NarrativeStructure (#21k) ─────────────────────────────

export function fetchNarrativeStructure(bookId: string): Promise<NarrativeStructure> {
  return apiFetch<NarrativeStructure>(`/narrative?book_id=${bookId}`);
}

// ── Kernel spine, plot-spine summary (#21j) ──────────────────────

export function fetchKernelSpine(bookId: string): Promise<KernelSpineEvent[]> {
  return apiFetch<KernelSpineEvent[]>(`/narrative/kernel-spine?book_id=${bookId}`);
}

// ── HITL review (#21l) — book-level review_status ────────────────

export function reviewNarrativeStructure(
  documentId: string,
  reviewStatus: 'approved' | 'rejected',
): Promise<NarrativeStructure> {
  return apiFetch<NarrativeStructure>(`/narrative/${documentId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ review_status: reviewStatus }),
  });
}
