import { useTranslation } from 'react-i18next';
import type { ImageryType, Polarity, SymbolReviewStatus } from '@/api/symbols';
import { POLARITY_STYLE, REVIEW_STYLE, typeStyle } from './tokens';

export function TypePill({ type, withDot = true }: { type: ImageryType | string; withDot?: boolean }) {
  const { t } = useTranslation('analysis');
  const s = typeStyle(type);
  return (
    <span
      className="sym-type-pill"
      style={{ background: s.bg, color: s.fg }}
    >
      {withDot && <span className="sym-type-pill-dot" style={{ background: s.dot }} />}
      {t(`symbol.types.${type}`, { defaultValue: type })}
    </span>
  );
}

export function PolarityPill({ value }: { value: Polarity }) {
  const { t } = useTranslation('analysis');
  const p = POLARITY_STYLE[value];
  const Icon = p.icon;
  return (
    <span
      className="sym-pol-pill"
      style={{
        background: p.bg,
        color: p.fg,
        border: `var(--line-weight) var(--border-style) ${p.edge}`,
      }}
    >
      <Icon size={13} strokeWidth={2.25} />
      {t(`symbol.polarity.${value}`)}
    </span>
  );
}

/**
 * Marks a symbol the provider refused to interpret.
 *
 * Amber rather than red: nothing is broken and the reader did nothing wrong —
 * the state is "tried, cannot complete", which is what --status-partial-* means
 * everywhere else in the app. Red would read as a fault to fix.
 */
export function BlockBadge() {
  const { t } = useTranslation('analysis');
  return (
    <span
      className="sym-review-badge"
      style={{
        background: 'var(--status-partial-bg)',
        color: 'var(--status-partial-fg)',
      }}
      title={t('symbol.blocked.badgeTitle')}
    >
      {t('symbol.blocked.badge')}
    </span>
  );
}

export function ReviewBadge({ status }: { status: SymbolReviewStatus }) {
  const { t } = useTranslation('analysis');
  const s = REVIEW_STYLE[status];
  return (
    <span
      className="sym-review-badge"
      style={{ background: s.bg, color: s.fg }}
    >
      {t(`symbol.review.${status}`)}
    </span>
  );
}
