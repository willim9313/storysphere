import { useCallback, useEffect, useState } from 'react';

/**
 * Focus management for a modal drawer: move focus in on open, trap Tab inside,
 * hand focus back on close.
 *
 * Why not a native <dialog> + showModal(): these drawers only cover the content
 * area, and the left rail has to stay visible. showModal() makes everything
 * outside the dialog inert and paints a full-viewport top layer, which is
 * exactly what we don't want. So the drawer stays an `<aside role="dialog"
 * aria-modal="true">` and this hook supplies the behaviour the role promises.
 *
 * Usage: attach the returned callback ref to the container and give the
 * container `aria-labelledby` pointing at a title element with `tabIndex={-1}`.
 * That title receives focus on open (falls back to the container itself, which
 * is made programmatically focusable). A callback ref (stored in state) is used
 * rather than a RefObject because the drawers render `null` while closed or
 * while their data is missing; the effect has to re-run when the node appears.
 */
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('tabindex') !== '-1' &&
      el.getAttribute('aria-hidden') !== 'true',
  );
}

export function useDialogFocus(open: boolean): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!open || !node) return;
    const previous = document.activeElement as HTMLElement | null;

    const titleId = node.getAttribute('aria-labelledby');
    const title = titleId ? document.getElementById(titleId) : null;
    if (title) {
      title.focus();
    } else {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
      node.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusableIn(node);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inList = active != null && items.includes(active);
      if (e.shiftKey && (!inList || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (inList ? active === last : !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open, node]);

  return ref;
}
