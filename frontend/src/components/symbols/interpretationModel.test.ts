import { describe, expect, it } from 'vitest';
import {
  barHeight,
  confidenceDots,
  confidenceTier,
  formatAssembledAt,
  reviewDisabled,
  revisionEvidence,
  truncateId,
} from './interpretationModel';

describe('confidenceTier', () => {
  it('maps the tier boundaries', () => {
    expect(confidenceTier(1)).toBe('established');
    expect(confidenceTier(0.8)).toBe('established');
    expect(confidenceTier(0.79)).toBe('presumed');
    expect(confidenceTier(0.72)).toBe('presumed');
    expect(confidenceTier(0.55)).toBe('presumed');
    expect(confidenceTier(0.54)).toBe('tentative');
    expect(confidenceTier(0)).toBe('tentative');
  });
  it('draws the dots', () => {
    expect(confidenceDots('established')).toBe('●●●');
    expect(confidenceDots('presumed')).toBe('●●○');
    expect(confidenceDots('tentative')).toBe('●○○');
  });
});

describe('reviewDisabled', () => {
  it('disables only the button equal to the current state', () => {
    expect(reviewDisabled('approved')).toEqual({ approve: true, reject: false });
    expect(reviewDisabled('rejected')).toEqual({ approve: false, reject: true });
    expect(reviewDisabled('pending')).toEqual({ approve: false, reject: false });
    expect(reviewDisabled('modified')).toEqual({ approve: false, reject: false });
  });
});

describe('truncateId', () => {
  it('shortens long ids and leaves short ones', () => {
    expect(truncateId('7f3a1b2c-0000-4000-8000-123456789abc')).toBe('7f3a1b2c…');
    expect(truncateId('abc')).toBe('abc');
  });
});

describe('barHeight', () => {
  it('draws a 1px baseline for zero', () => {
    expect(barHeight(0, 5, 72)).toBe(1);
  });
  it('shares one scale across rows', () => {
    expect(barHeight(5, 5, 72)).toBe(72);
    expect(barHeight(2, 4, 72)).toBe(36);
  });
  it('keeps a lone occurrence visible', () => {
    expect(barHeight(1, 100, 72)).toBe(3);
  });
});

describe('revisionEvidence', () => {
  it('treats blank as unchanged', () => {
    expect(revisionEvidence('  ')).toBeUndefined();
    expect(revisionEvidence(' x ')).toBe('x');
  });
});

describe('formatAssembledAt', () => {
  it('trims to minutes', () => {
    expect(formatAssembledAt('2026-09-24T14:08:31.123+00:00')).toBe('2026-09-24 14:08');
    expect(formatAssembledAt(null)).toBeNull();
  });
});
