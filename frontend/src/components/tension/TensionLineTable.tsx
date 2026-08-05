import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import { relativeIntensity } from './intensity';
import { formatChapters, type ReviewStatus, type TensionLineDetail } from './reviewTypes';

interface Props {
  rows: TensionLineDetail[];
  /** Every line's intensity, filtered or not — see `scale` below. */
  allIntensities: number[];
  totalCount: number;
  selected: Set<string>;
  openId: string | null;
  cursorId: string | null;
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
  cursorId,
  onOpen,
  onToggleSelect,
  onToggleAll,
  onReview,
  onEditLabels,
  onShowAll,
}: Props) {
  const { t } = useTranslation('analysis');

  // Bands rank each line against the whole book, not the filtered subset —
  // otherwise filtering to "pending" would silently re-scale every bar and the
  // same line would look strong in one view and weak in another.
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
          {headState === 'on' && <Check size={10} />}
          {headState === 'partial' && <Minus size={10} />}
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
            data-cursor={line.id === cursorId}
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
              {isSelected ? <Check size={10} /> : null}
            </button>

            {/* The only tab stop that opens the row — the old page had two per
                row pointing at the same action. Deliberately handler-free: a
                native button fires click on Enter/Space, which bubbles to the
                row. Giving it its own onClick would toggle the drawer twice and
                close it again on every click. */}
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
              <i className="tn-bar" aria-hidden="true">
                <i
                  className="tn-bar-fill"
                  data-band={band.bucket}
                  style={{ width: `${band.widthPct}%` }}
                />
              </i>
              <span className="tn-bar-value">
                {band.label} {t(`tension.table.band${band.bucket[0].toUpperCase()}${band.bucket.slice(1)}`)}
              </span>
            </span>

            <span className="tn-status-badge" data-s={line.review_status}>
              {t(`tension.status.${line.review_status}`)}
            </span>

            <span className="tn-row-actions">
              <button
                type="button"
                className="tn-act-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(line.id, 'approved');
                }}
              >
                {t('tension.approve')}
              </button>
              <button
                type="button"
                className="tn-act-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditLabels(line.id);
                }}
              >
                {t('tension.modifyLabel')}
              </button>
              <button
                type="button"
                className="tn-act-ghost"
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

      {rows.length === 0 && (
        <div className="tn-table-empty">
          {t('tension.table.empty')}
          <button type="button" className="tn-link-btn" onClick={onShowAll}>
            {t('tension.table.showAll', { count: totalCount })}
          </button>
        </div>
      )}
    </div>
  );
}
