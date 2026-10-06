/**
 * Reader typography model (DS v3 · 08 閱讀頁 G 區, FINAL_RULINGS #7).
 *
 * `reader:prefs` keeps one font size / line height / warmth / fade that 檢視 and
 * 專注 share. Pure functions only — ReaderPage and TypographyPanel own the
 * localStorage plumbing and the rendering.
 */

export type ReaderMode = 'view' | 'focus';
/** Index into FS_PX / LH_VALUES. */
export type Step = 0 | 1 | 2;
export type Warmth = 0 | 1 | 2 | 3;

export type Typography = {
  fs: Step;
  lh: Step;
};

// A type alias (not an interface) so it is assignable to the Record<string, unknown>
// that `reader:prefs` is read back as — the stored JSON may still be an older shape.
export type ReaderPrefs = Typography & {
  warmth: Warmth;
  fade: boolean;
};

/** 15 / 17 / 19 px */
export const FS_PX = ['15px', '17px', '19px'] as const;
/** 1.6 / 1.85 / 2.15 */
export const LH_VALUES = ['1.6', '1.85', '2.15'] as const;

/** 17 / 1.6 (fs=1, lh=0). */
export const DEFAULT_TYPOGRAPHY: Typography = { fs: 1, lh: 0 };

export const DEFAULT_READER_PREFS: ReaderPrefs = { ...DEFAULT_TYPOGRAPHY, warmth: 1, fade: false };

const isStep = (v: unknown): v is Step => v === 0 || v === 1 || v === 2;
const isWarmth = (v: unknown): v is Warmth => v === 0 || v === 1 || v === 2 || v === 3;

/**
 * Parse whatever `reader:prefs` holds. Older shapes still read back:
 *  - flat `{fs, lh, warmth, fade}` (the current shape, and the original one);
 *  - the interim per-mode `{view:{fs?,lh?}, focus:{…}, warmth, fade}` — the 檢視
 *    group wins (it is what users saw by default); the 專注 group is dropped.
 * The next write goes back out flat.
 */
export function normalizePrefs(raw: unknown): ReaderPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_READER_PREFS;
  const o = raw as Record<string, unknown>;
  const view = typeof o.view === 'object' && o.view !== null ? (o.view as Record<string, unknown>) : null;
  const src = view ?? o;
  return {
    fs: isStep(src.fs) ? src.fs : DEFAULT_TYPOGRAPHY.fs,
    lh: isStep(src.lh) ? src.lh : DEFAULT_TYPOGRAPHY.lh,
    warmth: isWarmth(o.warmth) ? o.warmth : DEFAULT_READER_PREFS.warmth,
    fade: typeof o.fade === 'boolean' ? o.fade : DEFAULT_READER_PREFS.fade,
  };
}

/** The font size / line height actually applied. */
export function resolveTypography(prefs: ReaderPrefs): Typography {
  return { fs: prefs.fs, lh: prefs.lh };
}

/** True when the user's value differs from the default. */
export function isOverridden(prefs: ReaderPrefs): boolean {
  return prefs.fs !== DEFAULT_TYPOGRAPHY.fs || prefs.lh !== DEFAULT_TYPOGRAPHY.lh;
}

/** Apply a user change. */
export function withTypography(prefs: ReaderPrefs, patch: Partial<Typography>): ReaderPrefs {
  return { ...prefs, ...patch };
}

/** 「回到預設」: back to the default font size / line height; warmth and fade stay. */
export function resetTypography(prefs: ReaderPrefs): ReaderPrefs {
  return { ...prefs, ...DEFAULT_TYPOGRAPHY };
}

/** "17 / 1.6" — the readout shown next to 此態預設 / 目前. */
export function formatTypography(t: Typography): string {
  return `${Number.parseInt(FS_PX[t.fs], 10)} / ${LH_VALUES[t.lh]}`;
}

/** Paper warmth only exists in Warm; Ink pins column 3 to --bg-primary. */
export function paperBackground(theme: string, warmth: Warmth): string {
  return theme === 'ink' ? 'var(--bg-primary)' : `var(--paper-warmth-${warmth})`;
}

/** 實體分佈「6 型全列」: fixed order, 事件 left out (the stat tile carries it),
 *  and a type with no entities still gets its row at 0. */
export const ENTITY_DIST_TYPES = ['character', 'location', 'organization', 'object', 'concept', 'other'] as const;
export type EntityDistType = (typeof ENTITY_DIST_TYPES)[number];

export function entityDistributionRows(
  stats: Partial<Record<string, number>> | null | undefined,
): { type: EntityDistType; count: number }[] {
  return ENTITY_DIST_TYPES.map((type) => ({ type, count: stats?.[type] ?? 0 }));
}
