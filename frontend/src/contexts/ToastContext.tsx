import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  body?: string;
  action?: ToastAction;
  /** Stable de-dupe key: a second push with the same key is ignored while the
   *  first is still visible. Used by task-transition notifications so one task
   *  reaching `done` can't stack duplicate toasts across polls. */
  dedupeKey?: string;
}

export interface PushToastInput {
  type: ToastType;
  title: string;
  body?: string;
  action?: ToastAction;
  dedupeKey?: string;
}

/** Auto-dismiss delays (ms). Toasts with an action linger longer so the user
 *  has time to click through. Mirrors the design prototype (5.2s / 9s). */
const DISMISS_MS = 5200;
const DISMISS_WITH_ACTION_MS = 9000;

interface ToastDispatch {
  push: (toast: PushToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastStateContext = createContext<Toast[]>([]);
const ToastDispatchContext = createContext<ToastDispatch | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const liveKeysRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => {
      const gone = prev.find((t) => t.id === id);
      if (gone?.dedupeKey) liveKeysRef.current.delete(gone.dedupeKey);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const push = useCallback(
    (input: PushToastInput) => {
      if (input.dedupeKey && liveKeysRef.current.has(input.dedupeKey)) return;
      const id = seqRef.current++;
      if (input.dedupeKey) liveKeysRef.current.add(input.dedupeKey);
      setToasts((prev) => [...prev, { ...input, id }]);
      const delay = input.action ? DISMISS_WITH_ACTION_MS : DISMISS_MS;
      const timer = setTimeout(() => dismiss(id), delay);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const dispatch = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastDispatchContext.Provider value={dispatch}>
      <ToastStateContext.Provider value={toasts}>{children}</ToastStateContext.Provider>
    </ToastDispatchContext.Provider>
  );
}

// Hooks co-located with their provider (intentional); only affects HMR granularity.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastDispatch {
  const ctx = useContext(ToastDispatchContext);
  if (ctx === null) {
    // No-op outside a provider so consumers never crash (e.g. in isolated tests).
    return NO_OP_DISPATCH;
  }
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToastState(): Toast[] {
  return useContext(ToastStateContext);
}

const NO_OP_DISPATCH: ToastDispatch = { push: () => {}, dismiss: () => {} };
