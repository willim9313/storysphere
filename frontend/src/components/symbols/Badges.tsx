import { useTranslation } from 'react-i18next';
import type { ImageryType, SymbolReviewStatus } from '@/api/symbols';
import { REVIEW_STYLE, typeStyle } from './tokens';

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
