import { describe, expect, it } from 'vitest';
import {
  compareState,
  displacementSkipped,
  drawsDeviation,
  eepPrereq,
  hintCoverage,
  staleStepKey,
} from './timelineModel';

describe('hintCoverage', () => {
  it('reads n / total / pct off the coverage API', () => {
    expect(hintCoverage({ events_with_hint: 18, total_events: 62, coverage: 18 / 62 })).toEqual({
      n: 18,
      total: 62,
      pct: 29,
    });
  });
  it('is all zero before the query answers', () => {
    expect(hintCoverage(undefined)).toEqual({ n: 0, total: 0, pct: 0 });
  });
});

describe('compareState', () => {
  it('is disabled when nothing in the book is ranked, whatever the user wanted', () => {
    expect(compareState(0, true)).toBe('disabled');
    expect(compareState(0, false)).toBe('disabled');
  });
  it('follows the switch once a rank exists', () => {
    expect(compareState(5, false)).toBe('off');
    expect(compareState(5, true)).toBe('on');
  });
  it('only draws deviation when on', () => {
    expect(drawsDeviation('on')).toBe(true);
    expect(drawsDeviation('off')).toBe(false);
    expect(drawsDeviation('disabled')).toBe(false);
  });
});

describe('displacementSkipped', () => {
  it('treats anything but coverage_sufficient === true as skipped', () => {
    expect(displacementSkipped({ coverage_sufficient: true })).toBe(false);
    expect(displacementSkipped({ coverage_sufficient: false })).toBe(true);
    expect(displacementSkipped(undefined)).toBe(true);
  });
});

describe('staleStepKey', () => {
  it('maps backend step names onto the existing step-name i18n keys', () => {
    expect(staleStepKey('knowledge-graph')).toBe('knowledgeGraph');
    expect(staleStepKey('feature-extraction')).toBe('featureExtraction');
  });
  it('returns null for unknown or missing steps', () => {
    expect(staleStepKey('whatever')).toBeNull();
    expect(staleStepKey(null)).toBeNull();
  });
});

describe('eepPrereq', () => {
  it('computes the percentage and survives an empty book', () => {
    expect(eepPrereq(0, 62)).toEqual({ done: 0, total: 62, pct: 0 });
    expect(eepPrereq(31, 62).pct).toBe(50);
    expect(eepPrereq(0, 0).pct).toBe(0);
  });
});
