import { describe, expect, it } from 'vitest';

import { densityStep } from './tokens';
import {
  TRUST_FLOOR,
  analyzedCount,
  computableSignals,
  densityLegend,
  deriveStages,
  isBelowTrustFloor,
  tailIsMuted,
  tailSize,
  trustPct,
} from './symbolViewModel';

describe('trust floor', () => {
  it('flags a figure strictly below 80%', () => {
    expect(TRUST_FLOOR).toBe(0.8);
    expect(isBelowTrustFloor({ trust: 5 / 7 })).toBe(true);
    expect(isBelowTrustFloor({ trust: 0.8 })).toBe(false);
    expect(isBelowTrustFloor({ trust: 1 })).toBe(false);
  });

  it('prints the whole percentage the tooltip quotes', () => {
    // 海: (正文 5 + 後記 0) / 總出現 7 = 71%
    expect(trustPct({ trust: 5 / 7 })).toBe(71);
    expect(trustPct({ trust: 1 })).toBe(100);
  });
});

describe('deriveStages', () => {
  const st = (p: number) => Object.fromEntries(deriveStages(p).map((x) => [x.key, x]));

  it('keeps the first three steps running at progress 10 (SEP not assembled yet)', () => {
    const s = st(10);
    expect([s.sep.state, s.context.state, s.link.state]).toEqual(['running', 'running', 'running']);
    expect(s.llm.state).toBe('pending');
  });

  it('marks them done at 40 and starts the LLM step at 0%', () => {
    const s = st(40);
    expect([s.sep.state, s.context.state, s.link.state]).toEqual(['done', 'done', 'done']);
    expect(s.llm.state).toBe('running');
    expect(s.llm.pct).toBe(0);
  });

  it('maps 40-90 onto the LLM step 0-100%', () => {
    expect(st(65).llm.pct).toBe(50);
  });

  it('runs review from 90 and finishes at 100', () => {
    expect(st(90).llm.state).toBe('done');
    expect(st(90).review.state).toBe('running');
    expect(st(100).review.state).toBe('done');
  });
});

describe('analyzedCount', () => {
  it('counts rows that already hold an interpretation', () => {
    expect(analyzedCount([])).toBe(0);
    expect(
      analyzedCount([
        { hasInterpretation: true },
        { hasInterpretation: false },
        { hasInterpretation: true },
      ]),
    ).toBe(2);
  });
});

describe('density scale and its legend', () => {
  it('colours every count of two or more the same', () => {
    expect(densityStep(1)).toBe('var(--symbol-density-mid)');
    expect(densityStep(2)).toBe('var(--symbol-density-high)');
    expect(densityStep(3)).toBe(densityStep(2));
    expect(densityStep(9)).toBe(densityStep(2));
  });

  it('never draws a third swatch, so the legend matches the cells', () => {
    expect(densityLegend(1)).toEqual([1]);
    expect(densityLegend(0)).toEqual([1]);
    expect(densityLegend(2)).toEqual([1, 2]);
    // 海's colophon holds 3, and still maps onto 「2 次以上」.
    expect(densityLegend(3)).toEqual([1, 2]);
  });
});

describe('tailSize', () => {
  it('steps ch1–2 → xs … ch9–10 → xl on a ten-chapter body', () => {
    expect(tailSize(1, 10)).toBe('xs');
    expect(tailSize(2, 10)).toBe('xs');
    expect(tailSize(3, 10)).toBe('sm');
    expect(tailSize(4, 10)).toBe('sm');
    expect(tailSize(5, 10)).toBe('base');
    expect(tailSize(6, 10)).toBe('base');
    expect(tailSize(7, 10)).toBe('lg');
    expect(tailSize(8, 10)).toBe('lg');
    expect(tailSize(9, 10)).toBe('xl');
    expect(tailSize(10, 10)).toBe('xl');
  });

  it('spreads a longer book over the same five steps', () => {
    expect(tailSize(1, 40)).toBe('xs');
    expect(tailSize(40, 40)).toBe('xl');
  });

  it('puts front/back-only words below the scale', () => {
    expect(tailSize(null, 10)).toBe('2xs');
    expect(tailIsMuted(null)).toBe(true);
    expect(tailIsMuted(3)).toBe(false);
  });

  it('survives a book with no body chapters', () => {
    expect(tailSize(1, 0)).toBe('2xs');
  });
});

describe('computableSignals', () => {
  it('reports the rows that came out with signals against the rows sent', () => {
    expect(computableSignals({ all: [1, 2, 3] as never }, 3)).toEqual({ computable: 3, total: 3 });
  });
});
