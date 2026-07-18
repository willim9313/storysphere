import type { CSSProperties } from 'react';

const AVATAR_PALETTES = ['char', 'loc', 'org', 'obj', 'con', 'evt'] as const;

/** Deterministic entity-color avatar background, shared by the left-panel
 * list items (`AnalysisListItems.tsx`) and the overview landing's
 * ranking/hero cards (`overview/RankingView.tsx`). Kept in its own module
 * (rather than exported from a component file) so Fast Refresh doesn't
 * choke on a non-component export. */
export function avatarStyle(seed: string): CSSProperties {
  const code = seed.length > 0 ? seed.codePointAt(0)! : 0;
  const p = AVATAR_PALETTES[code % AVATAR_PALETTES.length];
  return {
    background: `var(--entity-${p}-bg)`,
    color: `var(--entity-${p}-fg)`,
    border: `1px solid var(--entity-${p}-border)`,
  };
}
