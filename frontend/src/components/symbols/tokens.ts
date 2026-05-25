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

export function densityToken(cnt: number, max: number): string {
  if (cnt === 0) return 'var(--bg-tertiary)';
  const ratio = cnt / max;
  if (ratio >= 0.75) return 'var(--symbol-density-high)';
  if (ratio >= 0.35) return 'var(--symbol-density-mid)';
  return 'var(--symbol-density-low)';
}
