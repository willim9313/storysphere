import type { ImageryType, Polarity, SymbolReviewStatus } from '@/api/symbols';
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Shuffle,
  type LucideIcon,
} from 'lucide-react';

export interface SymbolTypeStyle {
  bg: string;
  fg: string;
  dot: string;
}

export const SYMBOL_TYPES: ImageryType[] = ['object', 'nature', 'spatial', 'body', 'color', 'other'];

export const TYPE_STYLE: Record<ImageryType, SymbolTypeStyle> = {
  object: { bg: 'var(--symbol-object-bg)', fg: 'var(--symbol-object-fg)', dot: 'var(--symbol-object-dot)' },
  nature: { bg: 'var(--symbol-nature-bg)', fg: 'var(--symbol-nature-fg)', dot: 'var(--symbol-nature-dot)' },
  spatial: { bg: 'var(--symbol-spatial-bg)', fg: 'var(--symbol-spatial-fg)', dot: 'var(--symbol-spatial-dot)' },
  body: { bg: 'var(--symbol-body-bg)', fg: 'var(--symbol-body-fg)', dot: 'var(--symbol-body-dot)' },
  color: { bg: 'var(--symbol-color-bg)', fg: 'var(--symbol-color-fg)', dot: 'var(--symbol-color-dot)' },
  other: { bg: 'var(--symbol-other-bg)', fg: 'var(--symbol-other-fg)', dot: 'var(--symbol-other-dot)' },
};

export function typeStyle(t: string): SymbolTypeStyle {
  return TYPE_STYLE[(t as ImageryType) in TYPE_STYLE ? (t as ImageryType) : 'other'];
}

/**
 * `entity_type` → the token prefix this repo actually uses.
 *
 * The design contract names tokens in full (`--entity-character-*`); tokens.css
 * has carried abbreviations since before it, and says so on line 6. Without this
 * table every co-occurrence chip resolves `var(--entity-character-bg)` to nothing
 * and renders unstyled.
 */
const ENTITY_TOKEN_PREFIX: Readonly<Record<string, string>> = {
  character: 'char',
  location: 'loc',
  concept: 'con',
  object: 'obj',
  organization: 'org',
  event: 'evt',
};

export function entityStyle(entityType: string): SymbolTypeStyle {
  const p = ENTITY_TOKEN_PREFIX[entityType] ?? 'other';
  return {
    bg: `var(--entity-${p}-bg)`,
    fg: `var(--entity-${p}-fg)`,
    dot: `var(--entity-${p}-dot)`,
  };
}

export interface PolarityStyle {
  icon: LucideIcon;
  bg: string;
  fg: string;
  edge: string;
  dot: string;
}

export const POLARITY_STYLE: Record<Polarity, PolarityStyle> = {
  positive: {
    icon: ArrowUp,
    bg: 'var(--polarity-positive-bg)',
    fg: 'var(--polarity-positive-fg)',
    edge: 'var(--polarity-positive-edge)',
    dot: 'var(--polarity-positive-dot)',
  },
  negative: {
    icon: ArrowDown,
    bg: 'var(--polarity-negative-bg)',
    fg: 'var(--polarity-negative-fg)',
    edge: 'var(--polarity-negative-edge)',
    dot: 'var(--polarity-negative-dot)',
  },
  neutral: {
    icon: Minus,
    bg: 'var(--polarity-neutral-bg)',
    fg: 'var(--polarity-neutral-fg)',
    edge: 'var(--polarity-neutral-edge)',
    dot: 'var(--polarity-neutral-dot)',
  },
  mixed: {
    icon: Shuffle,
    bg: 'var(--polarity-mixed-bg)',
    fg: 'var(--polarity-mixed-fg)',
    edge: 'var(--polarity-mixed-edge)',
    dot: 'var(--polarity-mixed-dot)',
  },
};

export const POLARITY_VALUES: Polarity[] = ['positive', 'negative', 'neutral', 'mixed'];

export interface ReviewStyle {
  fg: string;
  bg: string;
}

export const REVIEW_STYLE: Record<SymbolReviewStatus, ReviewStyle> = {
  pending: { fg: 'var(--fg-muted)', bg: 'var(--bg-tertiary)' },
  approved: { fg: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  modified: { fg: 'var(--color-info)', bg: 'var(--color-info-bg)' },
  rejected: { fg: 'var(--color-error)', bg: 'var(--color-error-bg)' },
};

/**
 * Shade by occurrence count rather than by proportion.
 *
 * Per-chapter counts in real books run 1–3, so the steps can mean literally
 * "once", "twice", "three or more" and a legend can say so. A percentage over a
 * range that small tells the reader less and invites more doubt. The scale is
 * shared across every row, so colour is comparable down a column.
 */
export function densityStep(count: number): string {
  if (count <= 1) return 'var(--symbol-density-mid)';
  if (count === 2) return 'var(--symbol-density-high)';
  return 'var(--symbol-density-peak)';
}

/**
 * Steps a legend can honestly show, given the highest count actually drawn.
 *
 * Pass the maximum across every rendered cell, not the body-chapter maximum:
 * front matter can hold more occurrences of a symbol than any single chapter does
 * — 「海」 appears 3 times in the colophon and at most twice in a chapter — and a
 * swatch on screen with no entry in the legend is worse than no legend.
 */
export function densityLegendSteps(renderedMax: number): number[] {
  return [1, 2, 3].filter((step) => step <= Math.max(1, renderedMax));
}
