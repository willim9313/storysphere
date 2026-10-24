import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RAIL, toastBottom, useFloatRail } from '@/contexts/FloatRailContext';

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
  /** Never auto-dismiss — only the close button removes it. For a result the
   *  reader must not miss, e.g. a batch run that had failures (its list lives
   *  in the page's persistent panel; the toast only says how many). */
  persist?: boolean;
}

export interface PushToastInput {
  type: ToastType;
  title: string;
  body?: string;
  action?: ToastAction;
  dedupeKey?: string;
  persist?: boolean;
}

/** Auto-dismiss delays (ms). Toasts with an action linger longer so the user
 *  has time to click through. Three lifetimes: 5.2s / 9s / persist. */
const DISMISS_MS = 5200;
const DISMISS_WITH_ACTION_MS = 9000;

interface ToastDispatch {
  push: (toast: PushToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastStateContext = createContext<Toast[]>([]);
/** The stack's `bottom` (px). Chosen when the stack goes from empty to
 *  non-empty and held until it empties again — a toast must not jump while
 *  it is being read (floating rail R2). */
const ToastAnchorContext = createContext<number>(RAIL.slots[0]);
const ToastDispatchContext = createContext<ToastDispatch | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const liveKeysRef = useRef<Set<string>>(new Set());
  const liveIdsRef = useRef<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number>(RAIL.slots[0]);
  const rail = useFloatRail();

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    liveIdsRef.current.delete(id);
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
      if (liveIdsRef.current.size === 0) {
        setAnchor(toastBottom(rail.read(), window.innerWidth, window.innerHeight));
      }
      liveIdsRef.current.add(id);
      setToasts((prev) => [...prev, { ...input, id }]);
      if (input.persist) return;
      const delay = input.action ? DISMISS_WITH_ACTION_MS : DISMISS_MS;
      const timer = setTimeout(() => dismiss(id), delay);
      timersRef.current.set(id, timer);
    },
    [dismiss, rail],
  );

  const dispatch = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastDispatchContext.Provider value={dispatch}>
      <ToastStateContext.Provider value={toasts}>
        <ToastAnchorContext.Provider value={anchor}>{children}</ToastAnchorContext.Provider>
      </ToastStateContext.Provider>
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

// eslint-disable-next-line react-refresh/only-export-components
export function useToastAnchor(): number {
  return useContext(ToastAnchorContext);
}

const NO_OP_DISPATCH: ToastDispatch = { push: () => {}, dismiss: () => {} };
