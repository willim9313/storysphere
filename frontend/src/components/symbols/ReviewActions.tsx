import { Check, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SymbolReviewStatus } from '@/api/symbols';

interface Props {
  status: SymbolReviewStatus;
  pending?: boolean;
  onApprove: () => void;
  onModify: () => void;
  onReject: () => void;
}

export function ReviewActions({ status, pending, onApprove, onModify, onReject }: Props) {
  const { t } = useTranslation('analysis');

  const btn = (active: boolean, bg: string, fg: string, edge: string): React.CSSProperties => ({
    background: active ? bg : 'transparent',
    color: active ? fg : 'var(--fg-secondary)',
    borderColor: edge,
  });

  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      <button
        type="button"
        className={'sym-review-btn' + (status === 'approved' ? ' is-active' : '')}
        style={btn(status === 'approved', 'var(--color-success-bg)', 'var(--color-success)', 'var(--color-success)')}
        onClick={onApprove}
        disabled={pending}
      >
        <Check size={13} strokeWidth={2.5} /> {t('symbol.review.approve')}
      </button>
      <button
        type="button"
        className={'sym-review-btn' + (status === 'modified' ? ' is-active' : '')}
        style={btn(status === 'modified', 'var(--color-info-bg)', 'var(--color-info)', 'var(--color-info)')}
        onClick={onModify}
        disabled={pending}
      >
        <Pencil size={13} strokeWidth={2.25} /> {t('symbol.review.modify')}
      </button>
      <button
        type="button"
        className={'sym-review-btn' + (status === 'rejected' ? ' is-active' : '')}
        style={btn(status === 'rejected', 'var(--color-error-bg)', 'var(--color-error)', 'var(--color-error)')}
        onClick={onReject}
        disabled={pending}
      >
        <X size={13} strokeWidth={2.5} /> {t('symbol.review.reject')}
      </button>
    </div>
  );
}
