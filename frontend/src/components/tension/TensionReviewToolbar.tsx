import { useTranslation } from 'react-i18next';
import type { ReviewFilter, ReviewSort, ReviewStatus } from './reviewTypes';

const FILTERS: ReviewFilter[] = ['all', 'pending', 'approved', 'modified', 'rejected'];
const SORTS: ReviewSort[] = ['intensity', 'chapter', 'count'];

interface Props {
  counts: Record<ReviewFilter, number>;
  filter: ReviewFilter;
  onFilterChange: (f: ReviewFilter) => void;
  sort: ReviewSort;
  onSortChange: (s: ReviewSort) => void;
  selectedCount: number;
  /** How many of the last batch's writes failed (they stay selected). */
  batchFailed: number;
  batchBusy: boolean;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  onClearSelection: () => void;
}

/**
 * Status filter and sort are both segmented controls over the same data, and
 * the batch bar appears once rows are selected. One filter dimension only: the
 * old page had status chips *and* a "hide rejected" checkbox that could
 * disagree.
 */
export function TensionReviewToolbar({
  counts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectedCount,
  batchFailed,
  batchBusy,
  onBatchApprove,
  onBatchReject,
  onClearSelection,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');

  return (
    <>
      <div className="tn-card-bar">
        <span className="tn-hint">{t('tension.reviewSummary')}</span>
        <div className="ss-seg" role="group" aria-label={t('tension.reviewSummary')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`ss-seg-item${filter === f ? ' active' : ''}`}
              aria-pressed={filter === f}
              onClick={() => onFilterChange(f)}
            >
              {f === 'all' ? t('tension.all') : t(`tension.status.${f as ReviewStatus}`)} {counts[f]}
            </button>
          ))}
        </div>
        <span className="tn-spacer" />
        <span className="tn-hint">{t('tension.toolbar.sortLabel')}</span>
        <div className="ss-seg" role="group" aria-label={t('tension.toolbar.sortLabel')}>
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              className={`ss-seg-item${sort === s ? ' active' : ''}`}
              aria-pressed={sort === s}
              onClick={() => onSortChange(s)}
            >
              {t(`tension.toolbar.sort${s[0].toUpperCase()}${s.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="tn-card-bar is-batch">
          <strong className="tn-batch-count">{t('tension.toolbar.selected', { count: selectedCount })}</strong>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onBatchApprove} disabled={batchBusy}>
            {t('tension.toolbar.batchApprove')}
          </button>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-secondary" onClick={onBatchReject} disabled={batchBusy}>
            {t('tension.toolbar.batchReject')}
          </button>
          {batchFailed > 0 && (
            <span className="tn-batch-failed" role="alert">
              {t('tension.toolbar.batchFailed', { count: batchFailed })}
            </span>
          )}
          <span className="tn-spacer" />
          <button type="button" className="tn-esc-hint" onClick={onClearSelection}>
            {t('tension.toolbar.clearSelection')}
          </button>
        </div>
      )}
    </>
  );
}
