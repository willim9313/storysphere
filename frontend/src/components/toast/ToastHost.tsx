import { useTranslation } from 'react-i18next';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useToast, useToastAnchor, useToastState, type Toast, type ToastType } from '@/contexts/ToastContext';
import { RAIL } from '@/contexts/FloatRailContext';

// Status is encoded twice — disc colour AND glyph shape — so Ink, where every
// status collapses to one ink, still reads. error shares warning's triangle:
// the components-toast spec card draws three shapes, not four.
const ICONS: Record<ToastType, typeof Check> = {
  success: Check,
  warning: TriangleAlert,
  error: TriangleAlert,
  info: Info,
};

function ToastRow({ toast, onDismiss }: Readonly<{ toast: Toast; onDismiss: (id: number) => void }>) {
  const { t } = useTranslation('common');
  const Icon = ICONS[toast.type];
  return (
    <div className="ss-toast">
      <span className={`ss-toast-disc ss-toast-disc-${toast.type}`}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="ss-toast-main">
        <div className="ss-toast-title">{toast.title}</div>
        {toast.body && <div className="ss-toast-body">{toast.body}</div>}
        {toast.action && (
          <button
            type="button"
            className="ss-btn ss-btn-sm ss-btn-secondary ss-toast-action"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label} →
          </button>
        )}
      </div>
      <button
        type="button"
        className="ss-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label={t('close')}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToastState();
  const { dismiss } = useToast();
  const bottom = useToastAnchor();
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: RAIL.right,
        bottom,
        zIndex: RAIL.z.toast,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        width: RAIL.width,
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
