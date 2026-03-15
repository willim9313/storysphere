import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確認',
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
        backgroundColor: 'white',
        color: 'var(--fg-primary)',
        border: '1px solid var(--border)',
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
          <button onClick={onCancel} style={{ color: 'var(--fg-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
