import { useEffect } from 'react';

/**
 * Close-on-Escape for an overlay that is already conditionally mounted or
 * gated by an `open` flag.
 *
 * The listener is only attached while `active` is true, so a stack of closed
 * drawers doesn't leave a pile of dead handlers on `window`, and whichever
 * overlays *are* open all get the key (there is no stopPropagation here).
 *
 * Deliberately narrow. Three callers that wanted exactly this had the same
 * seven lines copy-pasted; the ones that are *not* using it need something
 * genuinely different, and folding them in would have made this worse:
 *
 *   - ArchetypeFilterDropdown listens in the capture phase and calls
 *     stopPropagation, specifically so its Esc does not also reach the
 *     framework-compare drawer behind it.
 *   - SearchDropdown handles Esc as one branch of a larger arrow-key
 *     navigation handler.
 *   - EntityCard listens on `document` and shares one effect with its
 *     click-outside handler.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}
