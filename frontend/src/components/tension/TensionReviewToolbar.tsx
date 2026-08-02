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
  allSelected: boolean;
  onToggleAll: () => void;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  onClearSelection: () => void;
}

/**
 * Status filter, sort, and the batch bar that appears once rows are selected.
 *
 * The filter is a single control on purpose: the previous page had status chips
 * *and* a "hide rejected" checkbox, which could disagree — picking "rejected 1"
 * with the checkbox on listed zero rows while the chip still said one.
 */
export function TensionReviewToolbar({
  counts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectedCount,
  allSelected,
  onToggleAll,
  onBatchApprove,
  onBatchReject,
  onClearSelection,
}: Props) {
  const { t } = useTranslation('analysis');

  return (
    <>
      <div className="tn-toolbar">
        <span className="tn-toolbar-label">{t('tension.reviewSummary')}</span>
        <div className="tn-filter-group" role="group" aria-label={t('tension.reviewSummary')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="tn-filter-btn"
              aria-pressed={filter === f}
              onClick={() => onFilterChange(f)}
            >
              {f === 'all' ? t('tension.all') : t(`tension.status.${f as ReviewStatus}`)} {counts[f]}
            </button>
          ))}
        </div>
        <span className="tn-toolbar-spacer" />
        <span className="tn-toolbar-label">{t('tension.toolbar.sortLabel')}</span>
        {SORTS.map((s) => (
          <button
            key={s}
            type="button"
            className="tn-sort-btn"
            aria-pressed={sort === s}
            onClick={() => onSortChange(s)}
          >
            {t(`tension.toolbar.sort${s[0].toUpperCase()}${s.slice(1)}`)}
          </button>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="tn-batch-bar">
          <span className="tn-batch-count">
            {t('tension.toolbar.selected', { count: selectedCount })}
          </span>
          <button type="button" className="tn-batch-ghost" onClick={onToggleAll}>
            {allSelected ? t('tension.table.clearAll') : t('tension.table.selectAll')}
          </button>
          <button type="button" className="tn-batch-primary" onClick={onBatchApprove}>
            {t('tension.toolbar.batchApprove')}
          </button>
          <button type="button" className="tn-batch-ghost" onClick={onBatchReject}>
            {t('tension.toolbar.batchReject')}
          </button>
          <span className="tn-toolbar-spacer" />
          <button type="button" className="tn-batch-dismiss" onClick={onClearSelection}>
            {t('tension.toolbar.clearSelection')}
          </button>
        </div>
      )}
    </>
  );
}
