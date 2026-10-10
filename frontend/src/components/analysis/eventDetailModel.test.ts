import { describe, expect, it } from 'vitest';

import type { EventAnalysisDetail } from '@/api/types';
import { causeTabEmpty, evidenceTabEmpty } from './eventDetailModel';

const make = (over: Record<string, unknown> = {}): EventAnalysisDetail =>
  ({
    eep: { causalFactors: [], consequences: [], keyQuotes: [], topTerms: {} },
    causality: { rootCause: '', causalChain: [], chainSummary: '' },
    impact: { impactSummary: '', participantImpacts: [], relationChanges: [] },
    ...over,
  }) as unknown as EventAnalysisDetail;

describe('causeTabEmpty', () => {
  it('is empty when every section is empty', () => {
    expect(causeTabEmpty(make(), [])).toBe(true);
  });
  it('is not empty when a part failed (failure notice renders)', () => {
    expect(causeTabEmpty(make(), ['impact'])).toBe(false);
  });
  it('is not empty with a root cause', () => {
    const d = make({ causality: { rootCause: 'x', causalChain: [], chainSummary: '' } });
    expect(causeTabEmpty(d, [])).toBe(false);
  });
  it('is not empty with causal factors', () => {
    const d = make({ eep: { causalFactors: ['f'], consequences: [], keyQuotes: [], topTerms: {} } });
    expect(causeTabEmpty(d, [])).toBe(false);
  });
});

describe('evidenceTabEmpty', () => {
  it('is empty without quotes and terms', () => {
    expect(evidenceTabEmpty(make())).toBe(true);
  });
  it('is not empty with terms only', () => {
    const d = make({ eep: { keyQuotes: [], topTerms: { a: 1 } } });
    expect(evidenceTabEmpty(d)).toBe(false);
  });
});
