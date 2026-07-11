import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';
import { useToast, useToastState, type Toast, type ToastType } from '@/contexts/ToastContext';

const ICONS: Record<ToastType, typeof Check> = {
  success: Check,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

function ToastRow({ toast, onDismiss }: Readonly<{ toast: Toast; onDismiss: (id: number) => void }>) {
  const Icon = ICONS[toast.type];
  const fg = `var(--color-${toast.type})`;
  const bg = `var(--color-${toast.type}-bg)`;
  return (
    <div
      className="toast-row"
      style={{
        width: '100%',
        display: 'flex',
        gap: 11,
        alignItems: 'flex-start',
        padding: '13px 14px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${fg}`,
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: bg,
          color: fg,
        }}
      >
        <Icon size={15} strokeWidth={2.1} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 13px/1.4 var(--font-sans)', color: 'var(--fg-primary)' }}>
          {toast.title}
        </div>
        {toast.body && (
          <div
            style={{
              font: '400 12px/1.5 var(--font-sans)',
              color: 'var(--fg-secondary)',
              marginTop: 2,
            }}
          >
            {toast.body}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            style={{
              marginTop: 9,
              font: '600 12px/1 var(--font-sans)',
              color: fg,
              background: 'transparent',
              border: `1px solid ${fg}`,
              borderRadius: 'var(--btn-radius)',
              padding: '6px 11px',
              cursor: 'pointer',
            }}
          >
            {toast.action.label} →
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="關閉"
        style={{
          flex: 'none',
          border: 'none',
          background: 'transparent',
          color: 'var(--fg-muted)',
          cursor: 'pointer',
          padding: 2,
          lineHeight: 0,
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToastState();
  const { dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 340,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <style>{TOAST_STYLES}</style>
      {toasts.map((t) => (
        <div key={t.id} className="toast-anim" style={{ width: '100%', pointerEvents: 'auto' }}>
          <ToastRow toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

// Slide-in is the finalized entrance (design canvas). Reduced-motion users get
// the toast with no transform animation.
const TOAST_STYLES = `
@keyframes toastSlide { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
.toast-anim { animation: toastSlide 280ms ease; }
@media (prefers-reduced-motion: reduce) { .toast-anim { animation: none; } }
`;
