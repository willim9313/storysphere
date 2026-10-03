import { describe, expect, it } from 'vitest';

import {
  DEFAULT_READER_PREFS,
  MODE_DEFAULTS,
  entityDistributionRows,
  formatTypography,
  isOverridden,
  normalizePrefs,
  paperBackground,
  resetTypography,
  resolveTypography,
  withTypography,
} from './readerModel';

describe('mode defaults', () => {
  it('are 檢視 17 / 1.6 and 專注 19 / 1.85', () => {
    expect(formatTypography(MODE_DEFAULTS.view)).toBe('17 / 1.6');
    expect(formatTypography(MODE_DEFAULTS.focus)).toBe('19 / 1.85');
  });
});

describe('normalizePrefs', () => {
  it('falls back to defaults for missing or malformed input', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_READER_PREFS);
    expect(normalizePrefs('x')).toEqual(DEFAULT_READER_PREFS);
    expect(normalizePrefs({ warmth: 9, fade: 'yes' })).toEqual(DEFAULT_READER_PREFS);
  });

  it('migrates the legacy {fs,lh,warmth,fade} shape into the 檢視 values', () => {
    const p = normalizePrefs({ fs: 2, lh: 1, warmth: 3, fade: true });
    expect(p.warmth).toBe(3);
    expect(p.fade).toBe(true);
    // 檢視 keeps what the user had: 19px / 1.85.
    expect(resolveTypography(p, 'view')).toEqual({ fs: 2, lh: 1 });
    // 專注 starts from its own default.
    expect(resolveTypography(p, 'focus')).toEqual(MODE_DEFAULTS.focus);
  });

  it('drops legacy values that equal the 檢視 default', () => {
    const p = normalizePrefs({ fs: 1, lh: 0, warmth: 1, fade: false });
    expect(p.view).toEqual({});
    expect(isOverridden(p, 'view')).toBe(false);
  });

  it('keeps the per-mode shape and ignores stray top-level fs/lh once view/focus exist', () => {
    const p = normalizePrefs({ fs: 0, view: { fs: 2 }, focus: { lh: 2 }, warmth: 0, fade: false });
    expect(resolveTypography(p, 'view')).toEqual({ fs: 2, lh: 0 });
    expect(resolveTypography(p, 'focus')).toEqual({ fs: 2, lh: 2 });
  });

  it('discards out-of-range steps', () => {
    const p = normalizePrefs({ view: { fs: 7, lh: -1 }, focus: { fs: 'big' } });
    expect(p.view).toEqual({});
    expect(p.focus).toEqual({});
  });
});

describe('withTypography / resetTypography / isOverridden', () => {
  it('stores a change only for the mode it was made in', () => {
    const p = withTypography(DEFAULT_READER_PREFS, 'view', { fs: 2 });
    expect(resolveTypography(p, 'view')).toEqual({ fs: 2, lh: 0 });
    expect(resolveTypography(p, 'focus')).toEqual(MODE_DEFAULTS.focus);
    expect(isOverridden(p, 'view')).toBe(true);
    expect(isOverridden(p, 'focus')).toBe(false);
  });

  it('stops being an override when the user picks the default value again', () => {
    const p = withTypography(withTypography(DEFAULT_READER_PREFS, 'focus', { lh: 2 }), 'focus', { lh: 1 });
    expect(isOverridden(p, 'focus')).toBe(false);
  });

  it('keeps the other axis when only one changes', () => {
    const p = withTypography(withTypography(DEFAULT_READER_PREFS, 'view', { fs: 0 }), 'view', { lh: 2 });
    expect(resolveTypography(p, 'view')).toEqual({ fs: 0, lh: 2 });
  });

  it('reset drops only that mode and leaves warmth / fade / the other mode', () => {
    let p = withTypography(DEFAULT_READER_PREFS, 'view', { fs: 2 });
    p = withTypography(p, 'focus', { fs: 0 });
    p = { ...p, warmth: 2, fade: true };
    const r = resetTypography(p, 'view');
    expect(isOverridden(r, 'view')).toBe(false);
    expect(resolveTypography(r, 'focus').fs).toBe(0);
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
