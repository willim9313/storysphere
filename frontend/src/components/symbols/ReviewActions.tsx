import { useTranslation } from 'react-i18next';
import type { SymbolReviewStatus } from '@/api/symbols';
import { reviewDisabled } from './interpretationModel';

interface Props {
  status: SymbolReviewStatus;
  pending?: boolean;
  onApprove: () => void;
  onModify: () => void;
  onReject: () => void;
}

/**
 * Review is free: no glyph, no confirmation. The backend has no state machine, so
 * every state can move to every other; only the button equal to the current state
 * is disabled. 修訂 stays enabled — it reopens the editor, and saving it sets 已修訂.
 */
export function ReviewActions({ status, pending, onApprove, onModify, onReject }: Props) {
  const { t } = useTranslation('analysis');
  const off = reviewDisabled(status);

  return (
    <div className="sym-interp-actions">
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-secondary"
        onClick={onApprove}
        disabled={pending || off.approve}
      >
        {t('symbol.review.approve')}
      </button>
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-secondary"
        onClick={onModify}
        disabled={pending}
      >
        {t('symbol.review.modify')}
      </button>
      <button
        type="button"
        className="ss-btn ss-btn-sm ss-btn-ghost"
        onClick={onReject}
        disabled={pending || off.reject}
      >
        {t('symbol.review.reject')}
      </button>
    </div>
  );
}
