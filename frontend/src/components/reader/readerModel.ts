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

/**
 * Split #4 (include_non_body) into 卷首／正文／卷末 (UI_SPEC §3.3).
 *
 * Non-body matter before the first body chapter is 卷首, everything non-body
 * after it is 卷末 — chapter numbering guarantees front/back matter only, and
 * the API already returns document order. A book with no body chapters puts
 * all of its matter in 卷首. `body` is what the reading flow (next chapter,
 * Bezier index, chapter count, epistemic) keeps using.
 */
export function groupChapters<T extends { role: string }>(
  chapters: readonly T[],
): { front: T[]; body: T[]; back: T[] } {
  const front: T[] = [];
  const body: T[] = [];
  const back: T[] = [];
  for (const c of chapters) {
    if (c.role === 'body') body.push(c);
    else (body.length === 0 ? front : back).push(c);
  }
  return { front, body, back };
}

/**
 * Column-3 width guard (UI_SPEC §3.3 版面結構). Column widths are frozen
 * density controls, so instead of shrinking them, opening a column that would
 * squeeze the reading column under COL3_MIN_PX collapses the others — col1
 * first, then col2 — never the one just opened. Below the narrow breakpoint
 * the Bezier column is hidden, so it takes no width there. When col4 is open
 * in a 720px window even collapsing both leaves col3 at ~302px; that is the
 * floor the frozen widths allow.
 */
export const COL3_MIN_PX = 360;

const COL_PX = { col1: 250, col1Rail: 46, col1Gap: 24, col2: 224, col2Rail: 36, bezier: 34, col4: 288 } as const;

export type OpenColumns = { col1: boolean; col2: boolean; col4: boolean };

export function col3Width(pageWidth: number, open: OpenColumns, narrow: boolean): number {
  let used = open.col1 ? COL_PX.col1 + COL_PX.col1Gap : COL_PX.col1Rail;
  used += open.col2 ? COL_PX.col2 : COL_PX.col2Rail;
  if (!narrow && open.col2) used += COL_PX.bezier;
  if (open.col4) used += COL_PX.col4;
  return pageWidth - used;
}

export function protectCol3(
  pageWidth: number,
  open: OpenColumns,
  narrow: boolean,
  justOpened: keyof OpenColumns | null,
): OpenColumns {
  const next = { ...open };
  for (const key of ['col1', 'col2'] as const) {
    if (col3Width(pageWidth, next, narrow) >= COL3_MIN_PX) break;
    if (key !== justOpened && next[key]) next[key] = false;
  }
  return next;
}
