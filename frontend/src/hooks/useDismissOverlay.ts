import { useCallback, useEffect, type RefObject } from 'react';
import { useEscapeKey } from './useEscapeKey';

/**
 * Dismiss a popover / menu / drawer on Escape or a mousedown outside it.
 *
 * `containerRef` wraps both the trigger and the popup, so clicking the trigger
 * is "inside" (the trigger's own onClick toggles; we must not close first and
 * have it re-open). On Escape, focus returns to `triggerRef` so keyboard users
 * land where they started; an outside click leaves focus where the user put it.
 */
export function useDismissOverlay(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  const onEscape = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose, triggerRef]);
  useEscapeKey(open, onEscape);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, containerRef]);
}
