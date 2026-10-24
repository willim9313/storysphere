import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { visibleSections, type ConfirmSection } from './confirmSections';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  /** The confirm action calls the LLM and spends tokens — draws the sparkles
   *  glyph on the execute button. Zero-cost confirms leave it off: the absence
   *  of the glyph is itself the "free" signal. */
  spendsTokens?: boolean;
  /** Loss-list variant: what the action removes, itemised between the body
   *  and the buttons. Nothing else about the dialog changes. */
  items?: string[];
  /** Titled lists (「會失去：」＋項目、「會連帶過期：」＋項目) rendered after `items`
   *  when both are given. A section with no items is not rendered at all. */
  sections?: ConfirmSection[];
  /** Badge beside the title (info = zero cost, warning = spends tokens). */
  titleBadge?: { label: string; tone: 'info' | 'warning' };
  /** Plain-text cost note on the left of the button row (2xs muted). Text only —
   *  no sparkles; the glyph stays on the execute button via `spendsTokens`. */
  costHint?: string;
  /** Destructive confirm — `.ss-btn-danger` instead of primary. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  spendsTokens = false,
  items,
  sections,
  costHint,
  titleBadge,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation('common');

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="ss-dialog" onClose={onCancel}>
      <div className="ss-dialog-body">
        {titleBadge ? (
          <div className="ss-dialog-title-row">
            <h3 className="ss-dialog-title">{title}</h3>
            <span className={`ss-badge ss-badge-${titleBadge.tone}`}>{titleBadge.label}</span>
          </div>
        ) : (
          <h3 className="ss-dialog-title">{title}</h3>
        )}
        <p className="ss-dialog-text">{message}</p>
        {items && items.length > 0 && (
          <ul className="ss-dialog-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {visibleSections(sections).map((section) => (
          <div key={section.title} className="ss-dialog-section">
            <p className="ss-dialog-section-title">{section.title}</p>
            <ul className="ss-dialog-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="ss-dialog-actions">
          {costHint && <span className="ss-dialog-cost">{costHint}</span>}
          <button className="ss-btn ss-btn-md ss-btn-ghost" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            className={`ss-btn ss-btn-md ${danger ? 'ss-btn-danger' : 'ss-btn-primary'}${spendsTokens ? ' ss-btn-llm' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
