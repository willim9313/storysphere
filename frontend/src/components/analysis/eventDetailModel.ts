import type { EventAnalysisDetail } from '@/api/types';

/** Whether each detail section renders nothing — the single source for both the
 *  sections' own `return null` and the tab-level empty state. */
export const causalityEmpty = (d: Pick<EventAnalysisDetail, 'causality'>): boolean =>
  !d.causality.rootCause && d.causality.causalChain.length === 0 && !d.causality.chainSummary;

export const impactEmpty = (d: Pick<EventAnalysisDetail, 'impact'>): boolean =>
  !d.impact.impactSummary &&
  d.impact.participantImpacts.length === 0 &&
  d.impact.relationChanges.length === 0;

export const factorsEmpty = (d: Pick<EventAnalysisDetail, 'eep'>): boolean =>
  (d.eep.causalFactors ?? []).length === 0 && (d.eep.consequences ?? []).length === 0;

/** 因果與影響 tab: a failed part still renders its failure notice, so it is not empty. */
export function causeTabEmpty(d: EventAnalysisDetail, failedParts: string[]): boolean {
  return (
    causalityEmpty(d) &&
    !failedParts.includes('causality') &&
    impactEmpty(d) &&
    !failedParts.includes('impact') &&
    factorsEmpty(d)
  );
}

/** 證據 tab: key quotes and top terms. */
export function evidenceTabEmpty(d: EventAnalysisDetail): boolean {
  return (d.eep.keyQuotes ?? []).length === 0 && Object.keys(d.eep.topTerms ?? {}).length === 0;
}
