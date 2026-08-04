import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  /** Lines that would be discarded, by review state. */
  totalLines: number;
  approvedCount: number;
  editedCount: number;
  /** A theme exists and cites these lines, so it goes stale too. */
  themeAffected: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for re-running Step 2.
 *
 * Not the shared ConfirmDialog: the point of this one is the itemised loss
 * list, which has to be counted from the current lines. Re-grouping mints new
 * line ids, so every approval and every rewritten label is discarded — the
 * previous UI said only "this will overwrite existing results", which does not
 * convey that half an hour of review is about to be thrown away.
 */
export function TensionRerunDialog({
  open,
  totalLines,
  approvedCount,
  editedCount,
  themeAffected,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation('analysis');
  if (!open) return null;

  const losses = [t('tension.rerun.lossLines', { count: totalLines })];
  if (approvedCount > 0) losses.push(t('tension.rerun.lossApproved', { count: approvedCount }));
  if (editedCount > 0) losses.push(t('tension.rerun.lossEdited', { count: editedCount }));

  return (
    // Flat scrim, no backdrop-filter — the design system forbids it.
    <div className="tn-modal-scrim" role="presentation" onClick={onCancel}>
      <div
        className="tn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tn-rerun-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tn-modal-head">
          <Sparkles size={17} />
          <span id="tn-rerun-title">{t('tension.rerun.title')}</span>
        </div>
        <p className="tn-modal-body">{t('tension.rerun.body')}</p>

        <div className="tn-modal-loss">
          <div>
            <b>{t('tension.rerun.willLose')}</b>
            {losses.join(t('tension.rerun.separator'))}
          </div>
          {themeAffected && (
            <div>
              <b>{t('tension.rerun.willStale')}</b>
              {t('tension.rerun.willStaleBody')}
            </div>
          )}
        </div>

        <div className="tn-modal-actions">
          <button type="button" className="tn-act-ghost" onClick={onCancel}>
            {t('tension.rerun.cancel')}
          </button>
          <button type="button" className="tn-modal-danger" onClick={onConfirm}>
            {t('tension.rerun.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
