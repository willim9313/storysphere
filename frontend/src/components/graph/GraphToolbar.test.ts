import { describe, expect, it } from 'vitest';
import { resolveInferenceState } from './GraphToolbar';

describe('resolveInferenceState', () => {
  it('returns running when a mutation is in flight, regardless of record count', () => {
    expect(resolveInferenceState(true, 0)).toBe('running');
    expect(resolveInferenceState(true, 12)).toBe('running');
  });

  it('returns idle when not running and no records exist yet', () => {
    expect(resolveInferenceState(false, 0)).toBe('idle');
  });

  it('returns ready when not running and at least one record exists', () => {
    expect(resolveInferenceState(false, 1)).toBe('ready');
    expect(resolveInferenceState(false, 42)).toBe('ready');
  });
});
