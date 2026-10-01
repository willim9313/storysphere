import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  /** The confirm action calls the LLM and spends tokens — draws the sparkles
   *  glyph on the execute button. Zero-cost confirms leave it off: the absence
   *  of the glyph is itself the "free" signal. */
  spendsTokens?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  spendsTokens = false,
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
        <h3 className="ss-dialog-title">{title}</h3>
        <p className="ss-dialog-text">{message}</p>
        <div className="ss-dialog-actions">
          <button className="ss-btn ss-btn-md ss-btn-ghost" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            className={`ss-btn ss-btn-md ss-btn-primary${spendsTokens ? ' ss-btn-llm' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
