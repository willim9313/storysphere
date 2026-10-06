import { describe, expect, it } from 'vitest';

import {
  DEFAULT_READER_PREFS,
  DEFAULT_TYPOGRAPHY,
  entityDistributionRows,
  formatTypography,
  isOverridden,
  normalizePrefs,
  paperBackground,
  resetTypography,
  resolveTypography,
  withTypography,
} from './readerModel';

describe('default typography', () => {
  it('is 17 / 1.6', () => {
    expect(formatTypography(DEFAULT_TYPOGRAPHY)).toBe('17 / 1.6');
  });
});

describe('normalizePrefs', () => {
  it('falls back to defaults for missing or malformed input', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_READER_PREFS);
    expect(normalizePrefs('x')).toEqual(DEFAULT_READER_PREFS);
    expect(normalizePrefs({ warmth: 9, fade: 'yes' })).toEqual(DEFAULT_READER_PREFS);
  });

  it('reads the flat {fs,lh,warmth,fade} shape', () => {
    const p = normalizePrefs({ fs: 2, lh: 1, warmth: 3, fade: true });
    expect(p).toEqual({ fs: 2, lh: 1, warmth: 3, fade: true });
  });

  it('migrates the interim per-mode shape: the 檢視 group wins, 專注 is dropped', () => {
    const p = normalizePrefs({ view: { fs: 2 }, focus: { lh: 2, fs: 0 }, warmth: 0, fade: true });
    expect(resolveTypography(p)).toEqual({ fs: 2, lh: 0 });
    expect(p.warmth).toBe(0);
    expect(p.fade).toBe(true);
  });

  it('per-mode shape with an empty 檢視 group means the default, ignoring 專注', () => {
    const p = normalizePrefs({ view: {}, focus: { fs: 0 } });
    expect(resolveTypography(p)).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it('discards out-of-range steps', () => {
    expect(resolveTypography(normalizePrefs({ fs: 7, lh: -1 }))).toEqual(DEFAULT_TYPOGRAPHY);
    expect(resolveTypography(normalizePrefs({ view: { fs: 'big' } }))).toEqual(DEFAULT_TYPOGRAPHY);
  });
});

describe('withTypography / resetTypography / isOverridden', () => {
  it('stores a change and reports it as an override', () => {
    const p = withTypography(DEFAULT_READER_PREFS, { fs: 2 });
    expect(resolveTypography(p)).toEqual({ fs: 2, lh: 0 });
    expect(isOverridden(p)).toBe(true);
  });

  it('stops being an override when the user picks the default value again', () => {
    const p = withTypography(withTypography(DEFAULT_READER_PREFS, { lh: 2 }), { lh: 0 });
    expect(isOverridden(p)).toBe(false);
  });

  it('keeps the other axis when only one changes', () => {
    const p = withTypography(withTypography(DEFAULT_READER_PREFS, { fs: 0 }), { lh: 2 });
    expect(resolveTypography(p)).toEqual({ fs: 0, lh: 2 });
  });

  it('reset restores the default typography and leaves warmth / fade', () => {
    const p = { ...withTypography(DEFAULT_READER_PREFS, { fs: 2, lh: 1 }), warmth: 2 as const, fade: true };
    const r = resetTypography(p);
    expect(isOverridden(r)).toBe(false);
    expect(r.warmth).toBe(2);
    expect(r.fade).toBe(true);
  });
});

describe('paperBackground', () => {
  it('uses the warmth swatch in Warm and pins --bg-primary in Ink', () => {
    expect(paperBackground('warm', 2)).toBe('var(--paper-warmth-2)');
    expect(paperBackground('ink', 2)).toBe('var(--bg-primary)');
  });
});

describe('entityDistributionRows', () => {
  it('lists all six types in canvas order, drops 事件, and keeps zero counts', () => {
    const rows = entityDistributionRows({ event: 62, character: 11, location: 9, object: 11 });
    expect(rows.map((r) => r.type)).toEqual(['character', 'location', 'organization', 'object', 'concept', 'other']);
    expect(rows.map((r) => r.count)).toEqual([11, 9, 0, 11, 0, 0]);
  });

  it('tolerates a missing stats object', () => {
    expect(entityDistributionRows(undefined).every((r) => r.count === 0)).toBe(true);
  });
});
