import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import type { TensionLine } from '@/api/types';

type ReviewStatus = 'pending' | 'approved' | 'modified' | 'rejected';
type Filter = 'all' | ReviewStatus;

interface Props {
  lines: TensionLine[];
  statusFilter: Filter;
  setStatusFilter: (v: Filter) => void;
  hideRejected: boolean;
  setHideRejected: (v: boolean) => void;
  onRefresh: () => void;
}

const STATUSES: ReviewStatus[] = ['pending', 'approved', 'modified', 'rejected'];

export function TensionSummaryChips({
  lines,
  statusFilter,
  setStatusFilter,
  hideRejected,
  setHideRejected,
  onRefresh,
}: Props) {
  const { t } = useTranslation('analysis');

  const counts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { pending: 0, approved: 0, modified: 0, rejected: 0 };
    lines.forEach((l) => {
      c[l.review_status] = (c[l.review_status] || 0) + 1;
    });
    return c;
  }, [lines]);

  return (
    <div className="tn-summary">
      <span className="tn-summary-label">{t('tension.reviewSummary')}</span>
      <button
        className={`tn-summary-chip ${statusFilter === 'all' ? 'is-active' : ''}`}
        onClick={() => setStatusFilter('all')}
      >
        {t('tension.all')} <strong>{lines.length}</strong>
      </button>
      {STATUSES.map((s) => (
        <button
          key={s}
          className={`tn-summary-chip ${statusFilter === s ? 'is-active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
        >
          <span className={`tn-summary-chip-dot ${s}`} />
          {t(`tension.status.${s}`)} <strong>{counts[s]}</strong>
        </button>
      ))}
      <div className="tn-summary-spacer" />
      <div className="tn-summary-actions">
        <label className="tn-summary-hide-rejected">
          <input
            type="checkbox"
            checked={hideRejected}
            onChange={(e) => setHideRejected(e.target.checked)}
          />
          {t('tension.hideRejected')}
        </label>
        <button className="tn-btn ghost sm" onClick={onRefresh}>
          <RefreshCw size={12} /> {t('tension.refresh')}
        </button>
      </div>
    </div>
  );
}
