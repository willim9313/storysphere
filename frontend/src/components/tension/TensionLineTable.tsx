import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import { relativeIntensity } from './intensity';
import { formatChapters, type ReviewStatus, type TensionLineDetail } from './reviewTypes';

const BADGE: Record<ReviewStatus, string> = {
  pending: 'ss-badge-warning',
  approved: 'ss-badge-success',
  modified: 'ss-badge-info',
  rejected: 'ss-badge-error',
};

interface Props {
  rows: TensionLineDetail[];
  /** Every line's intensity, filtered or not — see `scale` below. */
  allIntensities: number[];
  totalCount: number;
  selected: Set<string>;
  openId: string | null;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  /** 'pending' is the initial state, not something a reviewer can set. */
  onReview: (id: string, status: Exclude<ReviewStatus, 'pending'>) => void;
  onEditLabels: (id: string) => void;
  onShowAll: () => void;
}

export function TensionLineTable({
  rows,
  allIntensities,
  totalCount,
  selected,
  openId,
  onOpen,
  onToggleSelect,
  onToggleAll,
  onReview,
  onEditLabels,
  onShowAll,
}: Readonly<Props>) {
  const { t } = useTranslation('analysis');

  // Bands rank each line against the whole book, not the filtered subset —
  // otherwise filtering would silently re-scale every bar.
  const scale = relativeIntensity(allIntensities);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
  let headState: 'on' | 'partial' | 'off' = 'off';
  if (allSelected) headState = 'on';
  else if (someSelected) headState = 'partial';

  return (
    <div className="tn-table">
      <div className="tn-table-head">
        <button
          type="button"
          className="tn-check"
          data-state={headState}
          aria-label={allSelected ? t('tension.table.clearAll') : t('tension.table.selectAll')}
          onClick={onToggleAll}
        >
          {headState === 'on' && <Check size={9} strokeWidth={3.5} />}
          {headState === 'partial' && <Minus size={9} strokeWidth={3.5} />}
        </button>
        <span>{t('tension.table.colPoles')}</span>
        <span>{t('tension.table.colChapters')}</span>
        <span>{t('tension.table.colEvidence')}</span>
        <span>{t('tension.table.colIntensity')}</span>
        <span>{t('tension.table.colStatus')}</span>
        <span className="tn-col-right">{t('tension.table.colReview')}</span>
      </div>

      {rows.map((line) => {
        const band = scale(line.intensity_summary);
        const isSelected = selected.has(line.id);
        return (
          <div
            key={line.id}
            className="tn-row"
            data-open={line.id === openId}
            data-selected={isSelected}
            data-rejected={line.review_status === 'rejected'}
            onClick={() => onOpen(line.id)}
          >
            <button
              type="button"
              className="tn-check"
              data-state={isSelected ? 'on' : 'off'}
              aria-label={`${line.canonical_pole_a} vs ${line.canonical_pole_b}`}
              aria-pressed={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(line.id);
              }}
            >
              {isSelected ? <Check size={9} strokeWidth={3.5} /> : null}
            </button>

            {/* The only tab stop that opens the row. Deliberately handler-free:
                a native button fires click on Enter/Space, which bubbles to the
                row; its own onClick would toggle the drawer twice. */}
            <button type="button" className="tn-row-poles">
              {line.canonical_pole_a}
              <span className="tn-vs">vs</span>
              {line.canonical_pole_b}
            </button>

            <span className="tn-row-chapters">{formatChapters(line)}</span>

            <span className="tn-row-evidence">
              {t('tension.table.evidenceCount', { count: line.teus?.length ?? 0 })}
            </span>

            <span className="tn-row-intensity">
              <span className="tn-bar" aria-hidden="true">
                <span
                  className="tn-bar-fill"
                  data-band={band.bucket}
                  style={{ width: `${band.widthPct}%` }}
                />
              </span>
              <span className="tn-meta-mono tn-nowrap">
                {band.label} {t(`tension.table.band${band.bucket[0].toUpperCase()}${band.bucket.slice(1)}`)}
              </span>
            </span>

            <span className={`ss-badge ${BADGE[line.review_status]} tn-row-status`}>
              {t(`tension.status.${line.review_status}`)}
            </span>

            <span className="tn-row-actions">
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(line.id, 'approved');
                }}
              >
                {t('tension.approve')}
              </button>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditLabels(line.id);
                }}
              >
                {t('tension.modifyLabel')}
              </button>
              <button
                type="button"
                className="ss-btn ss-btn-sm ss-btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(line.id, 'rejected');
                }}
              >
                {t('tension.reject')}
              </button>
            </span>
          </div>
        );
      })}

      {/* Lightest empty weight: one line and one ghost button, no stage. */}
      {rows.length === 0 && (
        <div className="tn-empty-line">
          <span>{t('tension.table.empty')}</span>
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" onClick={onShowAll}>
            {t('tension.table.showAll', { count: totalCount })}
          </button>
        </div>
      )}
    </div>
  );
}
