import type { SymbolReviewStatus } from '@/api/symbols';

/**
 * Confidence in three tiers, the same ones the methodology page's TierLegend
 * draws (07). The ranges are fixed by the tier, not by the API: i18n carries
 * them as `frameworks:tier.{tier}Range`.
 */
export type ConfidenceTier = 'established' | 'presumed' | 'tentative';

/** Lower bounds, matching `tier.*Range` (0.80–1.00 / 0.55–0.79 / 0.00–0.54). */
const ESTABLISHED_FROM = 0.8;
const PRESUMED_FROM = 0.55;

export function confidenceTier(score: number): ConfidenceTier {
  if (score >= ESTABLISHED_FROM) return 'established';
  if (score >= PRESUMED_FROM) return 'presumed';
  return 'tentative';
}

/** ●●● / ●●○ / ●○○ — dots carry the tier without hue (Ink flattens every status colour). */
export function confidenceDots(tier: ConfidenceTier): string {
  const on = tier === 'established' ? 3 : tier === 'presumed' ? 2 : 1;
  return '●'.repeat(on) + '○'.repeat(3 - on);
}

/**
 * Which review buttons are disabled: only the one equal to the current state.
 * The backend has no state machine, so any value can go to any other. 修訂 stays
 * enabled on a modified interpretation — it reopens the editor.
 */
export function reviewDisabled(status: SymbolReviewStatus): {
  approve: boolean;
  reject: boolean;
} {
  return { approve: status === 'approved', reject: status === 'rejected' };
}

/** A linked id the page could not resolve to a name, shortened for a mono chip. */
export function truncateId(id: string, keep = 8): string {
  return id.length <= keep ? id : `${id.slice(0, keep)}…`;
}

/**
 * Bar height in px. A zero draws a 1px baseline (never a hole that reads as
 * missing data); anything else is proportional with a floor so a lone
 * occurrence stays visible. `scale` is the shared max of both pinned rows.
 */
export function barHeight(count: number, scale: number, maxPx: number, minPx = 3): number {
  if (count <= 0) return 1;
  return Math.max(minPx, (count / Math.max(1, scale)) * maxPx);
}

/** What goes to PATCH for a text revision: blank evidence means "unchanged", not "erase". */
export function revisionEvidence(draft: string): string | undefined {
  const v = draft.trim();
  return v === '' ? undefined : v;
}

/** `2026-09-24T14:08:31+00:00` → `2026-09-24 14:08`, the provenance line's real value. */
export function formatAssembledAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.replace('T', ' ').slice(0, 16);
}
