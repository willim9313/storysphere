import { describe, expect, it } from 'vitest';

import {
  DEFAULT_READER_PREFS,
  DEFAULT_TYPOGRAPHY,
  entityDistributionRows,
  col3Width,
  formatTypography,
  groupChapters,
  isOverridden,
  normalizePrefs,
  protectCol3,
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

describe('groupChapters', () => {
  const ch = (id: string, role: string) => ({ id, role });

  it('splits leading and trailing matter around the body chapters', () => {
    const g = groupChapters([ch('toc', 'toc'), ch('pre', 'preface'), ch('1', 'body'), ch('2', 'body'), ch('aft', 'afterword')]);
    expect(g.front.map((c) => c.id)).toEqual(['toc', 'pre']);
    expect(g.body.map((c) => c.id)).toEqual(['1', '2']);
    expect(g.back.map((c) => c.id)).toEqual(['aft']);
  });

  it('leaves both groups empty for a body-only book', () => {
    const g = groupChapters([ch('1', 'body'), ch('2', 'body')]);
    expect(g.front).toEqual([]);
    expect(g.back).toEqual([]);
  });

  it('puts all matter in 卷首 when there is no body chapter', () => {
    const g = groupChapters([ch('toc', 'toc'), ch('other', 'other')]);
    expect(g.front.map((c) => c.id)).toEqual(['toc', 'other']);
    expect(g.body).toEqual([]);
    expect(g.back).toEqual([]);
  });
});

describe('protectCol3', () => {
  const all = { col1: true, col2: true, col4: true };

  it('collapses col1 first when every column is open at 1024', () => {
    // 1024 page − 48 sidebar: col3 was 156px before the guard.
    expect(col3Width(976, all, false)).toBe(156);
    const next = protectCol3(976, all, false, 'col4');
    expect(next).toEqual({ col1: false, col2: true, col4: true });
    expect(col3Width(976, next, false)).toBeGreaterThanOrEqual(360);
  });

  it('never collapses the column that was just opened', () => {
    // Narrow 720 window (672 page): opening col1 with col2 open squeezes col3.
    const next = protectCol3(672, { col1: true, col2: true, col4: false }, true, 'col1');
    expect(next.col1).toBe(true);
    expect(next.col2).toBe(false);
  });

  it('leaves the layout alone when col3 already fits', () => {
    const open = { col1: false, col2: true, col4: false };
    expect(protectCol3(672, open, true, 'col2')).toEqual(open);
  });

  it('does not count the Bezier column in a narrow window', () => {
    const open = { col1: false, col2: true, col4: false };
    expect(col3Width(672, open, true)).toBe(672 - 46 - 224);
  });

  it('collapses both side columns for col4 in a 720 window', () => {
    const next = protectCol3(672, { col1: true, col2: true, col4: true }, true, 'col4');
    expect(next).toEqual({ col1: false, col2: false, col4: true });
    expect(col3Width(672, next, true)).toBe(302);
  });
});
