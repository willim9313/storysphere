/**
 * Reader typography model (DS v3 · 08 閱讀頁 G 區).
 *
 * `reader:prefs` keeps font size / line height per mode (檢視 / 專注) as
 * *overrides* on top of each mode's own default; warmth and fade are shared by
 * both modes. Pure functions only — ReaderPage and TypographyPanel own the
 * localStorage plumbing and the rendering.
 */

export type ReaderMode = 'view' | 'focus';
/** Index into FS_PX / LH_VALUES. */
export type Step = 0 | 1 | 2;
export type Warmth = 0 | 1 | 2 | 3;

export interface Typography {
  fs: Step;
  lh: Step;
}

// A type alias (not an interface) so it is assignable to the Record<string, unknown>
// that `reader:prefs` is read back as — the stored JSON may still be the legacy shape.
export type ReaderPrefs = {
  warmth: Warmth;
  fade: boolean;
  /** Only the values the user changed in 檢視; absent key = the mode default. */
  view: Partial<Typography>;
  /** Same for 專注. */
  focus: Partial<Typography>;
};

/** 15 / 17 / 19 px — the scale did not move, only each mode's default landing. */
export const FS_PX = ['15px', '17px', '19px'] as const;
/** 1.6 / 1.85 / 2.15 */
export const LH_VALUES = ['1.6', '1.85', '2.15'] as const;

/** 檢視 17 / 1.6 (fs=1, lh=0) · 專注 19 / 1.85 (fs=2, lh=1). */
export const MODE_DEFAULTS: Record<ReaderMode, Typography> = {
  view: { fs: 1, lh: 0 },
  focus: { fs: 2, lh: 1 },
};

export const DEFAULT_READER_PREFS: ReaderPrefs = { warmth: 1, fade: false, view: {}, focus: {} };

const isStep = (v: unknown): v is Step => v === 0 || v === 1 || v === 2;
const isWarmth = (v: unknown): v is Warmth => v === 0 || v === 1 || v === 2 || v === 3;

/** Keep only valid steps that differ from the mode default. */
function cleanOverride(raw: unknown, mode: ReaderMode): Partial<Typography> {
  const out: Partial<Typography> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  const def = MODE_DEFAULTS[mode];
  if (isStep(o.fs) && o.fs !== def.fs) out.fs = o.fs;
  if (isStep(o.lh) && o.lh !== def.lh) out.lh = o.lh;
  return out;
}

/**
 * Parse whatever `reader:prefs` holds. The legacy shape `{fs, lh, warmth, fade}`
 * (one font size / line height for everything) becomes the 檢視 values, so
 * existing users keep what they chose; 專注 starts from its own defaults.
 */
export function normalizePrefs(raw: unknown): ReaderPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_READER_PREFS;
  const o = raw as Record<string, unknown>;
  const hasPerMode = 'view' in o || 'focus' in o;
  const view = hasPerMode ? cleanOverride(o.view, 'view') : cleanOverride(o, 'view');
  const focus = hasPerMode ? cleanOverride(o.focus, 'focus') : {};
  return {
    warmth: isWarmth(o.warmth) ? o.warmth : DEFAULT_READER_PREFS.warmth,
    fade: typeof o.fade === 'boolean' ? o.fade : DEFAULT_READER_PREFS.fade,
    view,
    focus,
  };
}

/** The font size / line height actually applied in `mode`. */
export function resolveTypography(prefs: ReaderPrefs, mode: ReaderMode): Typography {
  const def = MODE_DEFAULTS[mode];
  const o = prefs[mode];
  return { fs: o.fs ?? def.fs, lh: o.lh ?? def.lh };
}

/** True when the user's value in `mode` differs from that mode's default. */
export function isOverridden(prefs: ReaderPrefs, mode: ReaderMode): boolean {
  const o = prefs[mode];
  return o.fs !== undefined || o.lh !== undefined;
}

/** Apply a user change to one mode; a value equal to the default is dropped. */
export function withTypography(
  prefs: ReaderPrefs,
  mode: ReaderMode,
  patch: Partial<Typography>,
): ReaderPrefs {
  const next = resolveTypography(prefs, mode);
  if (patch.fs !== undefined) next.fs = patch.fs;
  if (patch.lh !== undefined) next.lh = patch.lh;
  return { ...prefs, [mode]: cleanOverride(next, mode) };
}

/** 「回到此態預設」: drop this mode's overrides, leave the other mode alone. */
export function resetTypography(prefs: ReaderPrefs, mode: ReaderMode): ReaderPrefs {
  return { ...prefs, [mode]: {} };
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
