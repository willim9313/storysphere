import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl p-0 backdrop:bg-black/40"
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
        maxWidth: '400px',
        width: '90vw',
      }}
      onClose={onCancel}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {title}
          </h3>
          <button onClick={onCancel} style={{ color: 'var(--color-text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
